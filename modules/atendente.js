// ============================================================
// M5 — IA ATENDENTE 24h via WhatsApp (Baileys + Claude API)
// TopFood Embalagens — Ecossistema v3.0
//
// Regras de negócio (Lei de UX do projeto):
//  - IA sugere, Wellington aprova: o bot NUNCA confirma pagamento,
//    NUNCA dá desconto, NUNCA fecha pedido sozinho.
//  - Pedido/pagamento => direciona para o site (checkout).
//  - Cliente pede humano OU IA insegura => pausa o chat e avisa
//    o número do Wellington no próprio WhatsApp.
//  - Se um humano responder manualmente pelo número conectado,
//    a IA pausa naquele chat por 6 horas (takeover automático).
//
// Dependências (instalar na VPS):
//   npm i @whiskeysockets/baileys qrcode pino
// .env necessário:
//   ANTHROPIC_API_KEY=sk-ant-...
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_DIR = path.join(DATA_DIR, 'wa_auth');          // credenciais Baileys
const CFG_FILE = path.join(DATA_DIR, 'atendente.json');    // config persistente
const LOG_FILE = path.join(DATA_DIR, 'atendente_log.json'); // últimas conversas

const CLAUDE_MODEL = 'claude-haiku-4-5';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MAX_LOG = 500;            // mensagens guardadas no log
const MAX_CTX = 12;             // mensagens de contexto por chat enviadas à IA
const HUMAN_PAUSE_MS = 6 * 60 * 60 * 1000; // 6h de pausa após takeover humano
const REPLY_COOLDOWN_MS = 3000; // anti-flood por chat
const SITE = 'https://topfoodembalagens.com.br';

// ------------------------------------------------------------
// Estado
// ------------------------------------------------------------
let sock = null;                // socket Baileys
let lastQR = null;              // último QR (string) p/ parear
let connState = 'desconectado'; // desconectado | aguardando_qr | conectado
let starting = false;
let catalogCache = { ts: 0, text: '' };
const chatContext = new Map();  // jid -> [{role, content}]
const lastReplyAt = new Map();  // jid -> timestamp (cooldown)

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

let cfg = loadJSON(CFG_FILE, {
  enabled: false,               // IA responde? (liga/desliga geral)
  autostart: false,             // reconectar sozinho no boot do PM2
  promptExtra: '',              // instruções extras editáveis no admin
  notifyNumber: '5511988856367',// avisa o Wellington (escalação)
  pausedChats: {},              // jid -> { until: ts, reason }
  stats: { recebidas: 0, respondidas: 0, escaladas: 0 }
});
function saveCfg() { saveJSON(CFG_FILE, cfg); }

let log = loadJSON(LOG_FILE, []);
function addLog(entry) {
  log.push({ ts: Date.now(), ...entry });
  if (log.length > MAX_LOG) log = log.slice(-MAX_LOG);
  saveJSON(LOG_FILE, log);
}

// ------------------------------------------------------------
// Catálogo — lê do feed Meta já existente (M1), zero acoplamento
// ------------------------------------------------------------
async function getCatalogText() {
  if (Date.now() - catalogCache.ts < 10 * 60 * 1000) return catalogCache.text;
  try {
    const r = await fetch('http://localhost:3000/feed-meta.json');
    const feed = await r.json();
    const items = Array.isArray(feed) ? feed : (feed.data || feed.products || []);
    const lines = items.map(p => {
      const nome = p.title || p.name || '';
      const preco = p.price || '';
      const disp = (p.availability || '').includes('out') ? ' (SEM ESTOQUE)' : '';
      const link = p.link || '';
      return `- ${nome} — ${preco}${disp} — ${link}`;
    }).filter(l => l.length > 5);
    catalogCache = { ts: Date.now(), text: lines.join('\n') };
  } catch (e) {
    console.error('[M5] Falha ao ler catálogo:', e.message);
    if (!catalogCache.text) catalogCache.text = '(catálogo indisponível no momento — peça para o cliente ver o site)';
  }
  return catalogCache.text;
}

