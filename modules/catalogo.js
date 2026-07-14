// ============================================================
// CATÁLOGO — /catalogo
// Página gerada do banco de produtos (sempre com os preços
// atuais do site), com layout A4 pronto pra salvar em PDF ou
// imprimir. Feita pros vendedores terem a tabela em mãos.
// ============================================================

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return (parseFloat(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tabelaVariants(p) {
  const temGrade = Array.isArray(p.option_names) && p.option_names.length
    && (p.variants || []).some(v => Array.isArray(v.options) && v.options.length);

  if (temGrade) {
    const cab = p.option_names.map(n => `<th>${esc(n)}</th>`).join("");
    const linhas = (p.variants || []).map(v => {
      const unit = v.units ? (parseFloat(v.price) || 0) / v.units : 0;
      const opts = p.option_names.map((_, d) => `<td>${esc((v.options || [])[d] || "—")}</td>`).join("");
      return `<tr>${opts}<td>${v.units} un</td><td class="preco">R$ ${money(v.price)}</td><td class="un">R$ ${unit.toFixed(2).replace(".", ",")}/un</td></tr>`;
    }).join("");
    return `<table class="tp"><thead><tr>${cab}<th>Pacote</th><th>Preço</th><th>Por unidade</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }

  const linhas = (p.variants || []).map(v => {
    const unit = v.units ? (parseFloat(v.price) || 0) / v.units : 0;
    return `<tr><td>${v.label ? esc(v.label) + " — " : ""}${v.units} un</td><td class="preco">R$ ${money(v.price)}</td><td class="un">R$ ${unit.toFixed(2).replace(".", ",")}/un</td></tr>`;
  }).join("");
  return `<table class="tp"><thead><tr><th>Pacote</th><th>Preço</th><th>Por unidade</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function renderCatalogo(readData) {
  const settings = readData("settings.json") || {};
  const produtos = (readData("products.json") || []).filter(p => p.active !== false);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const fone = String(settings.whatsapp || "5511988856367").replace(/^55/, "");
  const foneFmt = fone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");

  const cards = produtos.map(p => {
    const img = p.image || (p.images && p.images[0]) || "";
    return `
    <div class="produto">
      <div class="p-img">${img ? `<img src="/${esc(img).replace(/^\//, "")}" alt="${esc(p.name)}">` : ""}</div>
      <div class="p-info">
        <h2>${esc(p.name)}</h2>
        ${p.description ? `<p class="p-desc">${esc(p.description)}</p>` : ""}
        ${tabelaVariants(p)}
      </div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Catálogo de Produtos e Preços — TopFood Embalagens</title>
<style>
  @page { size: A4; margin: 11mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f1f5f9; }
  .folha { max-width: 800px; margin: 0 auto; background: #fff; padding: 26px 30px; }

  .topo { display: flex; justify-content: space-between; align-items: center; gap: 12px;
          border-bottom: 4px solid #CC0000; padding-bottom: 14px; flex-wrap: wrap; }
  .marca { font-size: 26px; font-weight: 900; letter-spacing: -.5px; }
  .marca span { color: #CC0000; }
  .marca small { display: block; font-size: 10px; letter-spacing: 3px; color: #6b7280; font-weight: 400; text-transform: uppercase; }
  .topo-dir { text-align: right; font-size: 11px; color: #374151; line-height: 1.7; }
  .topo-dir b { color: #CC0000; }

  h1.tit { font-size: 15px; text-transform: uppercase; letter-spacing: 2px; color: #CC0000;
           text-align: center; margin: 16px 0 2px; }
  .vigencia { text-align: center; font-size: 10.5px; color: #6b7280; margin-bottom: 16px; }

  .produto { display: flex; gap: 16px; border: 1px solid #e5e7eb; border-radius: 10px;
             padding: 14px; margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
  .p-img { width: 130px; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center; }
  .p-img img { width: 130px; height: 130px; object-fit: cover; border-radius: 8px; border: 1px solid #eee; }
  .p-info { flex: 1; min-width: 0; }
  .p-info h2 { font-size: 15px; margin-bottom: 3px; }
  .p-desc { font-size: 10.5px; color: #4b5563; margin-bottom: 8px; line-height: 1.5; }

  table.tp { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.tp th { text-align: left; background: #f8f8f8; color: #374151; padding: 5px 8px;
                border-bottom: 2px solid #CC0000; font-size: 9.5px; text-transform: uppercase; letter-spacing: .5px; }
  table.tp td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
  table.tp td.preco { font-weight: 800; color: #CC0000; white-space: nowrap; }
  table.tp td.un { color: #6b7280; font-size: 10px; white-space: nowrap; }

  .rodape { border-top: 2px solid #CC0000; margin-top: 8px; padding-top: 10px;
            display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px;
            font-size: 10px; color: #6b7280; }

  .barra { position: sticky; top: 0; z-index: 10; background: #1C1C1C; color: #fff;
           padding: 12px 16px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; align-items: center; }
  .barra button, .barra a { background: #CC0000; color: #fff; border: none; padding: 11px 22px;
           border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; text-decoration: none; display: inline-block; }
  .barra a.sec { background: #374151; }
  .barra p { font-size: 11px; color: #9CA3AF; width: 100%; text-align: center; margin: 0; }

  /* ── CAPA ── */
  /* Layout em fluxo: centraliza quando sobra espaço (margin:auto) e
     empilha sem sobrepor quando a tela é baixa — nada absoluto. */
  .capa { min-height: 92vh; display: flex; flex-direction: column; align-items: center;
          text-align: center; page-break-after: always; break-after: page;
          border: 10px solid #CC0000; border-radius: 4px; padding: 30px 24px 24px; margin-bottom: 22px; }
  .capa-conteudo { margin: auto 0; }
  .capa-logo { width: 150px; height: 150px; object-fit: contain; border-radius: 20px; margin-bottom: 20px; }
  .capa-marca { font-size: 38px; font-weight: 900; letter-spacing: -1px; }
  .capa-marca span { color: #CC0000; }
  .capa-sub { font-size: 12px; letter-spacing: 5px; color: #6b7280; text-transform: uppercase; margin-top: 4px; }
  .capa-linha { width: 90px; height: 4px; background: #CC0000; border-radius: 2px; margin: 26px auto 24px; }
  .capa-cat { font-size: 50px; font-weight: 900; letter-spacing: 6px; color: #111; text-transform: uppercase; line-height: 1; }
  .capa-cat-sub { font-size: 16px; color: #374151; margin-top: 10px; letter-spacing: 1px; }
  .capa-ano { display: inline-block; margin-top: 22px; background: #CC0000; color: #fff;
              font-size: 19px; font-weight: 800; padding: 8px 32px; border-radius: 30px; letter-spacing: 2px; }
  .capa-vig { font-size: 11px; color: #6b7280; margin-top: 9px; }
  .capa-rodape { margin-top: auto; padding-top: 26px; font-size: 12px; color: #374151; line-height: 1.9; }
  .capa-rodape b { color: #CC0000; }
  @media print { .capa { min-height: 248mm; } }
  @media (max-width: 560px) { .capa-cat { font-size: 32px; letter-spacing: 3px; } .capa-marca { font-size: 26px; } .capa-logo { width: 110px; height: 110px; } }

  @media print {
    body { background: #fff; }
    .folha { max-width: none; padding: 0; }
    .no-print { display: none !important; }
  }
  @media (max-width: 560px) {
    .produto { flex-direction: column; }
    .p-img img { width: 100%; height: 160px; }
  }
</style>
</head>
<body>

<div class="barra no-print">
  <button onclick="window.print()">🖨️ Baixar PDF / Imprimir</button>
  <a class="sec" href="/">← Voltar ao site</a>
  <p>No celular: toque em "Baixar PDF / Imprimir" e escolha <b>Salvar como PDF</b>.</p>
</div>

<div class="folha">

  <!-- ═══ CAPA ═══ -->
  <div class="capa">
    <div class="capa-conteudo">
      <img class="capa-logo" src="/images/WhatsApp Image 2026-05-22 at 16.14.11 (1).webp" alt="TopFood Embalagens" onerror="this.style.display='none'">
      <div class="capa-marca">Top<span>Food</span> Embalagens</div>
      <div class="capa-sub">Embalagens Food Service</div>
      <div class="capa-linha"></div>
      <div class="capa-cat">Catálogo</div>
      <div class="capa-cat-sub">de Produtos e Preços</div>
      <div class="capa-ano">${new Date().getFullYear()}</div>
      <div class="capa-vig">Tabela vigente em ${hoje}</div>
    </div>
    <div class="capa-rodape">
      📱 <b>${esc(foneFmt)}</b> &nbsp;·&nbsp; 🌐 topfoodembalagens.com.br<br>
      Embalagens que valorizam o seu alimento · Atacado a partir de 50 unidades · Entrega para todo o Brasil
    </div>
  </div>

  <div class="topo">
    <div class="marca">Top<span>Food</span> Embalagens<small>Embalagens Food Service</small></div>
    <div class="topo-dir">
      📱 <b>${esc(foneFmt)}</b><br>
      🌐 topfoodembalagens.com.br<br>
      ✉️ ${esc(settings.store_email || "contato@topfoodembalagens.com.br")}
    </div>
  </div>

  <h1 class="tit">Catálogo de Produtos e Preços</h1>
  <p class="vigencia">Tabela vigente em <b>${hoje}</b> · Preços por pacote · Pagamento via PIX, boleto ou cartão · Entrega para todo o Brasil</p>

  ${cards || '<p style="text-align:center;color:#6b7280;padding:30px">Nenhum produto ativo no momento.</p>'}

  <div class="rodape">
    <span>TopFood Embalagens · CNPJ 67.038.607/0001-31</span>
    <span>Pedidos: topfoodembalagens.com.br ou WhatsApp ${esc(foneFmt)}</span>
    <span>Preços sujeitos a alteração sem aviso — confira sempre a data desta tabela.</span>
  </div>
</div>

</body>
</html>`;
}

// ============================================================
// TABELA DE CUSTOS — /custos
// COFRE SEPARADO: login e senha próprios (independentes do
// painel), guardados em settings. Custos de matéria-prima
// EDITÁVEIS na própria tabela + taxas Asaas/ML → lucro líquido.
// Acesso inicial: wellington / lucro2026 (trocável na página).
// ============================================================
const jwtCustos = require("jsonwebtoken");
const CUSTOS_COOKIE = "tf_custos";
const CUSTOS_SECRET = () => (process.env.JWT_SECRET || "TROQUE_NO_DOT_ENV") + "-custos";
const CUSTOS_DEFAULT_USER = "wellington";
const CUSTOS_DEFAULT_PASS = "lucro2026";

function num(v, fallback) { const n = parseFloat(v); return isNaN(n) ? fallback : n; }

function custosAuth(req) {
  const t = req.cookies?.[CUSTOS_COOKIE];
  if (!t) return null;
  try {
    const p = jwtCustos.verify(t, CUSTOS_SECRET());
    return p && p.area === "custos" ? p : null;
  } catch { return null; }
}

function renderCustosLogin(erro) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Área Restrita — Custos</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,Helvetica,sans-serif; min-height:100vh; display:flex; align-items:center;
         justify-content:center; background:linear-gradient(135deg,#2e1065 0%,#4c1d95 100%); padding:20px; }
  .card { background:#fff; border-radius:18px; padding:40px 34px; width:100%; max-width:380px; text-align:center;
          box-shadow:0 20px 60px rgba(0,0,0,.4); }
  .cadeado { font-size:44px; }
  h1 { font-size:19px; margin:10px 0 4px; }
  p.sub { font-size:12px; color:#6b7280; margin-bottom:22px; }
  input { width:100%; padding:12px 14px; border:1px solid #d1d5db; border-radius:9px; font-size:14px; margin-bottom:10px; }
  button { width:100%; background:#7c3aed; color:#fff; border:none; padding:13px; border-radius:9px;
           font-weight:800; font-size:15px; cursor:pointer; margin-top:4px; }
  .erro { background:#fee2e2; color:#b91c1c; font-size:12px; padding:9px 12px; border-radius:8px; margin-bottom:12px; }
  .volta { display:block; margin-top:16px; font-size:12px; color:#6b7280; text-decoration:none; }
</style></head><body>
<div class="card">
  <div class="cadeado">🔐</div>
  <h1>Custos & Lucro Líquido</h1>
  <p class="sub">Área restrita do proprietário — acesso exclusivo, separado do painel.</p>
  ${erro ? `<div class="erro">${esc(erro)}</div>` : ""}
  <form method="POST" action="/custos/login">
    <input type="text" name="user" placeholder="Usuário" autocomplete="username" required>
    <input type="password" name="pass" placeholder="Senha" autocomplete="current-password" required>
    <button type="submit">Entrar</button>
  </form>
  <a class="volta" href="/admin.html">← voltar ao painel</a>
</div>
</body></html>`;
}

function renderCustos(readData) {
  const settings = readData("settings.json") || {};
  const produtos = (readData("products.json") || []).filter(p => p.active !== false);
  const hoje = new Date().toLocaleDateString("pt-BR");

  // Taxas salvas (padrões pré-preenchidos com referências reais; tudo editável na página)
  // Asaas (site oficial, tabela padrão): PIX e boleto R$ 1,99 fixo; cartão ~2,99% + R$ 0,49
  const aPct = num(settings.custo_taxa_asaas_pct, 0);       // % Asaas sobre a venda (PIX/boleto = 0%)
  const aFix = num(settings.custo_taxa_asaas_fixo, 1.99);   // R$ fixo por venda Asaas (PIX/boleto)
  const mPct = num(settings.custo_taxa_ml_pct, 12);         // % Mercado Livre (clássico — varia por categoria)
  const mFix = num(settings.custo_taxa_ml_fixo, 6);         // R$ fixo ML (custo fixo p/ itens < R$79)
  const sPct = num(settings.custo_taxa_shopee_pct, 20);     // % Shopee (comissão + frete grátis obrigatório 2026)
  const sFix = num(settings.custo_taxa_shopee_fixo, 4);     // R$ fixo Shopee por item (varia por faixa de preço)
  const zPct = num(settings.custo_taxa_amz_pct, 15);        // % Amazon (por categoria, 10–15%)
  const zFix = num(settings.custo_taxa_amz_fixo, 2);        // R$ fixo Amazon (plano individual R$2/item; profissional 0)
  const fPct = num(settings.custo_taxa_fiscal_pct, 4.5);    // % imposto — Simples Nacional 1ª faixa indústria (confirmar c/ contador)
  const vPct = num(settings.custo_taxa_vendedor_pct, 15);   // % comissão do vendedor (10–20)

  const linhas = [];
  for (const p of produtos) {
    (p.variants || []).forEach((v, i) => {
      const detalhe = Array.isArray(v.options) && v.options.length ? v.options.join(" · ")
                    : (v.label || "");
      linhas.push({
        pid: p.id, vidx: i,
        produto: i === 0 ? p.name : "",
        variacao: `${detalhe ? detalhe + " — " : ""}${v.units} un`,
        preco: parseFloat(v.price) || 0,
        custo: parseFloat(v.cost) || 0,
      });
    });
  }

  const rows = linhas.map(l => `
    <tr data-preco="${l.preco}" data-custo="${l.custo}">
      <td class="prod">${esc(l.produto)}</td>
      <td>${esc(l.variacao)}</td>
      <td class="dir">R$ ${money(l.preco)}</td>
      <td class="dir"><input type="number" class="in-custo" data-pid="${esc(l.pid)}" data-vidx="${l.vidx}" step="0.01" min="0" value="${l.custo || ""}" placeholder="0,00"></td>
      <td class="dir c-imposto">—</td>
      <td class="dir c-asaas">—</td>
      <td class="dir c-lsite">—</td>
      <td class="dir c-lvend">—</td>
      <td class="dir c-ml">—</td>
      <td class="dir c-lml">—</td>
      <td class="dir c-shopee">—</td>
      <td class="dir c-lshopee">—</td>
      <td class="dir c-amz">—</td>
      <td class="dir c-lamz">—</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tabela de Custos e Lucro — TopFood (interno)</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f1f5f9; }
  .folha { max-width: 1290px; margin: 0 auto; background: #fff; padding: 22px 26px; }
  .topo { display: flex; justify-content: space-between; align-items: center; gap: 10px;
          border-bottom: 4px solid #7c3aed; padding-bottom: 10px; flex-wrap: wrap; }
  .marca { font-size: 20px; font-weight: 900; }
  .marca span { color: #CC0000; }
  .tag { background: #7c3aed; color: #fff; font-size: 10px; font-weight: 800; padding: 3px 10px;
         border-radius: 12px; letter-spacing: 1px; }
  h1 { font-size: 15px; color: #7c3aed; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin: 14px 0 2px; }
  .vig { text-align: center; font-size: 10px; color: #6b7280; margin-bottom: 12px; }

  .taxas { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; background: #f8f7ff;
           border: 1px solid #e9e5ff; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
  .taxas label { font-size: 10px; font-weight: 700; color: #4b5563; display: block; text-transform: uppercase; }
  .taxas input { width: 86px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; margin-top: 3px; }
  .taxas button { background: #7c3aed; color: #fff; border: none; padding: 9px 18px; border-radius: 8px;
                  font-weight: 700; font-size: 12px; cursor: pointer; }
  .taxas .grupo { border-left: 3px solid #ddd; padding-left: 12px; }
  .taxas .grupo b { font-size: 11px; display: block; margin-bottom: 4px; }

  .tb-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; min-width: 1150px; }
  th { background: #f4f4f5; text-align: right; padding: 6px 6px; font-size: 8.5px; text-transform: uppercase;
       letter-spacing: .3px; color: #374151; border-bottom: 2px solid #7c3aed; }
  th:first-child, th:nth-child(2) { text-align: left; }
  td { padding: 5px 6px; border-bottom: 1px solid #f0f0f0; }
  td.dir { text-align: right; white-space: nowrap; }
  td.prod { font-weight: 800; }
  td.custo { color: #b45309; }
  .falta { color: #dc2626; font-size: 10px; font-style: italic; }
  .lucro-pos { color: #15803d; font-weight: 800; }
  .lucro-neg { color: #dc2626; font-weight: 800; }
  .pct { font-size: 9.5px; color: #6b7280; font-weight: 400; }

  .nota { font-size: 9.5px; color: #6b7280; margin-top: 10px; line-height: 1.6; }
  .barra { position: sticky; top: 0; z-index: 10; background: #1C1C1C; color: #fff; padding: 10px 16px;
           display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
  .barra button, .barra a { background: #7c3aed; color: #fff; border: none; padding: 10px 20px;
           border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; }
  .barra a.sec, .barra button.sec { background: #374151; }
  .in-custo { width: 76px; padding: 5px 6px; border: 1px solid #f0c36d; background: #fffbeb; border-radius: 6px;
              font-size: 11px; text-align: right; color: #92400e; font-weight: 700; }
  .cred { background: #f8f7ff; border: 1px solid #e9e5ff; border-radius: 10px; padding: 12px 14px; margin-top: 14px; }
  .cred summary { font-size: 11px; font-weight: 800; color: #7c3aed; cursor: pointer; }
  .cred input { padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 12px; margin: 6px 6px 0 0; }
  .cred button { background: #7c3aed; color: #fff; border: none; padding: 8px 16px; border-radius: 7px;
                 font-weight: 700; font-size: 11px; cursor: pointer; margin-top: 6px; }
  @media print { body { background:#fff } .folha { max-width:none; padding:0 } .no-print { display:none !important }
                 .in-custo { border:none; background:none; } }
</style>
</head>
<body>

<div class="barra no-print">
  <button onclick="salvarTudo()">💾 Salvar custos e taxas</button>
  <button class="sec" onclick="window.print()">🖨️ PDF / Imprimir</button>
  <a class="sec" href="/catalogo">📖 Catálogo de vendas</a>
  <button class="sec" onclick="sairCustos()">🚪 Sair</button>
</div>

<div class="folha">
  <div class="topo">
    <div class="marca">Top<span>Food</span> Embalagens</div>
    <span class="tag">🔒 USO INTERNO — NÃO DISTRIBUIR</span>
  </div>
  <h1>Tabela de Custos e Lucro Líquido</h1>
  <p class="vig">Gerada em <b>${hoje}</b> · custo de matéria-prima vem do cadastro de produtos (campo "custo" de cada pacote)</p>

  <div class="taxas no-print">
    <div class="grupo" style="border-color:#CC0000"><b>Taxa Asaas (site)</b>
      <div style="display:flex;gap:8px">
        <div><label>% da venda</label><input type="number" id="tx-apct" step="0.01" value="${aPct}"></div>
        <div><label>+ fixo R$</label><input type="number" id="tx-afix" step="0.01" value="${aFix}"></div>
      </div>
    </div>
    <div class="grupo" style="border-color:#facc15"><b>Taxa Mercado Livre</b>
      <div style="display:flex;gap:8px">
        <div><label>% da venda</label><input type="number" id="tx-mpct" step="0.01" value="${mPct}"></div>
        <div><label>+ fixo R$</label><input type="number" id="tx-mfix" step="0.01" value="${mFix}"></div>
      </div>
    </div>
    <div class="grupo" style="border-color:#f97316"><b>Taxa Shopee</b>
      <div style="display:flex;gap:8px">
        <div><label>% da venda</label><input type="number" id="tx-spct" step="0.01" value="${sPct}"></div>
        <div><label>+ fixo R$</label><input type="number" id="tx-sfix" step="0.01" value="${sFix}"></div>
      </div>
    </div>
    <div class="grupo" style="border-color:#111827"><b>Taxa Amazon</b>
      <div style="display:flex;gap:8px">
        <div><label>% da venda</label><input type="number" id="tx-zpct" step="0.01" value="${zPct}"></div>
        <div><label>+ fixo R$</label><input type="number" id="tx-zfix" step="0.01" value="${zFix}"></div>
      </div>
    </div>
    <div class="grupo" style="border-color:#0891b2"><b>Imposto (fiscal)</b>
      <div><label>% da venda</label><input type="number" id="tx-fpct" step="0.01" value="${fPct}"></div>
    </div>
    <div class="grupo" style="border-color:#1d4ed8"><b>Comissão vendedor</b>
      <div><label>% da venda</label><input type="number" id="tx-vpct" step="0.01" value="${vPct}"></div>
    </div>
    <span style="font-size:10px;color:#6b7280;max-width:250px">Asaas: R$ 1,99/venda (PIX/boleto; cartão ≈ 2,99% + R$ 0,49). Imposto: 4,5% = Simples 1ª faixa indústria — <b>confirme com o contador</b>. ML/Shopee/Amazon: confira a % da sua categoria (Shopee 2026: 20% c/ frete grátis + fixo por faixa de preço; Amazon: 10–15% + R$2/item no plano individual). Campos amarelos = <b>custo de matéria-prima por pacote</b>, edite e salve.</span>
  </div>

  <div class="tb-wrap"><table id="tb">
    <thead><tr>
      <th>Produto</th><th>Variação / Pacote</th><th>Preço venda</th><th>Custo mat.-prima</th>
      <th>Imposto</th><th>Taxa Asaas</th><th>Lucro SITE</th><th>Lucro c/ VENDEDOR</th>
      <th>Taxa ML</th><th>Lucro ML</th><th>Taxa Shopee</th><th>Lucro Shopee</th><th>Taxa Amazon</th><th>Lucro Amazon</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="14" style="text-align:center;padding:20px;color:#6b7280">Nenhum produto ativo.</td></tr>'}</tbody>
  </table></div>

  <p class="nota">
    <b>Lucro SITE</b> = preço − matéria-prima − imposto − taxa Asaas &nbsp;·&nbsp;
    <b>Lucro c/ VENDEDOR</b> = Lucro SITE − comissão do vendedor &nbsp;·&nbsp;
    <b>Lucro ML / Shopee / Amazon</b> = preço − matéria-prima − imposto − taxa do canal (frete dos marketplaces não incluso).<br>
    Campos amarelos = custo de matéria-prima por pacote (o mesmo campo "custo" da página Produtos — salvar aqui atualiza lá também).<br>
    🔒 Área restrita com login próprio — não compartilhe este acesso. O catálogo de vendas (sem custos) é o /catalogo.
  </p>

  <details class="cred no-print">
    <summary>🔑 Trocar usuário e senha desta área</summary>
    <div>
      <input type="password" id="cr-atual" placeholder="Senha atual">
      <input type="text" id="cr-user" placeholder="Novo usuário">
      <input type="password" id="cr-pass" placeholder="Nova senha (mín. 6)">
      <button onclick="trocarCred()">Trocar acesso</button>
    </div>
  </details>
</div>

<script>
function fmt(n){ return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function lucroCell(el, v, preco){
  el.innerHTML='<span class="'+(v>=0?'lucro-pos':'lucro-neg')+'">R$ '+fmt(v)+'</span> <span class="pct">('+(preco?Math.round(v/preco*100):0)+'%)</span>';
}
function recalc(){
  var apct=parseFloat(document.getElementById('tx-apct').value)||0, afix=parseFloat(document.getElementById('tx-afix').value)||0;
  var mpct=parseFloat(document.getElementById('tx-mpct').value)||0, mfix=parseFloat(document.getElementById('tx-mfix').value)||0;
  var spct=parseFloat(document.getElementById('tx-spct').value)||0, sfix=parseFloat(document.getElementById('tx-sfix').value)||0;
  var zpct=parseFloat(document.getElementById('tx-zpct').value)||0, zfix=parseFloat(document.getElementById('tx-zfix').value)||0;
  var fpct=parseFloat(document.getElementById('tx-fpct').value)||0, vpct=parseFloat(document.getElementById('tx-vpct').value)||0;
  document.querySelectorAll('#tb tbody tr[data-preco]').forEach(function(tr){
    var preco=parseFloat(tr.dataset.preco)||0;
    var custo=parseFloat(tr.querySelector('.in-custo').value)||0;
    var imposto=preco*fpct/100, ta=preco*apct/100+afix, comis=preco*vpct/100;
    var tm=preco*mpct/100+mfix, ts=preco*spct/100+sfix, tz=preco*zpct/100+zfix;
    tr.querySelector('.c-imposto').textContent='R$ '+fmt(imposto);
    tr.querySelector('.c-asaas').textContent='R$ '+fmt(ta);
    tr.querySelector('.c-ml').textContent='R$ '+fmt(tm);
    tr.querySelector('.c-shopee').textContent='R$ '+fmt(ts);
    tr.querySelector('.c-amz').textContent='R$ '+fmt(tz);
    var ls=tr.querySelector('.c-lsite'), lv=tr.querySelector('.c-lvend'),
        lm=tr.querySelector('.c-lml'), lsh=tr.querySelector('.c-lshopee'), lz=tr.querySelector('.c-lamz');
    if(!custo){ ls.innerHTML=lv.innerHTML=lm.innerHTML=lsh.innerHTML=lz.innerHTML='<span class="falta">sem custo</span>'; return; }
    lucroCell(ls, preco-custo-imposto-ta, preco);
    lucroCell(lv, preco-custo-imposto-ta-comis, preco);
    lucroCell(lm, preco-custo-imposto-tm, preco);
    lucroCell(lsh, preco-custo-imposto-ts, preco);
    lucroCell(lz, preco-custo-imposto-tz, preco);
  });
}
['tx-apct','tx-afix','tx-mpct','tx-mfix','tx-spct','tx-sfix','tx-zpct','tx-zfix','tx-fpct','tx-vpct'].forEach(function(id){ document.getElementById(id).addEventListener('input', recalc); });
document.querySelectorAll('.in-custo').forEach(function(i){ i.addEventListener('input', recalc); });
recalc();

async function salvarTudo(){
  try{
    var taxas={ custo_taxa_asaas_pct:parseFloat(document.getElementById('tx-apct').value)||0,
      custo_taxa_asaas_fixo:parseFloat(document.getElementById('tx-afix').value)||0,
      custo_taxa_ml_pct:parseFloat(document.getElementById('tx-mpct').value)||0,
      custo_taxa_ml_fixo:parseFloat(document.getElementById('tx-mfix').value)||0,
      custo_taxa_shopee_pct:parseFloat(document.getElementById('tx-spct').value)||0,
      custo_taxa_shopee_fixo:parseFloat(document.getElementById('tx-sfix').value)||0,
      custo_taxa_amz_pct:parseFloat(document.getElementById('tx-zpct').value)||0,
      custo_taxa_amz_fixo:parseFloat(document.getElementById('tx-zfix').value)||0,
      custo_taxa_fiscal_pct:parseFloat(document.getElementById('tx-fpct').value)||0,
      custo_taxa_vendedor_pct:parseFloat(document.getElementById('tx-vpct').value)||0 };
    var custos=[].map.call(document.querySelectorAll('.in-custo'),function(i){
      return { product_id:i.dataset.pid, variant_idx:parseInt(i.dataset.vidx,10), cost:parseFloat(i.value)||0 };
    });
    var r=await fetch('/custos/salvar',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
      body:JSON.stringify({taxas:taxas,custos:custos})});
    var d=await r.json();
    alert(d.ok?'✅ Custos e taxas salvos! (os custos também atualizam na página Produtos)':'Erro: '+(d.error||'tente de novo'));
  }catch(e){ alert('Erro ao salvar: '+e.message); }
}
async function trocarCred(){
  try{
    var r=await fetch('/custos/credenciais',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
      body:JSON.stringify({ senha_atual:document.getElementById('cr-atual').value,
        novo_user:document.getElementById('cr-user').value, nova_senha:document.getElementById('cr-pass').value })});
    var d=await r.json();
    alert(d.ok?'✅ Acesso trocado! Use o novo usuário e senha na próxima entrada.':'Erro: '+(d.error||''));
  }catch(e){ alert('Erro: '+e.message); }
}
async function sairCustos(){
  await fetch('/custos/logout',{method:'POST',credentials:'same-origin'});
  location.reload();
}
</script>
</body>
</html>`;
}

function registerCatalogoRoutes(app, readData, decodeUser, writeData) {
  const bcryptC = require("bcryptjs");

  app.get("/catalogo", (req, res) => {
    // material comercial interno — só pra quem está logado no painel
    // (vendedor, admin, sócio...); quem cair aqui sem login vai pro login azul
    const u = decodeUser(req);
    if (!u) return res.redirect("/admin.html?perfil=vendedor");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(renderCatalogo(readData));
  });

  // ── /custos — COFRE com login próprio (independente do painel) ──
  app.get("/custos", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (!custosAuth(req)) return res.send(renderCustosLogin());
    res.send(renderCustos(readData));
  });

  app.post("/custos/login", async (req, res) => {
    const { user, pass } = req.body || {};
    const s = readData("settings.json") || {};
    const userOk = String(user || "").toLowerCase().trim() ===
      String(s.custos_user || CUSTOS_DEFAULT_USER).toLowerCase().trim();
    let passOk = false;
    if (s.custos_pass_hash) passOk = await bcryptC.compare(String(pass || ""), s.custos_pass_hash);
    else {
      // primeiro acesso: senha padrão — já grava o hash pra não ficar em texto
      passOk = String(pass || "") === CUSTOS_DEFAULT_PASS;
      if (userOk && passOk) {
        writeData("settings.json", { ...s,
          custos_user: s.custos_user || CUSTOS_DEFAULT_USER,
          custos_pass_hash: bcryptC.hashSync(CUSTOS_DEFAULT_PASS, 10) });
      }
    }
    if (!userOk || !passOk) {
      await new Promise(r => setTimeout(r, 500));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(401).send(renderCustosLogin("Usuário ou senha incorretos."));
    }
    const token = jwtCustos.sign({ area: "custos" }, CUSTOS_SECRET(), { expiresIn: "8h" });
    res.cookie(CUSTOS_COOKIE, token, {
      httpOnly: true, sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.redirect("/custos");
  });

  app.post("/custos/logout", (req, res) => {
    res.clearCookie(CUSTOS_COOKIE);
    res.json({ ok: true });
  });

  // Salva taxas + custos de matéria-prima (atualiza o campo 'cost' dos produtos)
  app.post("/custos/salvar", (req, res) => {
    if (!custosAuth(req)) return res.status(401).json({ ok: false, error: "Sessão expirada — entre de novo" });
    try {
      const { taxas, custos } = req.body || {};
      if (taxas && typeof taxas === "object") {
        const s = readData("settings.json") || {};
        const permitidas = ["custo_taxa_asaas_pct", "custo_taxa_asaas_fixo", "custo_taxa_ml_pct",
                            "custo_taxa_ml_fixo", "custo_taxa_shopee_pct", "custo_taxa_shopee_fixo",
                            "custo_taxa_amz_pct", "custo_taxa_amz_fixo",
                            "custo_taxa_fiscal_pct", "custo_taxa_vendedor_pct"];
        permitidas.forEach(k => { if (taxas[k] !== undefined) s[k] = num(taxas[k], 0); });
        writeData("settings.json", s);
      }
      if (Array.isArray(custos) && custos.length) {
        const products = readData("products.json");
        for (const c of custos) {
          const p = products.find(pp => pp.id === c.product_id);
          const v = p && (p.variants || [])[c.variant_idx];
          if (v) v.cost = Math.round((parseFloat(c.cost) || 0) * 100) / 100;
        }
        writeData("products.json", products);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Troca usuário/senha desta área (exige a senha atual)
  app.post("/custos/credenciais", async (req, res) => {
    if (!custosAuth(req)) return res.status(401).json({ ok: false, error: "Sessão expirada — entre de novo" });
    try {
      const { senha_atual, novo_user, nova_senha } = req.body || {};
      const s = readData("settings.json") || {};
      const atualOk = s.custos_pass_hash
        ? await bcryptC.compare(String(senha_atual || ""), s.custos_pass_hash)
        : String(senha_atual || "") === CUSTOS_DEFAULT_PASS;
      if (!atualOk) return res.status(401).json({ ok: false, error: "Senha atual incorreta" });
      if (!novo_user || !String(novo_user).trim()) return res.status(400).json({ ok: false, error: "Informe o novo usuário" });
      if (!nova_senha || String(nova_senha).length < 6) return res.status(400).json({ ok: false, error: "Nova senha: mínimo 6 caracteres" });
      s.custos_user = String(novo_user).toLowerCase().trim();
      s.custos_pass_hash = bcryptC.hashSync(String(nova_senha), 10);
      writeData("settings.json", s);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log("✅ Catálogo registrado: /catalogo (equipe) + /custos (cofre com login próprio)");
}

module.exports = { registerCatalogoRoutes };
