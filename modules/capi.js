// ============================================================
// M4b — Meta Conversions API (CAPI): rastreamento server-side.
// Envia a conversão "Purchase" direto do servidor para a Meta
// quando um pedido é confirmado como PAGO — "à prova de bloqueador
// de anúncio". Usa event_id = id do pedido, então a Meta DEDUPLICA
// com o pixel do navegador e entre chamadas (sem conversão dobrada).
//
// .env: META_PIXEL_ID (padrão = pixel já instalado no site),
//       META_CAPI_TOKEN (gerado no Gerenciador de Eventos da Meta)
//
// Fire-and-forget: qualquer erro é engolido — NUNCA quebra o
// fluxo de pagamento.
// ============================================================
const crypto = require('crypto');

function pixelId()        { return process.env.META_PIXEL_ID || '1202105157078230'; }
function token()          { return process.env.META_CAPI_TOKEN || ''; }
function capiConfigured() { return !!token(); }

// Meta exige PII com hash SHA-256 (minúsculo, sem espaços nas pontas)
function hash(v) {
  if (!v) return undefined;
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
}
const onlyDigits = v => String(v || '').replace(/\D/g, '');

async function sendPurchase(order) {
  try {
    if (!capiConfigured() || !order) return;

    const id    = order.id || order.order_id || ('t' + Date.now());
    const value = Number(order.total || order.totalValue || order.amount || 0) || 0;
    const email = order.email || order.customer_email || (order.customer && order.customer.email) || '';
    let   phone = onlyDigits(order.phone || (order.customer && order.customer.phone) || '');
    if (phone && !phone.startsWith('55')) phone = '55' + phone; // E.164 BR
    const nome  = String(order.name || (order.customer && order.customer.name) || '').trim();
    const parts = nome ? nome.split(/\s+/) : [];

    const user_data = {};
    if (email)            user_data.em = [hash(email)];
    if (phone)            user_data.ph = [hash(phone)];
    if (parts[0])         user_data.fn = [hash(parts[0])];
    if (parts.length > 1) user_data.ln = [hash(parts[parts.length - 1])];

    const body = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_id: 'order-' + id,          // deduplicação com o pixel do navegador
        event_source_url: (process.env.BASE_URL || 'https://topfoodembalagens.com.br') + '/',
        user_data: user_data,
        custom_data: { currency: 'BRL', value: value }
      }]
    };

    const url = 'https://graph.facebook.com/v21.0/' + pixelId() + '/events?access_token=' + encodeURIComponent(token());
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[CAPI] Meta ' + r.status + ': ' + t.slice(0, 180));
    } else {
      console.log('[CAPI] Purchase enviado à Meta: pedido ' + id + ' (R$ ' + value + ')');
    }
  } catch (e) {
    console.error('[CAPI] erro (ignorado, não afeta o pagamento): ' + e.message);
  }
}

module.exports = { sendPurchase, capiConfigured };
