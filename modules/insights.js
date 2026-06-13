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

  console.log('[M15] Insights do site registrado: POST /api/track + GET /api/eco/insights');
}

module.exports = { registerInsightsRoutes, getDossie };
