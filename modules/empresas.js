// ============================================================
// M11 Fase 2 — EMPRESAS (B2B por contrato)
// Lado admin: empresa com contrato (mensal/trimestral/anual),
// lojas, ficha técnica das embalagens personalizadas (preço
// combinado por cliente) e ESTOQUE DEDICADO.
// Lado cliente: PORTAL DA EMPRESA (/empresa, tema verde) —
// login criado pelo admin no editor da empresa; a empresa vê
// seus produtos/estoque e lança pedido por loja sozinha
// (PIX/boleto/cartão via Asaas). Pedido cai no painel normal.
// ============================================================
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
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

// ─── Acesso ao portal: usuário role 'empresa' amarrado à empresa ────────────
function findPortalUser(readData, empresaId) {
  return readData("users.json").find(u => u.role === "empresa" && u.empresa_id === empresaId);
}

function upsertPortalUser(readData, writeData, emp, username, password) {
  username = String(username || "").toLowerCase().trim();
  if (!username) return null;
  const users = readData("users.json");
  let u = users.find(x => x.role === "empresa" && x.empresa_id === emp.id);
  const conflito = users.find(x => x.username === username && (!u || x.id !== u.id));
  if (conflito) throw new Error("Nome de usuário do portal já existe — escolha outro");
  if (!u) {
    if (!password || password.length < 6) throw new Error("Senha do portal: mínimo 6 caracteres");
    u = {
      id: "U-" + emp.id,
      name: emp.nome, username,
      password_hash: bcrypt.hashSync(password, 10),
      role: "empresa", empresa_id: emp.id,
      active: emp.ativa !== false,
      created_at: new Date().toISOString(), last_login: null,
    };
    users.push(u);
  } else {
    u.username = username;
    u.name = emp.nome;
    u.active = emp.ativa !== false;
    if (password) {
      if (password.length < 6) throw new Error("Senha do portal: mínimo 6 caracteres");
      u.password_hash = bcrypt.hashSync(password, 10);
    }
  }
  writeData("users.json", users);
  return u.username;
}

