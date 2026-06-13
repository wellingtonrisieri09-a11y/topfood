// ============================================================
// Mercado Livre — OAuth + Radar de Concorrência (M12) + base M10
// TopFood Embalagens — Ecossistema v3.0
//
// .env: ML_APP_ID, ML_CLIENT_SECRET
// Tokens: data/ml_tokens.json (access 6h; refresh é de uso único
//         e o ML devolve um novo a cada renovação — sempre salvar)
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOK_FILE = path.join(DATA_DIR, 'ml_tokens.json');
const RADAR_FILE = path.join(DATA_DIR, 'ml_radar.json');

const APP_ID = process.env.ML_APP_ID;
const SECRET = process.env.ML_CLIENT_SECRET;
const REDIRECT_URI = 'https://topfoodembalagens.com.br/api/ml/callback';
const API = 'https://api.mercadolibre.com';

// Buscas do radar de concorrência (M12)
const RADAR_QUERIES = [
  { id: 'burger',  q: 'embalagem hamburguer delivery papel' },
  { id: 'pastel',  q: 'embalagem pastel delivery' },
  { id: 'churros', q: 'caixa churros embalagem' },
  { id: 'fritas',  q: 'embalagem batata frita delivery' }
];

function loadJSON(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function saveJSON(f, o) { fs.writeFileSync(f, JSON.stringify(o, null, 2)); }

let tok = loadJSON(TOK_FILE, null); // { access_token, refresh_token, expires_at, user_id, nickname }

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------
async function exchangeToken(body) {
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body).toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`ML oauth ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  tok = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 300) * 1000, // 5min de folga
    user_id: data.user_id || (tok && tok.user_id),
    nickname: tok && tok.nickname
  };
  saveJSON(TOK_FILE, tok);
  return tok;
}

async function getToken() {
  if (!tok) throw new Error('Mercado Livre não conectado — autorize no painel');
  if (Date.now() < tok.expires_at) return tok.access_token;
  await exchangeToken({
    grant_type: 'refresh_token',
    client_id: APP_ID,
    client_secret: SECRET,
    refresh_token: tok.refresh_token
  });
  return tok.access_token;
}

async function mlGet(pathUrl) {
  const t = await getToken();
  const r = await fetch(`${API}${pathUrl}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`ML GET ${pathUrl} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ------------------------------------------------------------
// Radar de concorrência (M12) — cache 12h
// ------------------------------------------------------------
async function buildRadar() {
  const radar = { ts: Date.now(), buscas: [] };
  for (const item of RADAR_QUERIES) {
    try {
      const d = await mlGet(`/sites/MLB/search?q=${encodeURIComponent(item.q)}&limit=8&sort=price_asc`);
      const ofertas = (d.results || [])
        .filter(o => o.price > 1) // ignora lixo de R$0,xx
        .slice(0, 5)
        .map(o => ({
          titulo: String(o.title || '').slice(0, 90),
          preco: o.price,
          vendidos: o.sold_quantity || 0,
          vendedor: (o.seller && o.seller.nickname) || '',
          frete_gratis: !!(o.shipping && o.shipping.free_shipping),
          link: o.permalink
        }));
      radar.buscas.push({ id: item.id, busca: item.q, total: d.paging ? d.paging.total : 0, ofertas });
    } catch (e) {
      radar.buscas.push({ id: item.id, busca: item.q, erro: e.message, ofertas: [] });
    }
  }
  saveJSON(RADAR_FILE, radar);
  return radar;
}

// ------------------------------------------------------------
// Rotas
// ------------------------------------------------------------
function registerMlRoutes(app, requireAuth) {
  // URL p/ Wellington autorizar o app (1 clique, 1 vez)
  app.get('/api/ml/auth-url', requireAuth, (req, res) => {
    if (!APP_ID || !SECRET) return res.status(500).json({ error: 'ML_APP_ID/ML_CLIENT_SECRET ausentes no .env' });
    const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.json({ url });
  });

  // Volta do Mercado Livre com o ?code= (público — é o ML que chama)
  app.get('/api/ml/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      if (!code) return res.redirect('/admin.html?ml=erro');
      await exchangeToken({
        grant_type: 'authorization_code',
        client_id: APP_ID,
        client_secret: SECRET,
        code,
        redirect_uri: REDIRECT_URI
      });
      try { // guarda o apelido da conta p/ mostrar no painel
        const me = await mlGet('/users/me');
        tok.nickname = me.nickname; tok.user_id = me.id; saveJSON(TOK_FILE, tok);
      } catch {}
      res.redirect('/admin.html?ml=ok');
    } catch (e) {
      console.error('[ML] callback:', e.message);
      res.redirect('/admin.html?ml=erro');
    }
  });

  // Webhook de notificações (configurado no DevCenter) — só confirma por enquanto
  app.post('/api/ml/webhook', (req, res) => {
    try {
      const topic = (req.body && req.body.topic) || '?';
      console.log('[ML] notificação:', topic);
    } catch {}
    res.sendStatus(200);
  });

  app.get('/api/eco/ml/status', requireAuth, (req, res) => {
    res.json({
      configurado: !!(APP_ID && SECRET),
      conectado: !!tok,
      conta: tok ? (tok.nickname || tok.user_id || 'conectada') : null,
      tokenValido: !!(tok && Date.now() < tok.expires_at)
    });
  });

  // Radar M12 — cache 12h; ?force=1 atualiza na hora
  app.get('/api/eco/ml/radar', requireAuth, async (req, res) => {
    try {
      let radar = loadJSON(RADAR_FILE, null);
      if (!radar || req.query.force === '1' || Date.now() - radar.ts > 12 * 60 * 60 * 1000) {
        radar = await buildRadar();
      }
      res.json(radar);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[ML] Rotas registradas: callback + webhook + radar (conectado=' + !!tok + ')');
}

module.exports = { registerMlRoutes };
