// ============================================================
// M10 — SHOPEE (fase 1): conectar loja + pedidos no painel
// Padrão espelhado do ml.js. Shopee Open Platform v2:
//   - Partner ID/Key: colados no painel (ficam em settings.shopee,
//     a key NUNCA volta pro cliente — só flags)
//   - Autorizar loja: link 1-clique → callback troca code→token
//     (access 4h, refresh 30d — renovação automática)
//   - Pedidos: webhook push + sincronização a cada 10 min →
//     pedido cai no painel (channel 'shopee', dedupe por order_sn)
// Fase 2 (depois): publicar produto direto do painel.
// ============================================================
const crypto = require('crypto');
const cron = require('node-cron');
const { readData, writeData, auditLog } = require('../db');
const { generateOrderId } = require('./vendedor');

const HOST = 'https://partner.shopeemobile.com';
const BASE_URL = process.env.BASE_URL || 'https://topfoodembalagens.com.br';

function cfg() {
  const s = readData('settings.json') || {};
  return s.shopee || {};
}
function saveCfg(patch) {
  const s = readData('settings.json') || {};
  s.shopee = { ...(s.shopee || {}), ...patch };
  writeData('settings.json', s);
  return s.shopee;
}

// Assinatura v2: HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id])
function sign(path, ts, { accessToken = '', shopId = '' } = {}) {
  const c = cfg();
  const base = `${c.partner_id}${path}${ts}${accessToken}${shopId}`;
  return crypto.createHmac('sha256', String(c.partner_key || '')).update(base).digest('hex');
}