// ------------------------------------------------------------
// Claude
// ------------------------------------------------------------
async function askClaude(jid, userText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente no .env');

  const catalog = await getCatalogText();
  const system = [
    'Você é a atendente virtual da TopFood Embalagens (embalagens food service: pastel, churros, hambúrguer, batata frita).',
    `Site e checkout: ${SITE} — WhatsApp humano: (11) 98885-6367.`,
    'Endereço: R. Reinaldo Teixeira, 85 — Alvarenga, São Bernardo do Campo — SP.',
    'Responda SEMPRE em português do Brasil, tom simpático e direto, mensagens curtas (estilo WhatsApp, máx ~4 linhas), pode usar 1 emoji.',
    '',
    'CATÁLOGO ATUAL:', catalog, '',
    'REGRAS OBRIGATÓRIAS:',
    '1. NUNCA confirme pagamentos, NUNCA dê desconto, NUNCA negocie preço. Preço é o do catálogo.',
    `2. Para comprar: sempre direcione para o site ${SITE} (lá tem PIX e o pedido cai direto no sistema).`,
    '3. Se não souber a resposta, se o cliente reclamar, pedir orçamento personalizado/arte/quantidade fora do catálogo, ou pedir para falar com uma pessoa: responda EXATAMENTE começando com [HUMANO] seguido de uma frase educada avisando que vai chamar um atendente.',
    '4. Não invente prazos de entrega nem fretes — diga que o frete é calculado no site pelo CEP.',
    '5. Não fale sobre assuntos fora da TopFood.',
    cfg.promptExtra ? `\nINSTRUÇÕES EXTRAS DO DONO:\n${cfg.promptExtra}` : ''
  ].join('\n');

  const ctx = chatContext.get(jid) || [];
  ctx.push({ role: 'user', content: userText });
  while (ctx.length > MAX_CTX) ctx.shift();

  const r = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 400, system, messages: ctx })
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const reply = (data.content || []).map(b => b.text || '').join('').trim();
  ctx.push({ role: 'assistant', content: reply });
  chatContext.set(jid, ctx);
  return reply;
}

// ------------------------------------------------------------
// WhatsApp (Baileys)
// ------------------------------------------------------------
function isPaused(jid) {
  const p = cfg.pausedChats[jid];
  if (!p) return false;
  if (Date.now() > p.until) { delete cfg.pausedChats[jid]; saveCfg(); return false; }
  return true;
}
function pauseChat(jid, reason, ms = HUMAN_PAUSE_MS) {
  cfg.pausedChats[jid] = { until: Date.now() + ms, reason };
  saveCfg();
}

async function notifyOwner(text) {
  try {
    if (sock && cfg.notifyNumber) {
      await sock.sendMessage(cfg.notifyNumber + '@s.whatsapp.net', { text });
    }
  } catch (e) { console.error('[M5] Falha ao notificar dono:', e.message); }
}

async function startSock() {
  if (starting || (sock && connState === 'conectado')) return;
  starting = true;
  try {
    const baileys = require('@whiskeysockets/baileys');
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason } = baileys;
    const pino = require('pino');

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let paired = !!(state.creds.registered || state.creds.me); // já pareou alguma vez?

    // Versão atual do WA Web — sem isso o WhatsApp rejeita com 405
    const { version } = await baileys.fetchLatestBaileysVersion();

    sock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'warn' }),
      browser: ['TopFood Atendente', 'Chrome', '1.0']
    });
    connState = 'aguardando_qr';

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      if (u.qr) { lastQR = u.qr; connState = 'aguardando_qr'; }
      if (u.connection === 'open') {
        lastQR = null; connState = 'conectado'; paired = true;
        console.log('[M5] WhatsApp conectado ✅');
        addLog({ tipo: 'sistema', texto: 'WhatsApp conectado' });
      }
      if (u.connection === 'close') {
        connState = 'desconectado';
        const code = u.lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        // creds.registered vira true no momento do scan — reavaliar aqui, não usar só o snapshot do boot
        paired = paired || !!(state.creds.registered || state.creds.me);
        const restartRequired = code === DisconnectReason.restartRequired; // 515: WA exige reconectar p/ concluir pareamento
        console.log('[M5] Conexão fechada. code=', code, 'loggedOut=', loggedOut, 'pareado=', paired);
        sock = null;
        if (loggedOut) return;
        if (restartRequired) {
          // parte obrigatória do fluxo de pareamento — reconectar já
          setTimeout(() => startSock().catch(() => {}), 2000);
        } else if (cfg.autostart && paired) {
          setTimeout(() => startSock().catch(() => {}), 10000);
        }
        // não pareado e sem restartRequired: fica quieto (evita loop infinito de QR)
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        try { await handleMessage(m); } catch (e) { console.error('[M5] handleMessage:', e.message); }
      }
    });
  } finally {
    starting = false;
  }
}

