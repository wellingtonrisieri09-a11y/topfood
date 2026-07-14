// ============================================================
// M11 Fase 2 — EMPRESAS (B2B por contrato) — lado admin
// Empresa com contrato (mensal/trimestral/anual), lojas, produtos
// contratados com preço combinado e ESTOQUE DEDICADO: a TopFood
// produz/imprime e deixa pronto; as lojas vão pedindo e o pedido
// baixa do estoque da empresa. Pedido cai no painel normal
// (NF-e + etiqueta funcionam como sempre).
// ============================================================
const crypto = require("crypto");
const { auditLog } = require("../db");
const { generateOrderId, createVendorCharge } = require("./vendedor");

function round2(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }
function newId(prefix) { return prefix + "-" + crypto.randomBytes(4).toString("hex"); }

const CONTRATO_TIPOS = ["mensal", "trimestral", "semestral", "anual", "avulso"];

// Normaliza/valida o documento da empresa vindo do painel
function sanitizeEmpresa(body, existing) {
  const e = existing ? { ...existing } : { id: newId("EMP"), created_at: new Date().toISOString() };
  e.nome         = String(body.nome || e.nome || "").trim();
  e.razao_social = String(body.razao_social ?? e.razao_social ?? "").trim();
  e.cnpj         = String(body.cnpj ?? e.cnpj ?? "").trim();
  e.ativa        = body.ativa !== undefined ? !!body.ativa : (e.ativa !== false);
  e.contato = {
    nome:  String(body.contato?.nome  ?? e.contato?.nome  ?? "").trim(),
    phone: String(body.contato?.phone ?? e.contato?.phone ?? "").trim(),
    email: String(body.contato?.email ?? e.contato?.email ?? "").trim(),
  };
  if (body.contrato !== undefined) {
    const c = body.contrato || {};
    e.contrato = {
      tipo:      CONTRATO_TIPOS.includes(c.tipo) ? c.tipo : "mensal",
      valor:     round2(c.valor),
      inicio:    String(c.inicio || "").slice(0, 10),
      fim:       String(c.fim || "").slice(0, 10),
      condicoes: String(c.condicoes || "").trim(),
    };
  }
  if (body.lojas !== undefined) {
    e.lojas = (Array.isArray(body.lojas) ? body.lojas : []).map(l => ({
      id:       l.id || newId("LOJA"),
      nome:     String(l.nome || "").trim(),
      cnpj:     String(l.cnpj || "").trim(),
      endereco: String(l.endereco || "").trim(),
      cidade:   String(l.cidade || "").trim(),
      uf:       String(l.uf || "").trim().toUpperCase(),
      cep:      String(l.cep || "").trim(),
      phone:    String(l.phone || "").trim(),
    })).filter(l => l.nome);
  }
  if (body.produtos !== undefined) {
    // Ficha técnica completa da embalagem personalizada do cliente
    e.produtos = (Array.isArray(body.produtos) ? body.produtos : []).map(p => ({
      nome:            String(p.nome || "").trim(),            // ex: "Caixa burger Sabor — logo vermelho"
      tipo:            String(p.tipo || "").trim(),            // caixa de pizza / bolo / hambúrguer / batata...
      unidades_pacote: parseInt(p.unidades_pacote, 10) || 0,   // un por pacote
      preco:           round2(p.preco),                        // preço combinado por pacote
      estoque:         parseInt(p.estoque, 10) || 0,           // pacotes prontos (estoque dedicado)
      lote_minimo:     parseInt(p.lote_minimo, 10) || 0,       // lote mínimo de produção (pacotes)
      // dimensões e material
      largura:      String(p.largura ?? "").trim(),            // cm
      altura:       String(p.altura ?? "").trim(),
      profundidade: String(p.profundidade ?? "").trim(),
      material:     String(p.material || "").trim(),           // kraft / duplex / triplex / microondulado...
      gramatura:    String(p.gramatura || "").trim(),          // ex: 300g/m²
      // impressão e acabamento
      cores_impressao: String(p.cores_impressao || "").trim(), // ex: 4 cores (CMYK)
      acabamento:      String(p.acabamento || "").trim(),      // verniz / laminação interna...
      // arte / layout da caixa
      arte_url:    String(p.arte_url || "").trim(),            // imagem do layout (upload)
      arte_status: ["rascunho", "em_aprovacao", "aprovada"].includes(p.arte_status) ? p.arte_status : "rascunho",
      obs:         String(p.obs || "").trim(),
    })).filter(p => p.nome);
  }
  if (!e.lojas)    e.lojas = [];
  if (!e.produtos) e.produtos = [];
  if (!e.contrato) e.contrato = { tipo: "mensal", valor: 0, inicio: "", fim: "", condicoes: "" };
  e.updated_at = new Date().toISOString();
  return e;
}