async function publicCall(path, body) {
  const c = cfg();
  const ts = Math.floor(Date.now() / 1000);
  const url = `${HOST}${path}?partner_id=${c.partner_id}&timestamp=${ts}&sign=${sign(path, ts)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (d.error) throw new Error(`${d.error}: ${d.message || ''}`);
  return d;
}

// Renova o access_token quando faltar <10 min (refresh dura 30 dias)
async function ensureToken() {
  const c = cfg();
  if (!c.access_token || !c.shop_id) throw new Error('Loja Shopee não conectada');
  if (Date.now() < (c.expires_at || 0) - 10 * 60 * 1000) return c;
  const d = await publicCall('/api/v2/auth/access_token/get', {
    refresh_token: c.refresh_token,
    partner_id: Number(c.partner_id),
    shop_id: Number(c.shop_id),
  });
  return saveCfg({
    access_token: d.access_token,
    refresh_token: d.refresh_token || c.refresh_token,
    expires_at: Date.now() + (d.expire_in || 14400) * 1000,
  });
}

// Chamada autenticada da loja (GET com query ou POST com body)
async function shopCall(path, { method = 'GET', query = {}, body } = {}) {
  const c = await ensureToken();
  const ts = Math.floor(Date.now() / 1000);
  const s = sign(path, ts, { accessToken: c.access_token, shopId: String(c.shop_id) });
  const qs = new URLSearchParams({
    partner_id: String(c.partner_id), timestamp: String(ts), sign: s,
    access_token: c.access_token, shop_id: String(c.shop_id),
    ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
  });
  const r = await fetch(`${HOST}${path}?${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (d.error) throw new Error(`${d.error}: ${d.message || ''}`);
  return d;
}

// ------------------------------------------------------------
// Pedidos → painel (channel 'shopee', dedupe por order_sn)
// ------------------------------------------------------------
const STATUS_MAP = {
  UNPAID: 'pending', READY_TO_SHIP: 'paid', PROCESSED: 'paid', SHIPPED: 'shipped',
  TO_CONFIRM_RECEIVE: 'shipped', COMPLETED: 'delivered', CANCELLED: 'cancelled',
  IN_CANCEL: 'pending', TO_RETURN: 'paid', INVOICE_PENDING: 'paid',
};

async function importarPedido(orderSn) {
  const det = await shopCall('/api/v2/order/get_order_detail', {
    query: {
      order_sn_list: orderSn,
      response_optional_fields: 'item_list,recipient_address,total_amount,order_status,buyer_username,message_to_seller',
    },
  });
  const o = det.response && det.response.order_list && det.response.order_list[0];
  if (!o) return { ok: false, motivo: 'pedido não encontrado na Shopee' };

  const orders = readData('orders.json');
  const existente = orders.findIndex(x => x.shopee_order_sn === o.order_sn);
  const statusSite = STATUS_MAP[o.order_status] || 'pending';

  if (existente !== -1) {
    // já importado: só acompanha o status (não sobrescreve ajuste manual pra 'delivered')
    if (orders[existente].status !== statusSite && orders[existente].status !== 'delivered') {
      orders[existente].status = statusSite;
      writeData('orders.json', orders);
    }
    return { ok: true, atualizado: o.order_sn };
  }
  if (o.order_status === 'CANCELLED') return { ok: true, ignorado: 'cancelado' };

  const end = o.recipient_address || {};
  const novo = {
    id: generateOrderId(orders),
    shopee_order_sn: o.order_sn,
    channel: 'shopee',
    date: new Date((o.create_time || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    customer: {
      name: end.name || o.buyer_username || 'Comprador Shopee',
      email: '',
      phone: end.phone || '',
      cep: end.zipcode || '',
      address: end.full_address || '',
      city: end.city || '',
      state: end.state || '',
    },
    items: (o.item_list || []).map(it => ({
      name: `${it.item_name || 'Item Shopee'}${it.model_name ? ' — ' + it.model_name : ''}`,
      qty: it.model_quantity_purchased || 1,
      unit_price: parseFloat(it.model_discounted_price) || 0,
      total: (it.model_quantity_purchased || 1) * (parseFloat(it.model_discounted_price) || 0),
    })),
    shipping: {
      method: 'Shopee (envio da plataforma)', price: 0,
      address: end.full_address || '', city: end.city || '', state: end.state || '', cep: end.zipcode || '',
    },
    subtotal: parseFloat(o.total_amount) || 0,
    discount: 0, coupon_code: '',
    total: parseFloat(o.total_amount) || 0,
    status: statusSite,
    payment_method: 'shopee',
    tracking_code: '',
    notes: o.message_to_seller || '',
    utm: {},
  };
  orders.unshift(novo);
  writeData('orders.json', orders.slice(0, 1000));
  auditLog('system', 'shopee', 'pedido_importado', 'orders', novo.id, `Shopee ${o.order_sn} — R$ ${novo.total}`, '');
  console.log(`🛍️ [Shopee] Pedido importado: ${novo.id} (${o.order_sn}) | R$ ${novo.total} | ${o.order_status}`);
  return { ok: true, importado: novo.id };
}

// Varre os últimos dias e importa o que faltar (webhook pode falhar — isto garante)
async function sincronizarPedidos(dias = 7) {
  const fim = Math.floor(Date.now() / 1000);
  const inicio = fim - Math.min(dias, 15) * 86400;   // API limita a janela em 15 dias
  let cursor = '';
  let importados = 0, vistos = 0;
  do {
    const d = await shopCall('/api/v2/order/get_order_list', {
      query: {
        time_range_field: 'create_time', time_from: inicio, time_to: fim,
        page_size: 50, ...(cursor ? { cursor } : {}),
      },
    });
    const lista = (d.response && d.response.order_list) || [];
    for (const item of lista) {
      vistos++;
      const r = await importarPedido(item.order_sn).catch(e => {
        console.error('[Shopee] importar', item.order_sn, ':', e.message);
        return { ok: false };
      });
      if (r.importado) importados++;
    }
    cursor = d.response && d.response.more ? d.response.next_cursor : '';
  } while (cursor);
  return { vistos, importados };
}

// ------------------------------------------------------------
// Rotas
// ------------------------------------------------------------
function registerShopeeRoutes(app, requireAuth) {

  function requireAdminOwner(req, res, next) {
    requireAuth(req, res, () => {
      if (!['owner', 'admin'].includes(req.user.role))
        return res.status(403).json({ ok: false, error: 'Sem permissão' });
      next();
    });
  }

  // Status (sem expor a partner_key)
  app.get('/api/eco/shopee/status', requireAuth, (req, res) => {
    const c = cfg();
    res.json({
      ok: true,
      configurado: !!(c.partner_id && c.partner_key),
      conectado: !!(c.access_token && c.shop_id),
      shop_id: c.shop_id || null,
      token_valido: !!(c.access_token && Date.now() < (c.expires_at || 0)),
      webhook_url: `${BASE_URL}/api/shopee/webhook`,
      callback_url: `${BASE_URL}/api/shopee/callback`,
    });
  });

  // Salvar Partner ID/Key (owner/admin)
  app.post('/api/eco/shopee/config', requireAdminOwner, (req, res) => {
    const { partner_id, partner_key } = req.body || {};
    if (!partner_id) return res.status(400).json({ ok: false, error: 'Informe o Partner ID' });
    const patch = { partner_id: String(partner_id).trim() };
    if (partner_key) patch.partner_key = String(partner_key).trim();  // em branco = mantém a atual
    saveCfg(patch);
    auditLog(req.user.id, req.user.username, 'shopee_config', 'settings', 'shopee', 'Partner ID/Key atualizados', '');
    res.json({ ok: true });
  });

  // Link de autorização da loja (1 clique — igual ao ML)
  app.get('/api/eco/shopee/auth-url', requireAdminOwner, (req, res) => {
    const c = cfg();
    if (!c.partner_id || !c.partner_key)
      return res.status(400).json({ ok: false, error: 'Salve o Partner ID e a Partner Key primeiro' });
    const path = '/api/v2/shop/auth_partner';
    const ts = Math.floor(Date.now() / 1000);
    const redirect = `${BASE_URL}/api/shopee/callback`;
    const url = `${HOST}${path}?partner_id=${c.partner_id}&timestamp=${ts}&sign=${sign(path, ts)}&redirect=${encodeURIComponent(redirect)}`;
    res.json({ ok: true, url });
  });

  // Volta da Shopee com ?code&shop_id (público — é a Shopee que chama)
  app.get('/api/shopee/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      const shopId = String(req.query.shop_id || '');
      if (!code || !shopId) return res.redirect('/admin.html?shopee=erro');
      const c = cfg();
      const d = await publicCall('/api/v2/auth/token/get', {
        code, shop_id: Number(shopId), partner_id: Number(c.partner_id),
      });
      saveCfg({
        shop_id: shopId,
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Date.now() + (d.expire_in || 14400) * 1000,
      });
      console.log('🛍️ [Shopee] Loja conectada:', shopId);
      res.redirect('/admin.html?shopee=ok');
    } catch (e) {
      console.error('[Shopee] callback:', e.message);
      res.redirect('/admin.html?shopee=erro');
    }
  });

  // Webhook push (configurar a URL no console da Shopee Open Platform)
  app.post('/api/shopee/webhook', (req, res) => {
    res.sendStatus(200); // responde rápido; processa depois
    try {
      const b = req.body || {};
      const orderSn = b.data && (b.data.ordersn || b.data.order_sn);
      if (orderSn) {
        console.log('🛍️ [Shopee] push recebido:', orderSn, 'code:', b.code);
        importarPedido(String(orderSn)).catch(e => console.error('[Shopee] webhook import:', e.message));
      }
    } catch (e) { console.error('[Shopee] webhook:', e.message); }
  });

  // Sincronizar agora (botão do painel)
  app.post('/api/eco/shopee/sync', requireAdminOwner, async (req, res) => {
    try {
      const r = await sincronizarPedidos(parseInt(req.query.dias, 10) || 7);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Varredura automática a cada 10 min (se conectado) — cobre webhook perdido
  cron.schedule('*/10 * * * *', () => {
    const c = cfg();
    if (!c.access_token || !c.shop_id) return;
    sincronizarPedidos(2).catch(e => console.error('[Shopee] sync automático:', e.message));
  });

  console.log('✅ M10 Shopee registrado: config + auth + webhook + sync 10min');
}

module.exports = { registerShopeeRoutes };
