// ============================================================
// SEO — Renderização no servidor (SSR) da home
// Injeta os produtos no HTML que o servidor entrega, pro Google
// "ler" os produtos direto (antes vinham só via JavaScript).
// O app.js depois re-renderiza a versão interativa completa.
// ============================================================
const fs = require('fs');
const path = require('path');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Termo de busca por categoria (como as pessoas pesquisam no Google)
const CAT_TERMO = {
  hamburger: 'Hambúrguer', burger: 'Hambúrguer', pastel: 'Pastel',
  churros: 'Churros', fritas: 'Batata Frita', batata: 'Batata Frita',
  pizza: 'Pizza', acai: 'Açaí', doces: 'Doces'
};

// Título SEO otimizado por produto: "Embalagem para <tipo> <diferencial> | Atacado — TopFood"
function seoTitle(p) {
  const cat = (p.category || '').toLowerCase();
  const termo = CAT_TERMO[cat] || (p.category ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : 'Delivery');
  let dif = '';
  const parts = (p.name || '').split(/[—–-]/);
  if (parts.length > 1) dif = parts[parts.length - 1].trim();
  let base = 'Embalagem para ' + termo;
  if (dif && dif.toLowerCase().indexOf(termo.toLowerCase()) === -1) base += ' ' + dif;
  return (base + ' | Atacado — TopFood').slice(0, 68);
}

function cardHTML(p) {
  const id    = esc(p.id);
  const name  = esc(p.name || '');
  const desc  = esc(p.description || '');
  const cat   = p.category ? esc(p.category.charAt(0).toUpperCase() + p.category.slice(1)) : '';
  const img   = p.image ? (String(p.image).startsWith('http') ? p.image : '/' + String(p.image).replace(/^\//, '')) : '';
  const imgEsc = esc(img);
  const minPrice = (p.variants && p.variants.length)
    ? Math.min.apply(null, p.variants.map(v => v.price))
    : 0;
  const precoFmt = 'R$ ' + Number(minPrice).toFixed(2).replace('.', ',');
  return '\n      <div class="product-card" id="' + id + '">'
    + '<a href="/produto/' + id + '" class="product-img" style="display:block;text-decoration:none">'
    + (imgEsc ? '<img src="' + imgEsc + '" alt="' + name + '" loading="lazy" />' : '') + '</a>'
    + '<div class="product-body">'
    + (cat ? '<div class="product-cat">' + cat + '</div>' : '')
    + '<h3><a href="/produto/' + id + '" style="color:inherit;text-decoration:none">' + name + '</a></h3>'
    + '<p>' + desc + '</p>'
    + '<div class="price-row"><div class="price-block"><div class="price-from">A partir de</div>'
    + '<div class="price-val">' + precoFmt + '</div></div>'
    + '<a href="/produto/' + id + '" class="add-btn">Ver produto</a></div>'
    + '</div></div>';
}

// Registra a rota da home com SSR. DEVE ser chamada ANTES do express.static.
function registerSeoRoutes(app, readData) {
  app.get('/', function (req, res, next) {
    try {
      const products = (readData('products.json') || []).filter(p => p.active !== false);
      let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

      const anchor = '<div id="products-loading"';
      const idx = html.indexOf(anchor);
      if (!products.length || idx === -1) return next(); // sem produtos ou âncora → serve estático normal

      // injeta os cards ANTES do spinner (Google lê; JS depois substitui o grid)
      const cards = products.map(cardHTML).join('');
      html = html.replace(anchor, cards + '\n    <div id="products-loading"');
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      console.error('[SEO] SSR home falhou, servindo estático:', e.message);
      next(); // qualquer erro → cai no express.static (nunca quebra a home)
    }
  });
  console.log('[SEO] SSR da home registrado (produtos no HTML)');
}

module.exports = { registerSeoRoutes, seoTitle };
