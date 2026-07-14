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
  .capa { min-height: 96vh; display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center; page-break-after: always; break-after: page;
          border: 10px solid #CC0000; border-radius: 4px; padding: 40px 24px; position: relative; }
  .capa-logo { width: 170px; height: 170px; object-fit: contain; border-radius: 20px; margin-bottom: 26px; }
  .capa-marca { font-size: 40px; font-weight: 900; letter-spacing: -1px; }
  .capa-marca span { color: #CC0000; }
  .capa-sub { font-size: 12px; letter-spacing: 5px; color: #6b7280; text-transform: uppercase; margin-top: 4px; }
  .capa-linha { width: 90px; height: 4px; background: #CC0000; border-radius: 2px; margin: 34px auto 30px; }
  .capa-cat { font-size: 54px; font-weight: 900; letter-spacing: 6px; color: #111; text-transform: uppercase; line-height: 1; }
  .capa-cat-sub { font-size: 17px; color: #374151; margin-top: 10px; letter-spacing: 1px; }
  .capa-ano { display: inline-block; margin-top: 26px; background: #CC0000; color: #fff;
              font-size: 20px; font-weight: 800; padding: 8px 34px; border-radius: 30px; letter-spacing: 2px; }
  .capa-vig { font-size: 11px; color: #6b7280; margin-top: 10px; }
  .capa-rodape { position: absolute; bottom: 28px; left: 0; right: 0; font-size: 12px;
                 color: #374151; line-height: 1.9; }
  .capa-rodape b { color: #CC0000; }
  @media print { .capa { min-height: 250mm; } }
  @media (max-width: 560px) { .capa-cat { font-size: 34px; letter-spacing: 3px; } .capa-marca { font-size: 28px; } }

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
    <img class="capa-logo" src="/images/WhatsApp Image 2026-05-22 at 16.14.11 (1).webp" alt="TopFood Embalagens" onerror="this.style.display='none'">
    <div class="capa-marca">Top<span>Food</span> Embalagens</div>
    <div class="capa-sub">Embalagens Food Service</div>
    <div class="capa-linha"></div>
    <div class="capa-cat">Catálogo</div>
    <div class="capa-cat-sub">de Produtos e Preços</div>
    <div class="capa-ano">${new Date().getFullYear()}</div>
    <div class="capa-vig">Tabela vigente em ${hoje}</div>
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

function registerCatalogoRoutes(app, readData) {
  app.get("/catalogo", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(renderCatalogo(readData));
  });
  console.log("✅ Catálogo registrado: /catalogo (PDF via imprimir)");
}

module.exports = { registerCatalogoRoutes };
