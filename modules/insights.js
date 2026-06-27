// ============================================================
// M15 Camada 1 — Memória/Inteligência do SITE
// O "olho" da IA Gestora: registra comportamento dos visitantes
// (buscas, produtos vistos, add ao carrinho) e monta um DOSSIÊ
// agregado — pré-calculado p/ responder rápido.
//
// Sem PII: guarda só termo buscado / id de produto / timestamp.
// ============================================================

const { db } = require('../db');

// ── Tabela de eventos de comportamento ──────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS behavior_events (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,            -- search | view | add_cart
  ref  TEXT,                     -- termo buscado OU product_id
  ts   INTEGER NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_beh_type_ts ON behavior_events(type, ts)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_beh_ref ON behavior_events(ref)`);

const insEvent = db.prepare('INSERT INTO behavior_events (type, ref, ts) VALUES (?,?,?)');

const VALID = new Set(['search', 'view', 'add_cart']);

// anti-flood simples por IP (evita encher o banco)
const lastByIp = new Map();
function tooFast(ip) {
  const now = Date.now();
  const arr = (lastByIp.get(ip) || []).filter(t => now - t < 10000);
  arr.push(now);
  lastByIp.set(ip, arr);
  return arr.length > 40; // máx 40 eventos / 10s por IP
}

// ── Dossiê pré-calculado (cache curto p/ responder rápido) ───
let dossieCache = { ts: 0, data: null };

function buildDossie(days = 30) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const topN = (type, n = 12) => db.prepare(
    `SELECT ref, COUNT(*) AS n FROM behavior_events
     WHERE type = ? AND ts > ? AND ref IS NOT NULL AND ref != ''
     GROUP BY ref ORDER BY n DESC LIMIT ?`
  ).all(type, since, n);

  // horários de pico (hora local do servidor)
  const porHora = db.prepare(
    `SELECT CAST(strftime('%H', ts/1000, 'unixepoch', 'localtime') AS INTEGER) AS hora,
            COUNT(*) AS n FROM behavior_events WHERE ts > ? GROUP BY hora ORDER BY hora`
  ).all(since);

  const buscas    = topN('search');
  const vistos    = topN('view');
  const addCarrinho = topN('add_cart');

  // cruzamento: muito visto × pouco add ao carrinho (oportunidade)
  const viewMap = Object.fromEntries(vistos.map(v => [v.ref, v.n]));
  const cartMap = Object.fromEntries(addCarrinho.map(v => [v.ref, v.n]));
  const oportunidades = Object.keys(viewMap)
    .map(id => ({ id, views: viewMap[id], carts: cartMap[id] || 0,
                  conversao: viewMap[id] ? Math.round(((cartMap[id] || 0) / viewMap[id]) * 100) : 0 }))
    .filter(o => o.views >= 5 && o.conversao < 30)
    .sort((a, b) => b.views - a.views);

  // pedidos & abandono (do que já existe no banco)
  let pedidos = 0, abandono = 0, faturamento = 0;
  try { pedidos = db.prepare(`SELECT COUNT(*) c FROM orders WHERE created_at > ?`).get(new Date(since).toISOString()).c; } catch {}
  try { faturamento = db.prepare(`SELECT COALESCE(SUM(total),0) s FROM orders WHERE created_at > ?`).get(new Date(since).toISOString()).s; } catch {}
  try { abandono = db.prepare(`SELECT COUNT(*) c FROM abandoned_carts`).get().c; } catch {}

  const totalEventos = db.prepare(`SELECT COUNT(*) c FROM behavior_events WHERE ts > ?`).get(since).c;

  return {
    periodo_dias: days,
    gerado_em: new Date().toISOString(),
    resumo: { eventos: totalEventos, pedidos, faturamento, carrinhos_abandonados: abandono },
    buscas_top: buscas,
    produtos_vistos: vistos,
    produtos_add_carrinho: addCarrinho,
    oportunidades,          // muito visto, pouco convertido
    horarios_pico: porHora
  };
}

function getDossie(days = 30, force = false) {
  if (!force && dossieCache.data && Date.now() - dossieCache.ts < 5 * 60 * 1000 && dossieCache.days === days) {
    return dossieCache.data;
  }
  const data = buildDossie(days);
  dossieCache = { ts: Date.now(), days, data };
  return data;
}

// ── Cérebro: Claude conversa sobre o dossiê (rápido pq o dossiê já está pronto) ──
// Aceita o histórico da conversa (array {role,content}) OU uma pergunta única
// (string, modo legado). Com o histórico, a IA lembra do que já foi dito.
async function perguntarIA(payload, days) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('SEM_CREDITO_OU_CHAVE');
  const dossie = getDossie(days || 30);
  const system = [
    'Você é a IA Gestora de Marketing da TopFood Embalagens (embalagens food service: pastel, churros, hambúrguer, batata frita).',
    'Você está num CHAT com o dono (Wellington): a conversa tem histórico, então leve em conta o que já foi dito e responda de forma encadeada, sem repetir o que já explicou.',
    'Responda em português do Brasil, DIRETO e prático, com dados e recomendações acionáveis. Use listas curtas e números quando ajudar.',
    'Verba de marketing aprovada: R$ 3.000/mês (~R$ 100/dia) somando Google + Meta + TikTok.',
    'Estratégia de verba: fase de teste (espalhar pouco, achar o que converte) → concentrar no que traz cliente mais barato.',
    'IMPORTANTE: baseie-se SOMENTE no dossiê abaixo (comportamento real do site nos últimos dias). Se ainda não houver dados de anúncios, deixe claro que as campanhas ainda não rodaram e foque no que dá pra ver do site.',
    'Nunca invente números que não estão no dossiê.',
    '',
    'DOSSIÊ ATUAL (JSON):',
    JSON.stringify(dossie)
  ].join('\n');

  // Monta as mensagens: histórico de chat ou pergunta única
  let messages;
  if (Array.isArray(payload)) {
    const limpos = payload
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      .slice(-20);                       // só as últimas 20 trocas (limita custo)
    // Claude exige alternância estrita user/assistant — junta papéis repetidos
    // seguidos (acontece se uma resposta veio vazia e foi filtrada).
    messages = [];
    for (const m of limpos) {
      const ult = messages[messages.length - 1];
      if (ult && ult.role === m.role) ult.content += '\n' + m.content;
      else messages.push({ role: m.role, content: m.content });
    }
    while (messages.length && messages[0].role !== 'user') messages.shift(); // e começar em 'user'
  } else {
    messages = [{ role: 'user', content: String(payload || 'Faça um resumo do que está acontecendo no site e o que devo priorizar.') }];
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: 'Continue.' });
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system,
      messages
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 400 && /credit/i.test(txt)) throw new Error('SEM_CREDITO_OU_CHAVE');
    throw new Error('Claude ' + r.status + ': ' + txt.slice(0, 150));
  }
  const data = await r.json();
  return (data.content || []).map(b => b.text || '').join('').trim();
}

// ── Rotas ───────────────────────────────────────────────────
function registerInsightsRoutes(app, requireAuth) {
  // Público — o site manda os eventos de comportamento
  app.post('/api/track', (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.ip || 'x';
      if (tooFast(ip)) return res.json({ ok: true }); // ignora flood silenciosamente
      const type = String((req.body && req.body.type) || '');
      if (!VALID.has(type)) return res.json({ ok: true });
      let ref = String((req.body && req.body.ref) || '').trim().slice(0, 80).toLowerCase();
      if (!ref) return res.json({ ok: true });
      insEvent.run(type, ref, Date.now());
      res.json({ ok: true });
    } catch (e) { res.json({ ok: true }); } // nunca quebrar a navegação por causa de track
  });

  // Painel — o DOSSIÊ pronto (a "memória do site")
  app.get('/api/eco/insights', requireAuth, (req, res) => {
    try {
      const days = Math.min(180, Math.max(1, parseInt(req.query.days) || 30));
      res.json(getDossie(days, req.query.force === '1'));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Painel — pergunta livre à IA Gestora (responde com base no dossiê)
  app.post('/api/eco/insights/perguntar', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      // chat: manda o histórico em body.messages; legado: body.pergunta (string)
      const payload = Array.isArray(body.messages) ? body.messages : (body.pergunta || '');
      const resposta = await perguntarIA(payload, body.days || 30);
      res.json({ ok: true, resposta });
    } catch (e) {
      if (e.message === 'SEM_CREDITO_OU_CHAVE') {
        return res.json({ ok: false, semCredito: true,
          resposta: 'A IA precisa de créditos da Anthropic para analisar. Assim que os créditos forem adicionados (previsto p/ segunda), ela responde aqui. Os dados já estão sendo coletados normalmente — veja o dossiê acima.' });
      }
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[M15] Insights do site registrado: POST /api/track + GET /api/eco/insights + perguntar');
}

module.exports = { registerInsightsRoutes, getDossie };
