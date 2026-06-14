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
    + (imgEsc ? '<img src="' + imgEsc + '" alt="' + name + ' para delivery — embalagem food service TopFood" loading="lazy" />' : '') + '</a>'
    + '<div class="product-body">'
    + (cat ? '<div class="product-cat">' + cat + '</div>' : '')
    + '<h3><a href="/produto/' + id + '" style="color:inherit;text-decoration:none">' + name + '</a></h3>'
    + '<p>' + desc + '</p>'
    + '<div class="price-row"><div class="price-block"><div class="price-from">A partir de</div>'
    + '<div class="price-val">' + precoFmt + '</div></div>'
    + '<a href="/produto/' + id + '" class="add-btn">Ver produto</a></div>'
    + '</div></div>';
}

// Conteúdo SEO por categoria (texto persuasivo + FAQ específica)
const CONTEUDO = {
  hamburger: {
    intro: 'Caixa delivery desenvolvida para hamburguerias, lanchonetes e food trucks que querem entregar o lanche com aparência profissional. O fechamento seguro evita que o pão amasse no transporte e o papel duplex 250g preserva a apresentação do produto até a casa do cliente.',
    faq: { q: 'A embalagem é resistente para o transporte do delivery?', a: 'Sim. O papel duplex 250g e o fechamento seguro protegem o hambúrguer durante toda a entrega.' }
  },
  pastel: {
    intro: 'Embalagem pillow box ideal para pastelarias e food trucks. O formato prático ajuda a preservar a crocância do pastel e o design exclusivo valoriza o seu produto na entrega, passando profissionalismo para o cliente.',
    faq: { q: 'A embalagem ajuda a manter o pastel crocante?', a: 'Sim. O formato pillow box permite a saída do vapor, ajudando a preservar a textura do pastel.' }
  },
  churros: {
    intro: 'Caixa desenvolvida para quem vende churros gourmet e doces. O formato protege o produto e o acabamento em papel duplex 250g com impressão offset dá um visual elegante e apetitoso para a sua marca.',
    faq: { q: 'Serve para churros recheados?', a: 'Sim, o formato comporta churros tradicionais e recheados com segurança.' }
  },
  fritas: {
    intro: 'Embalagem pensada para batata frita e porções. Mantém a crocância e a temperatura por mais tempo, com um design que valoriza o seu produto tanto no delivery quanto no balcão.',
    faq: { q: 'A embalagem mantém a batata crocante?', a: 'Sim. O formato favorece a ventilação e o papel duplex 250g conserva a temperatura por mais tempo.' }
  },
  batata: {
    intro: 'Embalagem pensada para batata frita e porções. Mantém a crocância e a temperatura por mais tempo, com um design que valoriza o seu produto tanto no delivery quanto no balcão.',
    faq: { q: 'A embalagem mantém a batata crocante?', a: 'Sim. O formato favorece a ventilação e o papel duplex 250g conserva a temperatura por mais tempo.' }
  }
};

