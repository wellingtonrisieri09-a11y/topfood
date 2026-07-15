// ============================================================
// M10 — AMAZON (fase 1): conectar loja + pedidos no painel
// SP-API (Selling Partner API), marketplace Brasil.
//   - Auto-autorização: o Wellington cria o app no Seller Central
//     (Apps e Serviços → Desenvolver aplicativos), clica em
//     "Autorizar" no próprio app e recebe o REFRESH TOKEN direto
//     — sem OAuth externo. Cola Client ID + Client Secret +
//     Refresh Token no painel (ficam em settings.amazon; secret
//     e token NUNCA voltam pro cliente).
//   - Pedidos: varredura a cada 10 min + botão Sincronizar →
//     pedido cai no painel (channel 'amazon', dedupe por
//     amazon_order_id). Endereço do comprador é dado restrito
//     (PII): tentamos via RDT; sem permissão, o pedido entra sem
//     endereço (etiqueta sai pelo Seller Central).
// Fase 2 (depois): publicar produtos (Listings Items API).
// ============================================================
const cron = require('node-cron');
const { readData, writeData, auditLog } = require('../db');
const { generateOrderId } = require('./vendedor');

const LWA_URL = 'https://api.amazon.com/auth/o2/token';
const API = 'https://sellingpartnerapi-na.amazon.com';   // Brasil fica na região NA
const MARKETPLACE_BR = 'A2Q3Y263D00KWC';

let tokenCache = { access_token: null, expires_at: 0 };

function cfg() {
  const s = readData('settings.json') || {};
  return s.amazon || {};
}
function saveCfg(patch) {
  const s = readData('settings.json') || {};
  s.amazon = { ...(s.amazon || {}), ...patch };
  writeData('settings.json', s);
  return s.amazon;
}

