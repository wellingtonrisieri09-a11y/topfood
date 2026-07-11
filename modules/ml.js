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
const { readData, writeData, auditLog } = require('../db');

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

async function mlWrite(method, pathUrl, body) {
  const t = await getToken();
  const r = await fetch(`${API}${pathUrl}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ML ${method} ${pathUrl} → ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
const mlPost = (p, b) => mlWrite('POST', p, b);
const mlPut  = (p, b) => mlWrite('PUT', p, b);

// ------------------------------------------------------------
// Publicar produto (M10) — cada pacote (variante) vira um anúncio
// ------------------------------------------------------------
// Atributos exigidos variam por categoria; resolve com um valor padrão
// seguro quando possível, senão devolve pro painel decidir.
async function resolveAttributes(categoryId) {
  const attrs = await mlGet(`/categories/${categoryId}/attributes`);
  const out = [];
  for (const a of attrs || []) {
    const obrigatorio = a.tags && (a.tags.required || a.tags.catalog_required);
    if (!obrigatorio) continue;
    if (a.id === 'GTIN') { out.push({ id: 'GTIN', values: [{ name: 'Não especificado' }] }); continue; }
    if (a.id === 'BRAND') { out.push({ id: 'BRAND', values: [{ name: 'TopFood Embalagens' }] }); continue; }
    if (a.id === 'MODEL') { out.push({ id: 'MODEL', values: [{ name: 'Padrão' }] }); continue; }
    if (a.id === 'ITEM_CONDITION') { out.push({ id: 'ITEM_CONDITION', values: [{ name: 'Novo' }] }); continue; }
    if (Array.isArray(a.values) && a.values.length) { out.push({ id: a.id, values: [{ id: a.values[0].id, name: a.values[0].name }] }); continue; }
    // Não deu pra resolver sozinho — sinaliza pro painel (usuário preenche depois no próprio ML)
  }
  return out;
}

function findProducts() { return readData('products.json') || []; }
function saveProducts(list) { writeData('products.json', list); }

async function suggestCategory(title) {
  const d = await mlGet(`/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(title)}`);
  const top = Array.isArray(d) ? d[0] : null;
  return top ? { category_id: top.category_id, category_name: top.category_name } : null;
}

function buildItemPayload(product, variant, categoryId, attributes) {
  const stock = parseInt(product.stock, 10) || 0;
  const available = variant.units ? Math.max(0, Math.floor(stock / variant.units)) : 0;
  const img = (product.images && product.images[0]) || product.image || '';
  const baseUrl = process.env.BASE_URL || 'https://topfoodembalagens.com.br';
  const pictureUrl = img ? (img.startsWith('http') ? img : `${baseUrl}/${img}`) : null;
  return {
    title: `${product.name} - pacote ${variant.units} un`.slice(0, 60),
    family_name: product.name.slice(0, 60), // exigido por algumas categorias (agrupa as variações do mesmo produto)
    category_id: categoryId,
    price: variant.price || 0,
    currency_id: 'BRL',
    available_quantity: available,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    description: { plain_text: (product.description || product.name || '').slice(0, 5000) },
    pictures: pictureUrl ? [{ source: pictureUrl }] : undefined,
    attributes,
  };
}

// Publica (cria ou atualiza) todas as variantes de um produto no ML.
// Retorna um resultado por variante — sucesso ou erro (nunca falha silenciosamente).
async function publicarProduto(productId) {
  const products = findProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return { ok: false, error: 'Produto não encontrado' };
  if (!product.ml_category_id) return { ok: false, error: 'Defina a categoria do Mercado Livre antes de publicar' };

  let attributes = [];
  try { attributes = await resolveAttributes(product.ml_category_id); }
  catch (e) { return { ok: false, error: 'Categoria inválida ou erro ao buscar atributos: ' + e.message }; }

  const resultados = [];
  for (const variant of product.variants || []) {
    try {
      const payload = buildItemPayload(product, variant, product.ml_category_id, attributes);
      let data;
      if (variant.ml_item_id) {
        // Atualiza (preço/estoque não podem ir junto de category_id em alguns casos — manda tudo, ML ignora o que não muda)
        data = await mlPut(`/items/${variant.ml_item_id}`, { price: payload.price, available_quantity: payload.available_quantity, pictures: payload.pictures });
      } else {
        data = await mlPost('/items', payload);
        variant.ml_item_id = data.id;
      }
      resultados.push({ units: variant.units, ok: true, ml_item_id: variant.ml_item_id, permalink: data.permalink || null });
    } catch (e) {
      resultados.push({ units: variant.units, ok: false, error: e.message });
    }
  }
  saveProducts(products);
  return { ok: resultados.some(r => r.ok), resultados };
}

// Sincroniza o estoque disponível (site → ML) de todas as variantes já publicadas de um produto
async function syncStockToML(product) {
  const stock = parseInt(product.stock, 10) || 0;
  for (const variant of product.variants || []) {
    if (!variant.ml_item_id) continue;
    const available = variant.units ? Math.max(0, Math.floor(stock / variant.units)) : 0;
    try { await mlPut(`/items/${variant.ml_item_id}`, { available_quantity: available }); }
    catch (e) { console.error('[ML] erro ao sincronizar estoque de', variant.ml_item_id, ':', e.message); }
  }
}

function findVariantByMlItemId(itemId) {
  const products = findProducts();
  for (const p of products) {
    for (const v of p.variants || []) {
      if (v.ml_item_id === itemId) return { product: p, variant: v, products };
    }
  }
  return null;
}

// Gera ID de pedido vindo do Mercado Livre (prefixo ML- pra não colidir/confundir com TF- do site)
function generateMlOrderId(orders) {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const o of orders) {
    const m = o.id && o.id.match(/ML-\d{4}-(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return 'ML-' + year + '-' + String(maxNum + 1).padStart(3, '0');
}

// Busca o pedido completo no ML e cria o pedido local (idempotente por ml_order_id)
async function processarPedidoML(mlOrderId) {
  const orders = readData('orders.json') || [];
  if (orders.some(o => o.ml_order_id === mlOrderId)) return; // webhook duplicado

  const mlOrder = await mlGet(`/orders/${mlOrderId}`);
  const items = [];
  for (const oi of mlOrder.order_items || []) {
    const found = findVariantByMlItemId(oi.item.id);
    items.push({
      name: oi.item.title,
      qty: oi.quantity,
      unit_price: oi.unit_price,
      total: oi.quantity * oi.unit_price,
      _product_id: found ? found.product.id : null,
      _units: found ? found.variant.units : null,
    });
  }

  const buyer = mlOrder.buyer || {};
  const newOrder = {
    id: generateMlOrderId(orders),
    ml_order_id: mlOrderId,
    channel: 'mercado_livre',
    date: new Date().toISOString(),
    customer: {
      name: [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || 'Comprador Mercado Livre',
      email: buyer.email || '',
      phone: (buyer.phone && buyer.phone.number) || '',
    },
    items: items.map(({ _product_id, _units, ...rest }) => rest),
    shipping: { method: 'Mercado Envios', price: (mlOrder.shipping && mlOrder.shipping.cost) || 0 },
    subtotal: mlOrder.total_amount || 0,
    discount: 0,
    coupon_code: '',
    total: mlOrder.total_amount || 0,
    status: mlOrder.status === 'paid' ? 'paid' : 'pending',
    payment_method: 'mercado_livre',
    tracking_code: '',
    notes: '',
    utm: {},
  };
  orders.unshift(newOrder);
  writeData('orders.json', orders.slice(0, 1000));
  console.log(`🛒 [ML] Pedido importado: ${newOrder.id} (ML #${mlOrderId}) | R$ ${newOrder.total}`);

  // Baixa de estoque + sincroniza disponibilidade de volta pro ML
  const products = findProducts();
  const afetados = new Set();
  for (const it of items) {
    if (!it._product_id) continue;
    const p = products.find(pp => pp.id === it._product_id);
    if (!p) continue;
    p.stock = Math.max(0, (parseInt(p.stock, 10) || 0) - it.qty * (it._units || 0));
    afetados.add(p.id);
  }
  if (afetados.size) {
    saveProducts(products);
    for (const pid of afetados) { const p = products.find(pp => pp.id === pid); if (p) await syncStockToML(p); }
  }
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

  // Webhook de notificações (configurado no DevCenter) — responde rápido, processa depois
  app.post('/api/ml/webhook', (req, res) => {
    res.sendStatus(200);
    const topic = (req.body && req.body.topic) || '?';
    const resource = (req.body && req.body.resource) || '';
    console.log('[ML] notificação:', topic, resource);
    if (topic === 'orders_v2') {
      const m = resource.match(/\/orders\/(\d+)/);
      if (m) processarPedidoML(m[1]).catch(e => console.error('[ML] erro ao processar pedido', m[1], ':', e.message));
    }
  });

  app.get('/api/eco/ml/status', requireAuth, (req, res) => {
    res.json({
      configurado: !!(APP_ID && SECRET),
      conectado: !!tok,
      conta: tok ? (tok.nickname || tok.user_id || 'conectada') : null,
      tokenValido: !!(tok && Date.now() < tok.expires_at)
    });
  });

  // Sugere a categoria do ML a partir do nome do produto (não aplica sozinho)
  app.get('/api/eco/ml/sugerir-categoria', requireAuth, async (req, res) => {
    try {
      const titulo = String(req.query.titulo || '');
      if (!titulo) return res.status(400).json({ ok: false, error: 'Informe o título' });
      const sugestao = await suggestCategory(titulo);
      res.json({ ok: true, sugestao });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Salva a categoria do ML no produto (sem publicar ainda)
  app.put('/api/eco/ml/produto/:id', requireAuth, (req, res) => {
    const products = findProducts();
    const p = products.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'Produto não encontrado' });
    p.ml_category_id = String(req.body?.ml_category_id || '').trim();
    saveProducts(products);
    res.json({ ok: true });
  });

  // Publica (cria/atualiza) os anúncios do produto no ML — 1 anúncio por pacote
  app.post('/api/eco/ml/publicar/:id', requireAuth, async (req, res) => {
    try {
      const out = await publicarProduto(req.params.id);
      auditLog(req.user?.id, req.user?.username, 'ml-publicar', 'products', req.params.id, JSON.stringify(out.resultados || out.error), req.ip);
      res.json(out);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
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