function registerEmpresasRoutes(app, { readData, writeData, requireAdminPlus }) {

  // ── LISTAR ────────────────────────────────────────────────
  app.get("/api/empresas", requireAdminPlus, (req, res) => {
    res.json({ ok: true, empresas: readData("empresas.json") });
  });

  // ── CRIAR ─────────────────────────────────────────────────
  app.post("/api/empresas", requireAdminPlus, (req, res) => {
    const e = sanitizeEmpresa(req.body || {});
    if (!e.nome) return res.status(400).json({ ok: false, error: "Nome da empresa é obrigatório" });
    const empresas = readData("empresas.json");
    empresas.unshift(e);
    writeData("empresas.json", empresas);
    auditLog(req.user.id, req.user.username, "empresa_criada", "empresas", e.id, e.nome, "");
    res.status(201).json({ ok: true, empresa: e });
  });

  // ── ATUALIZAR ─────────────────────────────────────────────
  app.put("/api/empresas/:id", requireAdminPlus, (req, res) => {
    const empresas = readData("empresas.json");
    const idx = empresas.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: "Empresa não encontrada" });
    const e = sanitizeEmpresa(req.body || {}, empresas[idx]);
    if (!e.nome) return res.status(400).json({ ok: false, error: "Nome da empresa é obrigatório" });
    empresas[idx] = e;
    writeData("empresas.json", empresas);
    res.json({ ok: true, empresa: e });
  });

  // ── EXCLUIR ───────────────────────────────────────────────
  app.delete("/api/empresas/:id", requireAdminPlus, (req, res) => {
    if (!["owner", "admin"].includes(req.user.role))
      return res.status(403).json({ ok: false, error: "Somente owner/admin pode excluir empresa" });
    const empresas = readData("empresas.json");
    const idx = empresas.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: "Empresa não encontrada" });
    const removida = empresas.splice(idx, 1)[0];
    writeData("empresas.json", empresas);
    auditLog(req.user.id, req.user.username, "empresa_excluida", "empresas", removida.id, removida.nome, "");
    res.json({ ok: true });
  });

  // ── LANÇAR PEDIDO DA EMPRESA (por loja, baixa estoque dedicado) ──
  // Pagamento: faturado (sem cobrança) ou Asaas PIX/boleto/cartão com link
  app.post("/api/empresas/:id/pedido", requireAdminPlus, async (req, res) => {
    try {
      const empresas = readData("empresas.json");
      const eIdx = empresas.findIndex(x => x.id === req.params.id);
      if (eIdx === -1) return res.status(404).json({ ok: false, error: "Empresa não encontrada" });
      const emp = empresas[eIdx];

      const { loja_id, items, shipping_price, payment_method, notes } = req.body || {};
      const loja = (emp.lojas || []).find(l => l.id === loja_id);
      if (!loja) return res.status(400).json({ ok: false, error: "Selecione a loja de entrega" });
      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ ok: false, error: "Adicione ao menos um item" });

      // itens referenciam produtos contratados por índice — preço SEMPRE da empresa
      const lines = [];
      const avisos = [];
      for (const it of items) {
        const p = (emp.produtos || [])[it.idx];
        if (!p) return res.status(400).json({ ok: false, error: "Produto contratado inválido" });
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        lines.push({ id: "emp-" + it.idx, name: p.nome, qty, unit_price: round2(p.preco), total: round2(p.preco * qty) });
        // baixa do estoque dedicado (pode ficar negativo = débito de produção)
        p.estoque = (parseInt(p.estoque, 10) || 0) - qty;
        if (p.estoque < 0) avisos.push(`${p.nome}: estoque dedicado ficou em ${p.estoque} (produzir ${-p.estoque} pacote(s))`);
      }

      const subtotal  = round2(lines.reduce((s, l) => s + l.total, 0));
      const shipPrice = round2(Math.max(0, parseFloat(shipping_price) || 0));
      const total     = round2(subtotal + shipPrice);
      const pay       = ["faturado", "pix", "boleto", "card"].includes(payment_method) ? payment_method : "faturado";

      const orders = readData("orders.json");
      const newOrder = {
        id: generateOrderId(orders),
        date: new Date().toISOString(),
        channel: "empresa",
        empresa_id: emp.id,
        empresa_nome: emp.nome,
        loja_id: loja.id,
        loja_nome: loja.nome,
        customer: {
          name:  `${emp.nome} — ${loja.nome}`,
          phone: loja.phone || emp.contato?.phone || "",
          email: emp.contato?.email || "",
          doc:   loja.cnpj || emp.cnpj || "",
          cep:   loja.cep, address: loja.endereco, city: loja.cidade, state: loja.uf,
        },
        items: lines,
        shipping: {
          method: "Entrega contratada", price: shipPrice,
          address: loja.endereco, city: loja.cidade, state: loja.uf, cep: loja.cep,
        },
        subtotal, discount: 0, coupon_code: "", total,
        status: "pending",
        payment_method: pay,
        tracking_code: "",
        notes: String(notes || "").trim(),
        utm: {},
      };
      // Cobrança Asaas (PIX / boleto / cartão) — boleto com 7 dias p/ B2B.
      // Falha na cobrança NÃO derruba o pedido (admin pode gerar depois).
      let charge = { ok: false, error: null };
      if (pay !== "faturado") {
        charge = await createVendorCharge(newOrder, pay === "card" ? "card" : pay, pay === "boleto" ? 7 : 3);
        if (charge.ok) {
          newOrder.asaas_payment_id = charge.payment_id;
          newOrder.payment_link     = charge.invoice_url;
          if (charge.boleto_url) newOrder.boleto_url     = charge.boleto_url;
          if (charge.qr_code)    newOrder.pix_qr_code    = charge.qr_code;
          if (charge.copy_paste) newOrder.pix_copy_paste = charge.copy_paste;
        }
      }

      orders.unshift(newOrder);
      writeData("orders.json", orders.slice(0, 1000));

      empresas[eIdx] = emp;         // estoque já baixado nas referências acima
      writeData("empresas.json", empresas);

      auditLog(req.user.id, req.user.username, "empresa_pedido", "orders", newOrder.id,
        `${emp.nome} / ${loja.nome} — R$ ${total} (${pay})`, "");
      console.log(`🏢 Pedido empresa: ${newOrder.id} | ${emp.nome} → ${loja.nome} | R$ ${total} | ${pay}`);

      res.status(201).json({
        ok: true, order_id: newOrder.id, total, avisos, empresa: emp,
        payment_link: newOrder.payment_link || null,
        pix_copy_paste: newOrder.pix_copy_paste || null,
        charge_error: (pay !== "faturado" && !charge.ok) ? (charge.error || "Cobrança não gerada") : null,
      });
    } catch (e) {
      console.error("[empresas] pedido erro:", e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log("✅ M11-F2 Empresas registrado: /api/empresas (+pedido por loja)");
}

module.exports = { registerEmpresasRoutes };