// Gera a seção de conteúdo SEO (HTML) + FAQPage schema, por produto
function seoContent(product) {
  const cat   = (product.category || '').toLowerCase();
  const termo = CAT_TERMO[cat] || 'Delivery';
  const c     = CONTEUDO[cat] || { intro: 'Embalagem food service profissional para delivery e balcão, em papel duplex 250g com impressão offset de alta qualidade.', faq: null };

  const faqs = [
    { q: 'Qual é o pedido mínimo?', a: 'O pedido mínimo é de 50 unidades.' },
    { q: 'Vocês entregam em todo o Brasil?', a: 'Sim. O frete é calculado pelo seu CEP no momento do checkout.' },
    { q: 'Qual é o material da embalagem?', a: 'Papel duplex 250g com impressão offset de alta definição.' }
  ];
  if (c.faq) faqs.push(c.faq);

  const faqHtml = faqs.map(f =>
    '<div style="margin:10px 0"><strong style="color:#CC0000">' + esc(f.q) + '</strong>'
    + '<p style="margin:4px 0 0">' + esc(f.a) + '</p></div>'
  ).join('');

  const html =
    '<section class="seo-content" style="max-width:900px;margin:8px auto 32px;padding:24px 20px;line-height:1.7;color:#333;border-top:1px solid #eee">'
    + '<h2 style="font-size:1.3rem;margin-bottom:10px">Por que escolher a embalagem para ' + esc(termo) + ' da TopFood?</h2>'
    + '<p>' + esc(c.intro) + '</p>'
    + '<h3 style="font-size:1.1rem;margin:18px 0 8px">Especificações</h3>'
    + '<ul style="padding-left:20px;margin:0">'
    + '<li>📦 Material: papel duplex 250g</li>'
    + '<li>🖨️ Impressão: offset de alta definição</li>'
    + '<li>🔢 Pacotes: 50, 100 ou 250 unidades</li>'
    + '<li>🚚 Envio para todo o Brasil — pedido mínimo de 50 unidades</li>'
    + '</ul>'
    + '<h3 style="font-size:1.1rem;margin:18px 0 8px">Perguntas frequentes</h3>'
    + faqHtml
    + '</section>';

  const faqSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question", "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  });

  return { html: html, faqSchema: '<script type="application/ld+json">' + faqSchema + '</script>' };
}

// Bloco de conteúdo SEO da home — card elegante e centralizado (aprovado pelo Wellington)
function homeContent() {
  const chip = (icone, texto) =>
    '<span style="display:inline-flex;align-items:center;gap:7px;background:#FFF6E5;color:#1a1a1a;'
    + 'border:1px solid #FFD699;border-radius:24px;padding:9px 18px;font-weight:600;font-size:.92rem">'
    + icone + ' ' + texto + '</span>';
  return '\n<section class="home-seo" style="max-width:1000px;margin:36px auto;padding:0 20px">'
    + '<div style="background:#fff;border-radius:18px;box-shadow:0 8px 32px rgba(0,0,0,.08);'
    + 'padding:44px 32px;text-align:center;line-height:1.75;color:#444">'
    + '<h2 style="font-size:1.65rem;font-weight:800;color:#1a1a1a;margin:0">Embalagens food service para delivery</h2>'
    + '<div style="width:66px;height:4px;background:#CC0000;border-radius:2px;margin:14px auto 24px"></div>'
    + '<p style="max-width:760px;margin:0 auto 14px">A <strong>TopFood Embalagens</strong> produz embalagens para delivery e food service pensadas para <strong>hamburguerias, pastelarias, lanchonetes, food trucks e restaurantes</strong>. Trabalhamos com <strong>papel duplex 250g e impressão offset</strong> de alta definição — embalagens resistentes, bonitas e que valorizam o seu produto na entrega.</p>'
    + '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:26px auto 22px">'
    + chip('🍔', 'Embalagem para Hambúrguer') + chip('🥟', 'Embalagem para Pastel')
    + chip('🌭', 'Embalagem para Churros') + chip('🍟', 'Embalagem para Batata Frita')
    + '</div>'
    + '<p style="max-width:760px;margin:0 auto 16px">Todos os modelos com <strong>design chalk art exclusivo</strong>, em pacotes a partir de 50 unidades e envio para todo o Brasil.</p>'
    + '<p style="max-width:760px;margin:0 auto;font-weight:700;color:#CC0000;font-size:1.02rem">Compre no atacado direto do site, com pagamento via PIX · Pedido mínimo de 50 unidades</p>'
    + '</div></section>\n';
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
      // injeta a seção de conteúdo SEO antes do rodapé
      if (html.indexOf('<footer>') !== -1) html = html.replace('<footer>', homeContent() + '<footer>');
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      console.error('[SEO] SSR home falhou, servindo estático:', e.message);
      next(); // qualquer erro → cai no express.static (nunca quebra a home)
    }
  });
  console.log('[SEO] SSR da home registrado (produtos no HTML)');
}

module.exports = { registerSeoRoutes, seoTitle, seoContent };