async function handleMessage(m) {
  const jid = m.key.remoteJid || '';
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return; // ignora grupos/status

  const text = m.message?.conversation
    || m.message?.extendedTextMessage?.text
    || m.message?.imageMessage?.caption || '';

  // Takeover humano: dono respondeu manualmente nesse chat => IA pausa 6h
  if (m.key.fromMe) {
    if (text && !text.startsWith('🤖')) pauseChat(jid, 'humano assumiu');
    return;
  }
  if (!text.trim()) return;

  cfg.stats.recebidas++;
  addLog({ tipo: 'cliente', jid, texto: text.slice(0, 500) });

  if (!cfg.enabled || isPaused(jid)) { saveCfg(); return; }

  // cooldown anti-flood
  if (Date.now() - (lastReplyAt.get(jid) || 0) < REPLY_COOLDOWN_MS) return;
  lastReplyAt.set(jid, Date.now());

  let reply;
  try {
    reply = await askClaude(jid, text);
  } catch (e) {
    console.error('[M5] Claude falhou:', e.message);
    addLog({ tipo: 'erro', jid, texto: e.message });
    return; // silêncio é melhor que erro pro cliente
  }

  if (reply.startsWith('[HUMANO]')) {
    reply = '🤖 ' + reply.replace('[HUMANO]', '').trim();
    pauseChat(jid, 'escalado pela IA');
    cfg.stats.escaladas++;
    const num = jid.replace('@s.whatsapp.net', '');
    await notifyOwner(`⚠️ Atendente IA escalou um cliente!\nNúmero: ${num}\nÚltima msg: "${text.slice(0, 200)}"\nO chat está pausado para a IA — responda você.`);
  } else {
    reply = '🤖 ' + reply;
    cfg.stats.respondidas++;
  }
  saveCfg();

  await sock.sendMessage(jid, { text: reply });
  addLog({ tipo: 'ia', jid, texto: reply.slice(0, 500) });
}

// ------------------------------------------------------------
// Rotas — padrão do projeto: registerAtendenteRoutes(app, requireAuth)
// ------------------------------------------------------------
function registerAtendenteRoutes(app, requireAuth) {
  const guard = requireAuth;

  app.get('/api/eco/atendente/status', guard, (req, res) => {
    res.json({
      enabled: cfg.enabled,
      autostart: cfg.autostart,
      conexao: connState,
      temQR: !!lastQR,
      promptExtra: cfg.promptExtra,
      notifyNumber: cfg.notifyNumber,
      pausados: Object.keys(cfg.pausedChats).length,
      stats: cfg.stats,
      apiKeyOk: !!process.env.ANTHROPIC_API_KEY
    });
  });

  app.post('/api/eco/atendente/start', guard, async (req, res) => {
    try { await startSock(); res.json({ ok: true, conexao: connState }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/eco/atendente/stop', guard, async (req, res) => {
    cfg.autostart = false; saveCfg();
    try { if (sock) { await sock.end(); sock = null; } } catch {}
    connState = 'desconectado';
    res.json({ ok: true });
  });

  app.post('/api/eco/atendente/logout', guard, async (req, res) => {
    try { if (sock) { await sock.logout().catch(() => {}); sock = null; } } catch {}
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
    connState = 'desconectado'; lastQR = null;
    res.json({ ok: true, msg: 'Sessão removida. Inicie de novo para gerar novo QR.' });
  });

  app.get('/api/eco/atendente/qr', guard, async (req, res) => {
    if (!lastQR) return res.json({ qr: null, conexao: connState });
    try {
      const QRCode = require('qrcode');
      const dataUrl = await QRCode.toDataURL(lastQR, { width: 280 });
      res.json({ qr: dataUrl, conexao: connState });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/eco/atendente/conversas', guard, (req, res) => {
    res.json(log.slice(-100).reverse());
  });

  app.post('/api/eco/atendente/config', guard, (req, res) => {
    const { enabled, autostart, promptExtra, notifyNumber } = req.body || {};
    if (typeof enabled === 'boolean') cfg.enabled = enabled;
    if (typeof autostart === 'boolean') cfg.autostart = autostart;
    if (typeof promptExtra === 'string') cfg.promptExtra = promptExtra.slice(0, 2000);
    if (typeof notifyNumber === 'string') cfg.notifyNumber = notifyNumber.replace(/\D/g, '');
    saveCfg();
    res.json({ ok: true });
  });

  app.post('/api/eco/atendente/chat-resume', guard, (req, res) => {
    const { jid } = req.body || {};
    if (jid && cfg.pausedChats[jid]) { delete cfg.pausedChats[jid]; saveCfg(); }
    res.json({ ok: true });
  });

  // reconexão automática no boot, se configurado E já pareado antes
  let jaPareado = false;
  try { jaPareado = !!(function(c){return c.registered || c.me})(JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf8'))); } catch {}
  if (cfg.autostart && jaPareado) startSock().catch(e => console.error('[M5] autostart:', e.message));

  console.log('[M5] IA Atendente registrado (enabled=' + cfg.enabled + ')');
}

module.exports = { registerAtendenteRoutes };
