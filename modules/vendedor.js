// ============================================================
// M11 Fase 1 — VENDEDOR EXTERNO
// Vendedor lança pedido pelo painel (preço do site), manda o
// link de pagamento (PIX/cartão via Asaas) pro cliente e ganha
// comissão (% própria, definida pelo owner) sobre pedidos pagos.
// Vendedor NUNCA recebe dinheiro: cliente paga direto à empresa.
// ============================================================
const axios = require("axios");
const { auditLog } = require("../db");

const ASAAS_URL = "https://api.asaas.com/v3";
function asaasApi() {
  return axios.create({
    baseURL: ASAAS_URL,
    headers: { "access_token": process.env.ASAAS_API_KEY, "Content-Type": "application/json" },
    timeout: 15000,
  });
}

const PAID_STATUSES = ["paid", "shipped", "delivered"];

function clampPct(v, fallback = 10) {
  const n = parseFloat(v);
  if (isNaN(n)) return fallback;
  return Math.min(50, Math.max(0, Math.round(n * 100) / 100));
}

function round2(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }

// Base da comissão: produtos (total menos frete) — frete é custo, não venda.
function commissionBase(order) {
  const shipPrice = parseFloat(order.shipping?.price) || 0;
  return round2(Math.max(0, (parseFloat(order.total) || 0) - shipPrice));
}