// ─── Núcleo: lançar pedido de uma empresa (admin OU portal) ────────────────
// Valida loja/itens, monta o pedido com os preços da empresa, baixa o
// estoque dedicado, gera cobrança Asaas quando não é faturado e persiste.
async function processarPedidoEmpresa({ readData, writeData }, empresaId, payload, autor, allowFaturado) {
  const empresas = readData("empresas.json");
  const eIdx = empresas.findIndex(x => x.id === empresaId);
  if (eIdx === -1) return { status: 404, body: { ok: false, error: "Empresa não encontrada" } };
  const emp = empresas[eIdx];
  if (emp.ativa === false) return { status: 403, body: { ok: false, error: "Empresa inativa — fale com a TopFood" } };

  const { loja_id, items, shipping_price, payment_method, notes } = payload || {};
  const loja = (emp.lojas || []).find(l => l.id === loja_id);
  if (!loja) return { status: 400, body: { ok: false, error: "Selecione a loja de entrega" } };
  if (!Array.isArray(items) || !items.length)
    return { status: 400, body: { ok: false, error: "Adicione ao menos um item" } };

  // itens referenciam produtos contratados por índice — preço SEMPRE da empresa
  const lines = [];
  const avisos = [];
  for (const it of items) {
    const p = (emp.produtos || [])[it.idx];
    if (!p) return { status: 400, body: { ok: false, error: "Produto contratado inválido" } };
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    lines.push({ id: "emp-" + it.idx, name: p.nome, qty, unit_price: round2(p.preco), total: round2(p.preco * qty) });
    // baixa do estoque dedicado (pode ficar negativo = débito de produção)
    p.estoque = (parseInt(p.estoque, 10) || 0) - qty;
    if (p.estoque < 0) avisos.push(`${p.nome}: estoque dedicado ficou em ${p.estoque} (produzir ${-p.estoque} pacote(s))`);
  }

  const subtotal  = round2(lines.reduce((s, l) => s + l.total, 0));
  const shipPrice = round2(Math.max(0, parseFloat(shipping_price) || 0));
  const total     = round2(subtotal + shipPrice);
  const paisagem  = allowFaturado ? ["faturado", "pix", "boleto", "card"] : ["pix", "boleto", "card"];
  const pay       = paisagem.includes(payment_method) ? payment_method : paisagem[0];

  const orders = readData("orders.json");
  const newOrder = {
    id: generateOrderId(orders),
    date: new Date().toISOString(),
    channel: "empresa",
    empresa_id: emp.id,
    empresa_nome: emp.nome,
    loja_id: loja.id,
    loja_nome: loja.nome,
    portal: autor.portal || false,       // true = a própria empresa pediu pelo portal
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

  auditLog(autor.id, autor.username, "empresa_pedido", "orders", newOrder.id,
    `${emp.nome} / ${loja.nome} — R$ ${total} (${pay})${autor.portal ? " [portal]" : ""}`, "");
  console.log(`🏢 Pedido empresa: ${newOrder.id} | ${emp.nome} → ${loja.nome} | R$ ${total} | ${pay}${autor.portal ? " | PORTAL" : ""}`);

  return { status: 201, body: {
    ok: true, order_id: newOrder.id, total, avisos, empresa: emp,
    payment_link: newOrder.payment_link || null,
    pix_copy_paste: newOrder.pix_copy_paste || null,
    charge_error: (pay !== "faturado" && !charge.ok) ? (charge.error || "Cobrança não gerada") : null,
  } };
}

// Visão segura do pedido para o portal da empresa
function portalOrderView(o) {
  return {
    id: o.id, date: o.date, loja_nome: o.loja_nome || "",
    items: (o.items || []).map(i => ({ name: i.name, qty: i.qty, total: i.total })),
    subtotal: o.subtotal, shipping_price: o.shipping?.price || 0, total: o.total,
    status: o.status, payment_method: o.payment_method,
    payment_link: o.payment_link || null,
    pix_copy_paste: o.pix_copy_paste || null,
    tracking_code: o.tracking_code || "",
    nfe_autorizada: !!(o.nfe && o.nfe.status === "autorizado"),
  };
}

function registerEmpresasRoutes(app, { readData, writeData, requireAdminPlus, requireAuth }) {

  // ── LISTAR (admin) — inclui o usuário do portal de cada empresa ──
  app.get("/api/empresas", requireAdminPlus, (req, res) => {
    const users = readData("users.json");
    const empresas = readData("empresas.json").map(e => ({
      ...e,
      portal_username: users.find(u => u.role === "empresa" && u.empresa_id === e.id)?.username || "",
    }));
    res.json({ ok: true, empresas });
  });

  // ── CRIAR (admin) ─────────────────────────────────────────
  app.post("/api/empresas", requireAdminPlus, (req, res) => {
    const e = sanitizeEmpresa(req.body || {});
    if (!e.nome) return res.status(400).json({ ok: false, error: "Nome da empresa é obrigatório" });
    const empresas = readData("empresas.json");
    empresas.unshift(e);
    writeData("empresas.json", empresas);
    let portal_username = "";
    try {
      if (req.body.portal_username)
        portal_username = upsertPortalUser(readData, writeData, e, req.body.portal_username, req.body.portal_password) || "";
    } catch (err) {
      return res.status(201).json({ ok: true, empresa: e, portal_error: err.message });
    }
    auditLog(req.user.id, req.user.username, "empresa_criada", "empresas", e.id, e.nome, "");
    res.status(201).json({ ok: true, empresa: e, portal_username });
  });

  // ── ATUALIZAR (admin) ─────────────────────────────────────
  app.put("/api/empresas/:id", requireAdminPlus, (req, res) => {
    const empresas = readData("empresas.json");
    const idx = empresas.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: "Empresa não encontrada" });
    const e = sanitizeEmpresa(req.body || {}, empresas[idx]);
    if (!e.nome) return res.status(400).json({ ok: false, error: "Nome da empresa é obrigatório" });
    empresas[idx] = e;
    writeData("empresas.json", empresas);
    let portal_username = "";
    try {
      if (req.body.portal_username !== undefined && req.body.portal_username !== "")
        portal_username = upsertPortalUser(readData, writeData, e, req.body.portal_username, req.body.portal_password) || "";
      else {
        // sem username novo mas empresa mudou de status → sincroniza o acesso
        const u = findPortalUser(readData, e.id);
        if (u && (u.active !== (e.ativa !== false) || u.name !== e.nome)) {
          const users = readData("users.json");
          const uu = users.find(x => x.id === u.id);
          if (uu) { uu.active = e.ativa !== false; uu.name = e.nome; writeData("users.json", users); }
        }
        portal_username = u?.username || "";
      }
    } catch (err) {
      return res.json({ ok: true, empresa: e, portal_error: err.message });
    }
    res.json({ ok: true, empresa: e, portal_username });
  });

  // ── EXCLUIR (owner/admin) — desativa o acesso do portal junto ──
  app.delete("/api/empresas/:id", requireAdminPlus, (req, res) => {
    if (!["owner", "admin"].includes(req.user.role))
      return res.status(403).json({ ok: false, error: "Somente owner/admin pode excluir empresa" });
    const empresas = readData("empresas.json");
    const idx = empresas.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: "Empresa não encontrada" });
    const removida = empresas.splice(idx, 1)[0];
    writeData("empresas.json", empresas);
    const users = readData("users.json");
    const u = users.find(x => x.role === "empresa" && x.empresa_id === removida.id);
    if (u) { u.active = false; writeData("users.json", users); }
    auditLog(req.user.id, req.user.username, "empresa_excluida", "empresas", removida.id, removida.nome, "");
    res.json({ ok: true });
  });

  // ── LANÇAR PEDIDO (admin — permite faturado) ──────────────
  app.post("/api/empresas/:id/pedido", requireAdminPlus, async (req, res) => {
    try {
      const r = await processarPedidoEmpresa({ readData, writeData }, req.params.id, req.body,
        { id: req.user.id, username: req.user.username, portal: false }, true);
      res.status(r.status).json(r.body);
    } catch (e) {
      console.error("[empresas] pedido erro:", e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ════════════ PORTAL DA EMPRESA (role 'empresa') ════════════
  function requireEmpresa(req, res, next) {
    requireAuth(req, res, () => {
      if (req.user.role !== "empresa")
        return res.status(403).json({ ok: false, error: "Acesso restrito ao portal da empresa" });
      const u = readData("users.json").find(x => x.id === req.user.id);
      const emp = u && readData("empresas.json").find(e => e.id === u.empresa_id);
      if (!emp) return res.status(404).json({ ok: false, error: "Empresa não encontrada — fale com a TopFood" });
      if (emp.ativa === false) return res.status(403).json({ ok: false, error: "Empresa inativa — fale com a TopFood" });
      req.empresa = emp;
      next();
    });
  }

  // Dados da própria empresa (produtos com preço/estoque, lojas, contrato resumido)
  app.get("/api/portal/me", requireEmpresa, (req, res) => {
    const e = req.empresa;
    res.json({ ok: true, empresa: {
      id: e.id, nome: e.nome,
      contrato: { tipo: e.contrato?.tipo || "", fim: e.contrato?.fim || "" },
      contato: e.contato || {},
      lojas: (e.lojas || []).map(l => ({ id: l.id, nome: l.nome, cidade: l.cidade, uf: l.uf })),
      produtos: (e.produtos || []).map((p, i) => ({
        idx: i, nome: p.nome, tipo: p.tipo, unidades_pacote: p.unidades_pacote,
        preco: p.preco, estoque: p.estoque, arte_url: p.arte_url, arte_status: p.arte_status,
      })),
    }});
  });

  // A empresa lança o próprio pedido (sem faturado — PIX/boleto/cartão)
  app.post("/api/portal/pedido", requireEmpresa, async (req, res) => {
    try {
      const r = await processarPedidoEmpresa({ readData, writeData }, req.empresa.id, req.body,
        { id: req.user.id, username: req.user.username, portal: true }, false);
      // não vaza o documento inteiro da empresa pro portal
      if (r.body.empresa) delete r.body.empresa;
      res.status(r.status).json(r.body);
    } catch (e) {
      console.error("[portal] pedido erro:", e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Pedidos da própria empresa
  app.get("/api/portal/pedidos", requireEmpresa, (req, res) => {
    const pedidos = readData("orders.json")
      .filter(o => o.channel === "empresa" && o.empresa_id === req.empresa.id)
      .slice(0, 100)
      .map(portalOrderView);
    res.json({ ok: true, pedidos });
  });

  // DANFE (PDF da nota fiscal) — só de pedido DESTA empresa, e só após autorizada
  app.get("/api/portal/danfe/:orderId", requireEmpresa, async (req, res) => {
    try {
      const order = readData("orders.json")
        .find(o => o.id === req.params.orderId && o.channel === "empresa" && o.empresa_id === req.empresa.id);
      if (!order) return res.status(404).send("Pedido não encontrado");
      if (!order.nfe || order.nfe.status !== "autorizado")
        return res.status(404).send("Nota fiscal ainda não emitida para este pedido");

      const { getFiscalConfig, consultarNFe } = require("./nfe");
      const axios = require("axios");
      const cfg = getFiscalConfig(readData);
      let caminho = order.nfe.caminho_danfe;
      if (!caminho) { const d = await consultarNFe(order.nfe.ref, cfg); caminho = d && d.caminho_danfe; }
      if (!caminho) return res.status(404).send("DANFE ainda não disponível (nota em processamento)");

      const base = cfg.ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
      const token = cfg.ambiente === "producao" ? cfg.token_producao : cfg.token_homologacao;
      const pdf = await axios.get(base + caminho, { auth: { username: token, password: "" }, responseType: "arraybuffer", validateStatus: () => true });
      if (pdf.status !== 200) return res.status(502).send("DANFE indisponível no momento");
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", 'inline; filename="DANFE-' + order.id + '.pdf"');
      res.send(Buffer.from(pdf.data));
    } catch (e) { res.status(500).send("Erro: " + e.message); }
  });

  console.log("✅ M11-F2 Empresas registrado: /api/empresas (+pedido) + /api/portal (login da empresa)");
}

module.exports = { registerEmpresasRoutes };
