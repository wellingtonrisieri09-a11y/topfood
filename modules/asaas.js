// modules/asaas.js — PIX automático via Asaas
// Cria cobrança PIX, webhook de confirmação, polling de fallback
const axios  = require("axios");
const cron   = require("node-cron");
const { db, auditLog } = require("../db");

const BASE_URL = "https://api.asaas.com/v3";
function api() {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "access_token": process.env.ASAAS_API_KEY,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

// ─── Buscar ou criar cliente no Asaas ─────────────────────────────────────
async function getOrCreateCustomer(customer) {
  const cpfCnpj = (customer.cpf || customer.cnpj || "").replace(/\D/g, "");
  try {
    if (cpfCnpj) {
      const res = await api().get(`/customers?cpfCnpj=${cpfCnpj}`);
      if (res.data.data && res.data.data.length > 0) return res.data.data[0].id;
    }
    const res = await api().post("/customers", {
      name:     customer.name,
      email:    customer.email || undefined,
      phone:    (customer.phone || "").replace(/\D/g, "") || undefined,
      cpfCnpj:  cpfCnpj || undefined,
      postalCode: (customer.cep || "").replace(/\D/g, "") || undefined,
    });
    return res.data.id;
  } catch(e) {
    console.error("[asaas] getOrCreateCustomer erro:", e.response?.data || e.message);
    return null;
  }
}

// ─── Criar cobrança PIX ────────────────────────────────────────────────────
async function createPixCharge(order) {
  try {
    const customerId = await getOrCreateCustomer(order.customer || {});
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // vence amanhã
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const payload = {
      customer:    customerId,
      billingType: "PIX",
      value:       parseFloat(order.total || 0),
      dueDate:     dueDateStr,
      description: `Pedido ${order.id} — TopFood Embalagens`,
      externalReference: order.id,
    };
    if (!customerId) delete payload.customer;

    const res = await api().post("/payments", payload);
    const payment = res.data;

    // Buscar QR Code PIX — com retry (às vezes o QR não fica pronto no 1º instante)
    let qrCode = null, qrCodeText = null;
    for (let tent = 0; tent < 3 && !qrCodeText; tent++) {
      if (tent > 0) await new Promise(r => setTimeout(r, 900));
      try {
        const qrRes = await api().get(`/payments/${payment.id}/pixQrCode`);
        qrCode     = qrRes.data.encodedImage; // base64
        qrCodeText = qrRes.data.payload;       // copia e cola
      } catch(e) {
        console.error(`[asaas] QR Code tentativa ${tent+1}:`, e.response?.data?.errors?.[0]?.description || e.message);
      }
    }

    // Sem QR do Asaas → NÃO deixar cobrança fantasma em aberto (evita pagamento
    // no PIX estático sem confirmação + risco de negativação indevida do cliente).
    // Cancela a cobrança e sinaliza falha: o site cai no estático de forma limpa.
    if (!qrCodeText) {
      try {
        await api().delete(`/payments/${payment.id}`);
        console.log(`[asaas] cobrança ${payment.id} cancelada (QR indisponível)`);
      } catch(delErr) {
        console.error("[asaas] falha ao cancelar cobrança fantasma:", delErr.response?.data || delErr.message);
      }
      return { ok: false, error: "QR PIX indisponível no momento" };
    }

    // Salvar referência no pedido (só quando temos QR válido do Asaas)
    const orders = db.prepare("SELECT raw_data FROM orders WHERE id=?").get(order.id);
    if (orders) {
      const raw = JSON.parse(orders.raw_data);
      raw.asaas_payment_id = payment.id;
      raw.asaas_status     = payment.status;
      raw.pix_qr_code      = qrCode;
      raw.pix_copy_paste   = qrCodeText;
      db.prepare("UPDATE orders SET raw_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(JSON.stringify(raw), order.id);
    }

    console.log(`[asaas] PIX criado: ${payment.id} para pedido ${order.id}`);
    return { ok: true, payment_id: payment.id, qr_code: qrCode, copy_paste: qrCodeText, status: payment.status };
  } catch(e) {
    console.error("[asaas] createPixCharge erro:", e.response?.data || e.message);
    return { ok: false, error: e.response?.data?.errors?.[0]?.description || e.message };
  }
}

// ─── Processar webhook de confirmação ────────────────────────────────────
function processWebhook(event) {
  if (!["PAYMENT_RECEIVED","PAYMENT_CONFIRMED"].includes(event.event)) return;
  const paymentId  = event.payment?.id;
  const externalRef = event.payment?.externalReference; // order.id
  if (!externalRef) return;

  const orderRow = db.prepare("SELECT * FROM orders WHERE id=?").get(externalRef);
  if (!orderRow) return;

  const raw = JSON.parse(orderRow.raw_data);
  if (raw.payment_status === "paid") return; // já confirmado

  raw.payment_status  = "paid";
  raw.asaas_status    = "CONFIRMED";
  raw.paid_at         = new Date().toISOString();
  raw.status          = raw.status === "pending" ? "paid" : raw.status;

  db.prepare("UPDATE orders SET raw_data=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(JSON.stringify(raw), raw.status, externalRef);

  try { require("./capi").sendPurchase(raw); } catch(_) {} // M4b: conversão server-side (Meta CAPI)

  auditLog("system", "asaas-webhook", "payment_confirmed", "orders", externalRef,
    `PIX confirmado: ${paymentId}`, "webhook");
  console.log(`[asaas] Pagamento confirmado: pedido ${externalRef}`);
}

// ─── Polling de fallback (a cada 5 min) ──────────────────────────────────
async function pollPendingPayments() {
  const rows = db.prepare(
    "SELECT id, raw_data FROM orders WHERE status='pending' OR status='awaiting_payment'"
  ).all();

  for (const row of rows) {
    try {
      const raw = JSON.parse(row.raw_data);
      if (!raw.asaas_payment_id || raw.payment_status === "paid") continue;

      const res = await api().get(`/payments/${raw.asaas_payment_id}`);
      const status = res.data.status;

      if (["RECEIVED","CONFIRMED"].includes(status)) {
        raw.payment_status = "paid";
        raw.asaas_status   = status;
        raw.paid_at        = new Date().toISOString();
        raw.status         = "paid";
        db.prepare("UPDATE orders SET raw_data=?, status='paid', updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(JSON.stringify(raw), row.id);
        try { require("./capi").sendPurchase(raw); } catch(_) {} // M4b: conversão server-side (Meta CAPI)
        console.log(`[asaas] Polling confirmou pagamento: pedido ${row.id}`);
      }
    } catch(e) { /* ignora erros individuais */ }
  }
}

// ─── Registrar rotas ──────────────────────────────────────────────────────
function registerAsaasRoutes(app, requireAuth, requireOwner) {
  // Webhook público (Asaas chama este endpoint)
  app.post("/api/asaas/webhook", (req, res) => {
    const token = req.headers["asaas-access-token"];
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      console.warn("[asaas] webhook: token inválido rejeitado");
      return res.status(401).json({ error: "unauthorized" });
    }
    try {
      processWebhook(req.body);
      res.json({ received: true });
    } catch(e) {
      console.error("[asaas] webhook erro:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Criar cobrança PIX para um pedido (interno/admin)
  app.post("/api/admin/orders/:id/pix", requireAuth, async (req, res) => {
    const orderRow = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
    if (!orderRow) return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    const order = JSON.parse(orderRow.raw_data);
    order.id = req.params.id;
    const result = await createPixCharge(order);
    res.json(result);
  });

  // Status do pagamento de um pedido
  app.get("/api/admin/orders/:id/payment-status", requireAuth, async (req, res) => {
    const orderRow = db.prepare("SELECT raw_data FROM orders WHERE id=?").get(req.params.id);
    if (!orderRow) return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    const raw = JSON.parse(orderRow.raw_data);
    res.json({
      ok: true,
      payment_status: raw.payment_status || "pending",
      asaas_status:   raw.asaas_status   || null,
      pix_copy_paste: raw.pix_copy_paste || null,
      paid_at:        raw.paid_at        || null,
    });
  });

  // Cron: polling a cada 5 minutos
  cron.schedule("*/5 * * * *", () => pollPendingPayments().catch(e => console.error("[asaas] poll erro:", e.message)));

  console.log("✅ Asaas registrado: /api/asaas/webhook + polling 5min");
}

module.exports = { registerAsaasRoutes, createPixCharge, processWebhook };