// Mesmo formato de ID do site (TF-ANO-NNN), maior número existente + 1
function generateOrderId(orders) {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const o of orders) {
    const m = o.id && String(o.id).match(/TF-\d{4}-(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return "TF-" + year + "-" + String(maxNum + 1).padStart(3, "0");
}

// ─── Cobrança Asaas com link de pagamento (invoiceUrl) ────────────────────
// billing: 'pix' → PIX (QR + copia-cola + link) | 'card' → CREDIT_CARD (link)
// Sem boleto na venda por vendedor (decisão de negócio).
async function createVendorCharge(order, billing) {
  if (!process.env.ASAAS_API_KEY) {
    return { ok: false, error: "Asaas não configurado" };
  }
  try {
    // cliente no Asaas (opcional — sem CPF/CNPJ o Asaas ainda aceita p/ PIX)
    let customerId = null;
    const doc = String(order.customer?.doc || order.customer?.cpf || order.customer?.cnpj || "").replace(/\D/g, "");
    try {
      if (doc) {
        const found = await asaasApi().get(`/customers?cpfCnpj=${doc}`);
        if (found.data.data && found.data.data.length) customerId = found.data.data[0].id;
      }
      if (!customerId) {
        const created = await asaasApi().post("/customers", {
          name:  order.customer?.name || "Cliente",
          email: order.customer?.email || undefined,
          phone: String(order.customer?.phone || "").replace(/\D/g, "") || undefined,
          cpfCnpj: doc || undefined,
        });
        customerId = created.data.id;
      }
    } catch (e) {
      console.error("[vendedor] asaas customer erro:", e.response?.data || e.message);
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const payload = {
      customer:    customerId || undefined,
      billingType: billing === "card" ? "CREDIT_CARD" : "PIX",
      value:       parseFloat(order.total || 0),
      dueDate:     dueDate.toISOString().split("T")[0],
      description: `Pedido ${order.id} — TopFood Embalagens (vendedor ${order.vendedor_nome || ""})`.trim(),
      externalReference: order.id,
    };
    const res = await asaasApi().post("/payments", payload);
    const payment = res.data;

    const out = {
      ok: true,
      payment_id:  payment.id,
      invoice_url: payment.invoiceUrl || payment.bankSlipUrl || null,
      qr_code: null, copy_paste: null,
    };

    if (billing !== "card") {
      for (let tent = 0; tent < 3 && !out.copy_paste; tent++) {
        if (tent > 0) await new Promise(r => setTimeout(r, 900));
        try {
          const qr = await asaasApi().get(`/payments/${payment.id}/pixQrCode`);
          out.qr_code    = qr.data.encodedImage;
          out.copy_paste = qr.data.payload;
        } catch (_) {}
      }
    }
    return out;
  } catch (e) {
    console.error("[vendedor] createVendorCharge erro:", e.response?.data || e.message);
    return { ok: false, error: e.response?.data?.errors?.[0]?.description || e.message };
  }
}

// Resumo seguro de um pedido para o vendedor (sem dados internos)
function vendorOrderView(o) {
  return {
    id: o.id,
    date: o.date,
    customer: { name: o.customer?.name || "", phone: o.customer?.phone || "" },
    items: (o.items || []).map(i => ({ name: i.name, qty: i.qty, total: i.total })),
    subtotal: o.subtotal, shipping_price: o.shipping?.price || 0, total: o.total,
    status: o.status, payment_method: o.payment_method,
    payment_link: o.payment_link || null,
    pix_copy_paste: o.pix_copy_paste || null,
    comissao_pct: o.comissao_pct || 0,
    comissao_valor: PAID_STATUSES.includes(o.status) ? round2(commissionBase(o) * (o.comissao_pct || 0) / 100) : 0,
    comissao_prevista: round2(commissionBase(o) * (o.comissao_pct || 0) / 100),
  };
}

function registerVendedorRoutes(app, { readData, writeData, requireAuth }) {

  const CAN_SELL = ["vendedor", "admin", "socio", "owner"];

  // ── POST /api/vendedor/orders — lançar pedido (preço SEMPRE do servidor) ──
  app.post("/api/vendedor/orders", requireAuth, async (req, res) => {
    if (!CAN_SELL.includes(req.user.role))
      return res.status(403).json({ ok: false, error: "Sem permissão para lançar vendas" });

    try {
      const { customer, items, shipping_price, payment_method, notes } = req.body || {};
      if (!customer || !String(customer.name || "").trim())
        return res.status(400).json({ ok: false, error: "Nome do cliente é obrigatório" });
      if (!String(customer.phone || "").replace(/\D/g, ""))
        return res.status(400).json({ ok: false, error: "WhatsApp do cliente é obrigatório" });
      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ ok: false, error: "Adicione ao menos um produto" });
      const billing = payment_method === "card" ? "card" : "pix";

      // Preços vêm do catálogo — nunca do cliente (vendedor não altera preço)
      const products = readData("products.json").filter(p => p.active !== false);
      const lines = [];
      for (const it of items) {
        const p = products.find(pp => pp.id === it.product_id);
        if (!p) return res.status(400).json({ ok: false, error: `Produto inválido: ${it.product_id}` });
        // variação identificada pelo índice (suporta grade Tamanho × Cor);
        // fallback por units p/ compatibilidade
        let v = null;
        if (it.variant_idx != null && (p.variants || [])[it.variant_idx]) v = p.variants[it.variant_idx];
        else v = (p.variants || []).find(vv => Number(vv.units) === Number(it.units));
        if (!v) return res.status(400).json({ ok: false, error: `Variação inválida p/ ${p.name}` });
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        // detalhe da variação: opções da grade (ex.: "M · Preta") ou label, + pacote
        const detail = Array.isArray(v.options) && v.options.length ? v.options.join(" · ")
                     : (v.label || "");
        lines.push({
          id: p.id,
          name: `${p.name}${detail ? ` — ${detail}` : ""} (pacote ${v.units} un)`,
          units: v.units, variant_detail: detail,
          qty, unit_price: round2(v.price), total: round2(v.price * qty),
        });
      }

      const subtotal  = round2(lines.reduce((s, l) => s + l.total, 0));
      const shipPrice = round2(Math.max(0, parseFloat(shipping_price) || 0));
      const total     = round2(subtotal + shipPrice);

      // comissão do vendedor: % atual do cadastro, congelada no pedido
      const users = readData("users.json");
      const seller = users.find(u => u.id === req.user.id) || {};
      const pct = clampPct(seller.comissao_pct, 10);

      const orders = readData("orders.json");
      const newOrder = {
        id: generateOrderId(orders),
        date: new Date().toISOString(),
        channel: "vendedor",
        vendedor_id: req.user.id,
        vendedor_nome: req.user.name || req.user.username,
        comissao_pct: pct,
        customer: {
          name:  String(customer.name).trim(),
          phone: String(customer.phone).trim(),
          email: String(customer.email || "").trim(),
          doc:   String(customer.doc || "").trim(),   // CPF/CNPJ — necessário p/ NF-e
          cep:   String(customer.cep || "").trim(),
          address: String(customer.address || "").trim(),
          city:  String(customer.city || "").trim(),
          state: String(customer.state || "").trim().toUpperCase(),
        },
        items: lines,
        shipping: {
          method: shipPrice > 0 ? "Entrega combinada" : "A combinar",
          price: shipPrice,
          address: String(customer.address || "").trim(),
          city:  String(customer.city || "").trim(),
          state: String(customer.state || "").trim().toUpperCase(),
          cep:   String(customer.cep || "").trim(),
        },
        subtotal, discount: 0, coupon_code: "", total,
        status: "pending",
        payment_method: billing === "card" ? "card" : "pix",
        tracking_code: "",
        notes: String(notes || "").trim(),
        utm: {},
      };

      // Cobrança Asaas (link de pagamento). Falha da cobrança NÃO derruba o pedido.
      const charge = await createVendorCharge(newOrder, billing);
      if (charge.ok) {
        newOrder.asaas_payment_id = charge.payment_id;
        newOrder.payment_link     = charge.invoice_url;
        if (charge.qr_code)    newOrder.pix_qr_code    = charge.qr_code;
        if (charge.copy_paste) newOrder.pix_copy_paste = charge.copy_paste;
      }

      orders.unshift(newOrder);
      writeData("orders.json", orders.slice(0, 1000));
      auditLog(req.user.id, req.user.username, "vendedor_order", "orders", newOrder.id,
        `Venda de vendedor: R$ ${total} (${pct}% comissão)`, req.headers["x-real-ip"] || "");
      console.log(`🧑‍💼 Venda vendedor: ${newOrder.id} | ${newOrder.vendedor_nome} | R$ ${total} | ${billing}`);

      res.status(201).json({
        ok: true,
        order: vendorOrderView(newOrder),
        charge_ok: !!charge.ok,
        charge_error: charge.ok ? null : (charge.error || "Cobrança não gerada"),
      });
    } catch (e) {
      console.error("[vendedor] criar pedido erro:", e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/vendedor/my-orders — vendas do vendedor logado ──────────────
  app.get("/api/vendedor/my-orders", requireAuth, (req, res) => {
    if (!CAN_SELL.includes(req.user.role))
      return res.status(403).json({ ok: false, error: "Sem permissão" });
    const all = readData("orders.json").filter(o => o.channel === "vendedor");
    const mine = req.user.role === "vendedor"
      ? all.filter(o => o.vendedor_id === req.user.id)
      : all; // admin/owner/socio veem todas as vendas de vendedores
    res.json({ ok: true, orders: mine.slice(0, 200).map(vendorOrderView) });
  });

  // ── GET /api/vendedor/comissoes?mes=YYYY-MM — relatório de comissões ─────
  app.get("/api/vendedor/comissoes", requireAuth, (req, res) => {
    if (!CAN_SELL.includes(req.user.role))
      return res.status(403).json({ ok: false, error: "Sem permissão" });

    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || "") ? req.query.mes
              : new Date().toISOString().slice(0, 7);

    let orders = readData("orders.json").filter(o =>
      o.channel === "vendedor" && String(o.date || "").slice(0, 7) === mes);
    if (req.user.role === "vendedor")
      orders = orders.filter(o => o.vendedor_id === req.user.id);

    const porVendedor = {};
    for (const o of orders) {
      const key = o.vendedor_id || "?";
      if (!porVendedor[key]) porVendedor[key] = {
        vendedor_id: key, nome: o.vendedor_nome || key,
        pedidos: 0, pedidos_pagos: 0, total_vendido: 0, base_comissao: 0, comissao: 0,
        pedidos_pendentes: 0, valor_pendente: 0, comissao_pendente: 0,
      };
      const v = porVendedor[key];
      v.pedidos++;
      const base = commissionBase(o);
      if (PAID_STATUSES.includes(o.status)) {
        v.pedidos_pagos++;
        v.total_vendido = round2(v.total_vendido + (parseFloat(o.total) || 0));
        v.base_comissao = round2(v.base_comissao + base);
        v.comissao      = round2(v.comissao + base * (o.comissao_pct || 0) / 100);
      } else if (o.status !== "cancelled") {
        // aguardando pagamento — comissão ainda prevista
        v.pedidos_pendentes++;
        v.valor_pendente    = round2(v.valor_pendente + (parseFloat(o.total) || 0));
        v.comissao_pendente = round2(v.comissao_pendente + base * (o.comissao_pct || 0) / 100);
      }
    }

    res.json({
      ok: true, mes,
      vendedores: Object.values(porVendedor).sort((a, b) => b.comissao - a.comissao),
      pedidos: orders.map(vendorOrderView),
    });
  });

  console.log("✅ M11-F1 Vendedor registrado: /api/vendedor/orders + my-orders + comissoes");
}

module.exports = { registerVendedorRoutes, clampPct, generateOrderId };
