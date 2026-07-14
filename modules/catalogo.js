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
// TABELA DE CUSTOS — /custos (SÓ owner/admin)
// Catálogo interno com custo de matéria-prima, taxas (Asaas/ML)
// e lucro líquido por canal. Taxas editáveis e salvas em settings.
// ============================================================
function num(v, fallback) { const n = parseFloat(v); return isNaN(n) ? fallback : n; }

function renderCustos(readData) {
  const settings = readData("settings.json") || {};
  const produtos = (readData("products.json") || []).filter(p => p.active !== false);
  const hoje = new Date().toLocaleDateString("pt-BR");

  // taxas salvas (padrões editáveis na própria página)
  const aPct = num(settings.custo_taxa_asaas_pct, 0.99);   // % Asaas sobre a venda
  const aFix = num(settings.custo_taxa_asaas_fixo, 0.49);  // R$ fixo por venda Asaas
  const mPct = num(settings.custo_taxa_ml_pct, 12);        // % Mercado Livre
  const mFix = num(settings.custo_taxa_ml_fixo, 6);        // R$ fixo por venda ML

  const linhas = [];
  for (const p of produtos) {
    (p.variants || []).forEach((v, i) => {
      const detalhe = Array.isArray(v.options) && v.options.length ? v.options.join(" · ")
                    : (v.label || "");
      linhas.push({
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
      <td class="dir custo">${l.custo ? "R$ " + money(l.custo) : '<span class="falta">cadastrar</span>'}</td>
      <td class="dir c-asaas">—</td>
      <td class="dir c-lsite">—</td>
      <td class="dir c-ml">—</td>
      <td class="dir c-lml">—</td>
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
  .folha { max-width: 1050px; margin: 0 auto; background: #fff; padding: 22px 26px; }
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

  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { background: #f4f4f5; text-align: right; padding: 7px 8px; font-size: 9.5px; text-transform: uppercase;
       letter-spacing: .4px; color: #374151; border-bottom: 2px solid #7c3aed; }
  th:first-child, th:nth-child(2) { text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
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
  .barra a.sec { background: #374151; }
  @media print { body { background:#fff } .folha { max-width:none; padding:0 } .no-print { display:none !important } }
</style>
</head>
<body>

<div class="barra no-print">
  <button onclick="window.print()">🖨️ Baixar PDF / Imprimir</button>
  <a class="sec" href="/catalogo">📖 Ver catálogo de vendas</a>
  <a class="sec" href="/admin.html">← Painel</a>
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
    <button onclick="salvarTaxas()">💾 Salvar taxas</button>
    <span style="font-size:10px;color:#6b7280;max-width:220px">Ajuste conforme seu plano no Asaas e a categoria no ML — a tabela recalcula na hora.</span>
  </div>

  <table id="tb">
    <thead><tr>
      <th>Produto</th><th>Variação / Pacote</th><th>Preço venda</th><th>Custo mat.-prima</th>
      <th>Taxa Asaas</th><th>Lucro venda SITE</th><th>Taxa ML</th><th>Lucro venda ML</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#6b7280">Nenhum produto ativo.</td></tr>'}</tbody>
  </table>

  <p class="nota">
    Lucro SITE = preço − custo matéria-prima − taxa Asaas · Lucro ML = preço − custo matéria-prima − taxa ML (frete do ML não incluso).<br>
    Linhas com custo "cadastrar": preencha o campo <b>custo</b> do pacote na página Produtos do painel para o cálculo aparecer.<br>
    🔒 Documento interno com custos e margens — não enviar a vendedores nem clientes. O catálogo de vendas (sem custos) é o /catalogo.
  </p>
</div>

<script>
function fmt(n){ return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function recalc(){
  var apct=parseFloat(document.getElementById('tx-apct').value)||0, afix=parseFloat(document.getElementById('tx-afix').value)||0;
  var mpct=parseFloat(document.getElementById('tx-mpct').value)||0, mfix=parseFloat(document.getElementById('tx-mfix').value)||0;
  document.querySelectorAll('#tb tbody tr[data-preco]').forEach(function(tr){
    var preco=parseFloat(tr.dataset.preco)||0, custo=parseFloat(tr.dataset.custo)||0;
    var ta=preco*apct/100+afix, tm=preco*mpct/100+mfix;
    tr.querySelector('.c-asaas').textContent='R$ '+fmt(ta);
    tr.querySelector('.c-ml').textContent='R$ '+fmt(tm);
    var ls=tr.querySelector('.c-lsite'), lm=tr.querySelector('.c-lml');
    if(!custo){ ls.innerHTML='<span class="falta">sem custo</span>'; lm.innerHTML='<span class="falta">sem custo</span>'; return; }
    var vs=preco-custo-ta, vm=preco-custo-tm;
    ls.innerHTML='<span class="'+(vs>=0?'lucro-pos':'lucro-neg')+'">R$ '+fmt(vs)+'</span> <span class="pct">('+(preco?Math.round(vs/preco*100):0)+'%)</span>';
    lm.innerHTML='<span class="'+(vm>=0?'lucro-pos':'lucro-neg')+'">R$ '+fmt(vm)+'</span> <span class="pct">('+(preco?Math.round(vm/preco*100):0)+'%)</span>';
  });
}
['tx-apct','tx-afix','tx-mpct','tx-mfix'].forEach(function(id){ document.getElementById(id).addEventListener('input', recalc); });
recalc();
async function salvarTaxas(){
  try{
    var r=await fetch('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({
      custo_taxa_asaas_pct:parseFloat(document.getElementById('tx-apct').value)||0,
      custo_taxa_asaas_fixo:parseFloat(document.getElementById('tx-afix').value)||0,
      custo_taxa_ml_pct:parseFloat(document.getElementById('tx-mpct').value)||0,
      custo_taxa_ml_fixo:parseFloat(document.getElementById('tx-mfix').value)||0
    })});
    alert(r.ok?'Taxas salvas! Da próxima vez a tabela já abre com elas.':'Erro ao salvar — faça login no painel de novo.');
  }catch(e){ alert('Erro ao salvar: '+e.message); }
}
</script>
</body>
</html>`;
}

function registerCatalogoRoutes(app, readData, decodeUser) {
  app.get("/catalogo", (req, res) => {
    // material comercial interno — só pra quem está logado no painel
    // (vendedor, admin, sócio...); quem cair aqui sem login vai pro login azul
    const u = decodeUser(req);
    if (!u) return res.redirect("/admin.html?perfil=vendedor");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(renderCatalogo(readData));
  });

  // Tabela de custos/lucro: SÓ owner e admin — custo nunca chega
  // a vendedor, sócio limitado, empresa ou público
  app.get("/custos", (req, res) => {
    const u = decodeUser(req);
    if (!u) return res.redirect("/admin.html");
    if (!["owner", "admin"].includes(u.role)) return res.status(403).send("Acesso restrito ao administrador.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(renderCustos(readData));
  });

  console.log("✅ Catálogo registrado: /catalogo (equipe) + /custos (owner/admin)");
}

module.exports = { registerCatalogoRoutes };