// Access token LWA (1h) a partir do refresh token — com cache
async function accessToken() {
  const c = cfg();
  if (!c.client_id || !c.client_secret || !c.refresh_token)
    throw new Error('Amazon não configurada — salve Client ID, Client Secret e Refresh Token');
  if (tokenCache.access_token && Date.now() < tokenCache.expires_at - 60 * 1000)
    return tokenCache.access_token;
  const r = await fetch(LWA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: c.refresh_token,
      client_id: c.client_id,
      client_secret: c.client_secret,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error('LWA: ' + (d.error_description || d.error || 'falha ao gerar access token'));
  tokenCache = { access_token: d.access_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
  return tokenCache.access_token;
}

async function spCall(path, { query = {}, token } = {}) {
  const tk = token || await accessToken();
  const qs = new URLSearchParams(query).toString();
  const r = await fetch(`${API}${path}${qs ? '?' + qs : ''}`, {
    headers: { 'x-amz-access-token': tk, 'Content-Type': 'application/json' },
  });
  const d = await r.json().catch(() => ({}));
  if (d.errors && d.errors.length) throw new Error(d.errors[0].message || d.errors[0].code);
  return d;
}

// Token restrito (RDT) pra ler endereço/nome do comprador — pode não estar
// habilitado (exige a permissão PII no app); tratamos a ausência sem quebrar
async function rdtToken(orderId) {
  try {
    const tk = await accessToken();
    const r = await fetch(`${API}/tokens/2021-03-01/restrictedDataToken`, {
      method: 'POST',
      headers: { 'x-amz-access-token': tk, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restrictedResources: [{
          method: 'GET',
          path: `/orders/v0/orders/${orderId}`,
          dataElements: ['shippingAddress', 'buyerInfo'],
        }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    return d.restrictedDataToken || null;
  } catch { return null; }
}

const STATUS_MAP = {
  Pending: 'pending', PendingAvailability: 'pending',
  Unshipped: 'paid', PartiallyShipped: 'paid', InvoiceUnconfirmed: 'paid',
  Shipped: 'shipped', Canceled: 'cancelled', Unfulfillable: 'cancelled',
};

async function importarPedido(resumo) {
  const orderId = resumo.AmazonOrderId;
  const orders = readData('orders.json');
  const statusSite = STATUS_MAP[resumo.OrderStatus] || 'pending';

  const idx = orders.findIndex(x => x.amazon_order_id === orderId);
  if (idx !== -1) {
    if (orders[idx].status !== statusSite && orders[idx].status !== 'delivered' && statusSite !== 'pending') {
      orders[idx].status = statusSite;
      writeData('orders.json', orders);
    }
    return { atualizado: orderId };
  }
  if (resumo.OrderStatus === 'Canceled') return { ignorado: 'cancelado' };

  // itens do pedido
  let itens = [];
  try {
    const di = await spCall(`/orders/v0/orders/${orderId}/orderItems`);
    itens = ((di.payload && di.payload.OrderItems) || []).map(it => ({
      name: it.Title || it.SellerSKU || 'Item Amazon',
      qty: it.QuantityOrdered || 1,
      unit_price: it.ItemPrice ? (parseFloat(it.ItemPrice.Amount) || 0) / (it.QuantityOrdered || 1) : 0,
      total: it.ItemPrice ? parseFloat(it.ItemPrice.Amount) || 0 : 0,
    }));
  } catch (e) { console.error('[Amazon] itens', orderId, ':', e.message); }

  // endereço do comprador (PII) — só com RDT autorizado
  let cust = { name: 'Comprador Amazon', email: '', phone: '', cep: '', address: '', city: '', state: '' };
  const rdt = await rdtToken(orderId);
  if (rdt) {
    try {
      const dd = await spCall(`/orders/v0/orders/${orderId}`, { token: rdt });
      const o = dd.payload || {};
      const end = o.ShippingAddress || {};
      cust = {
        name: (o.BuyerInfo && o.BuyerInfo.BuyerName) || end.Name || 'Comprador Amazon',
        email: (o.BuyerInfo && o.BuyerInfo.BuyerEmail) || '',
        phone: end.Phone || '',
        cep: end.PostalCode || '',
        address: [end.AddressLine1, end.AddressLine2].filter(Boolean).join(', '),
        city: end.City || '',
        state: end.StateOrRegion || '',
      };
    } catch (e) { console.error('[Amazon] endereço', orderId, ':', e.message); }
  }

  const total = resumo.OrderTotal ? parseFloat(resumo.OrderTotal.Amount) || 0
              : itens.reduce((s, i) => s + i.total, 0);
  const novo = {
    id: generateOrderId(orders),
    amazon_order_id: orderId,
    channel: 'amazon',
    date: resumo.PurchaseDate || new Date().toISOString(),
    customer: cust,
    items: itens.length ? itens : [{ name: 'Pedido Amazon ' + orderId, qty: 1, unit_price: total, total }],
    shipping: { method: 'Amazon', price: 0, address: cust.address, city: cust.city, state: cust.state, cep: cust.cep },
    subtotal: total, discount: 0, coupon_code: '', total,
    status: statusSite,
    payment_method: 'amazon',
    tracking_code: '',
    notes: rdt ? '' : 'Endereço do comprador: ver no Seller Central (app sem permissão PII)',
    utm: {},
  };
  orders.unshift(novo);
  writeData('orders.json', orders.slice(0, 1000));
  auditLog('system', 'amazon', 'pedido_importado', 'orders', novo.id, `Amazon ${orderId} — R$ ${total}`, '');
  console.log(`📦 [Amazon] Pedido importado: ${novo.id} (${orderId}) | R$ ${total} | ${resumo.OrderStatus}`);
  return { importado: novo.id };
}

async function sincronizarPedidos(dias = 7) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  let next = null, vistos = 0, importados = 0;
  do {
    const q = next
      ? { NextToken: next, MarketplaceIds: MARKETPLACE_BR }
      : { MarketplaceIds: MARKETPLACE_BR, CreatedAfter: desde, MaxResultsPerPage: 50 };
    const d = await spCall('/orders/v0/orders', { query: q });
    const lista = (d.payload && d.payload.Orders) || [];
    for (const o of lista) {
      vistos++;
      const r = await importarPedido(o).catch(e => {
        console.error('[Amazon] importar', o.AmazonOrderId, ':', e.message);
        return {};
      });
      if (r.importado) importados++;
    }
    next = d.payload && d.payload.NextToken;
  } while (next);
  return { vistos, importados };
}

// ------------------------------------------------------------
// Rotas
// ------------------------------------------------------------
function registerAmazonRoutes(app, requireAuth) {

  function requireAdminOwner(req, res, next) {
    requireAuth(req, res, () => {
      if (!['owner', 'admin'].includes(req.user.role))
        return res.status(403).json({ ok: false, error: 'Sem permissão' });
      next();
    });
  }

  // Status (sem expor secret/refresh token)
  app.get('/api/eco/amazon/status', requireAuth, (req, res) => {
    const c = cfg();
    res.json({
      ok: true,
      configurado: !!(c.client_id && c.client_secret && c.refresh_token),
      tem_client_id: !!c.client_id,
      tem_secret: !!c.client_secret,
      tem_refresh: !!c.refresh_token,
      testado_em: c.testado_em || null,
      teste_ok: c.teste_ok || false,
    });
  });

  // Salvar credenciais LWA (em branco = mantém o valor atual)
  app.post('/api/eco/amazon/config', requireAdminOwner, (req, res) => {
    const { client_id, client_secret, refresh_token } = req.body || {};
    const patch = {};
    if (client_id) patch.client_id = String(client_id).trim();
    if (client_secret) patch.client_secret = String(client_secret).trim();
    if (refresh_token) patch.refresh_token = String(refresh_token).trim();
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nada para salvar' });
    tokenCache = { access_token: null, expires_at: 0 };  // força novo token com as chaves novas
    saveCfg(patch);
    auditLog(req.user.id, req.user.username, 'amazon_config', 'settings', 'amazon', 'Credenciais SP-API atualizadas', '');
    res.json({ ok: true });
  });

  // Testar a conexão (gera access token + consulta marketplaces autorizados)
  app.post('/api/eco/amazon/testar', requireAdminOwner, async (req, res) => {
    try {
      await accessToken();
      let lojaOk = false;
      try {
        const d = await spCall('/sellers/v1/marketplaceParticipations');
        lojaOk = ((d.payload || [])).some(m => m.marketplace && m.marketplace.id === MARKETPLACE_BR);
      } catch (_) { /* algumas contas não têm o role Sellers — o token já validou o LWA */ }
      saveCfg({ testado_em: new Date().toISOString(), teste_ok: true });
      res.json({ ok: true, loja_brasil: lojaOk });
    } catch (e) {
      saveCfg({ testado_em: new Date().toISOString(), teste_ok: false });
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Sincronizar pedidos agora
  app.post('/api/eco/amazon/sync', requireAdminOwner, async (req, res) => {
    try {
      const r = await sincronizarPedidos(parseInt(req.query.dias, 10) || 7);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Varredura automática a cada 10 min (se configurado)
  cron.schedule('*/10 * * * *', () => {
    const c = cfg();
    if (!c.client_id || !c.refresh_token) return;
    sincronizarPedidos(2).catch(e => console.error('[Amazon] sync automático:', e.message));
  });

  console.log('✅ M10 Amazon registrado: config + teste + sync 10min');
}

module.exports = { registerAmazonRoutes };
