// ============================================================
// Guias / Conteúdo SEO — páginas-artigo que atacam termos com
// intenção de compra onde o site ainda não aparece (dados GSC):
// "embalagem para pastel", "para churros", "para hambúrguer
// atacado", "para batata frita". Cada guia tem Article + FAQPage
// + Breadcrumb schema e link interno para a loja (passa relevância
// para as páginas de produto). Servido em /guia/:slug.
// ============================================================

const SITE = 'https://topfoodembalagens.com.br';
const WHATS = 'https://wa.me/5511988856367';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Conteúdo dos guias ──────────────────────────────────────
const GUIAS = {
  'embalagem-para-pastel': {
    title: 'Embalagem para Pastel: Como Escolher e Entregar Crocante | TopFood',
    h1: 'Embalagem para Pastel: o guia para entregar crocante no delivery',
    desc: 'Como escolher a embalagem para pastel ideal: o pillow box que deixa o vapor sair, mantém a crocância, resiste à gordura e valoriza seu pastel no delivery. Atacado a partir de 50 unidades.',
    keywords: 'embalagem para pastel, embalagem pastel delivery, pillow box pastel, caixa para pastel, embalagem pastel atacado',
    cta: 'Ver embalagens para pastel',
    secoes: [
      { h2: 'Por que a embalagem do pastel faz diferença', p: 'No delivery, a embalagem é a primeira coisa que o cliente vê — e a responsável por entregar o pastel do jeito que saiu da chapa. Uma embalagem errada deixa o pastel <strong>murcho, oleoso e sem graça</strong>, e isso derruba a recompra. Uma embalagem certa preserva a crocância, segura a gordura e ainda passa profissionalismo para a sua marca.' },
      { h2: 'O erro nº1: o pastel que chega murcho', p: 'Pastel quente solta vapor. Se a embalagem for fechada e sem ventilação, esse vapor condensa e <strong>amolece a massa</strong> no caminho. A solução não é furar qualquer caixa — é usar um formato pensado para isso: o <strong>pillow box</strong>, que tem aberturas naturais nas laterais por onde o vapor escapa, mantendo a casquinha crocante até a casa do cliente.' },
      { h2: 'Pillow box: o formato ideal para pastel', p: 'O pillow box (formato "travesseiro") é a escolha dos pasteleiros que levam o delivery a sério: monta em segundos, acomoda bem o pastel, deixa o vapor sair e ainda tem uma área generosa para a sua marca. É prático para o operador e bonito para o cliente.' },
      { h2: 'Material: resistência à gordura e ao calor', p: 'Pastel é gorduroso por natureza. A embalagem precisa de papel com <strong>boa gramatura e barreira à gordura</strong>, para não encharcar nem transparecer a oleosidade. Na TopFood usamos papel resistente com impressão offset de alta definição — firme na mão e bonito na entrega.' },
      { h2: 'Quanto comprar: atacado a partir de 50 unidades', p: 'Para quem está começando, dá para pedir a partir de <strong>50 unidades</strong>; quem já tem volume fecha pacotes de 100 ou 250 com preço melhor. Assim você testa sem estoque parado e escala conforme as vendas crescem.' }
    ],
    faq: [
      { q: 'A embalagem mantém o pastel crocante?', a: 'Sim. O formato pillow box permite a saída do vapor, ajudando a preservar a textura crocante do pastel durante a entrega.' },
      { q: 'Qual é o pedido mínimo de embalagem para pastel?', a: 'O pedido mínimo é de 50 unidades. Também há pacotes de 100 e 250 com preço de atacado.' },
      { q: 'A embalagem aguenta a gordura do pastel?', a: 'Sim. Usamos papel resistente com barreira à gordura, que não encharca durante o transporte.' },
      { q: 'Vocês entregam em todo o Brasil?', a: 'Sim. O frete é calculado pelo seu CEP no checkout, com envio via Correios (PAC ou SEDEX) para todo o Brasil.' }
    ]
  },

  'embalagem-para-hamburguer': {
    title: 'Embalagem para Hambúrguer no Atacado: Caixa de Delivery que Não Amassa | TopFood',
    h1: 'Embalagem para Hambúrguer: a caixa de delivery que não amassa',
    desc: 'Caixa para hambúrguer no atacado: papel firme que não amassa o pão, mantém o lanche apresentável no delivery e valoriza a sua marca. Pedido a partir de 50 unidades.',
    keywords: 'embalagem para hambúrguer, embalagem hambúrguer atacado, caixa para hambúrguer delivery, embalagem delivery hamburguer, caixa hamburguer',
    cta: 'Ver caixas para hambúrguer',
    secoes: [
      { h2: 'A caixa certa protege o seu lanche (e a sua marca)', p: 'No delivery de hambúrguer, o lanche balança, vira e esfria no caminho. A <strong>caixa certa</strong> segura o pão, mantém a montagem no lugar e entrega o hambúrguer com a mesma cara que ele tinha no balcão. É o que separa uma hamburgueria amadora de uma profissional.' },
      { h2: 'O problema: pão amassado e lanche desmontado', p: 'Saco plástico e papel mole não seguram o lanche: o pão amassa, o recheio escorrega e o cliente recebe um hambúrguer "desmontado". Uma caixa com <strong>papel firme e fechamento seguro</strong> resolve isso — o lanche chega inteiro e apresentável.' },
      { h2: 'Material que segura calor e gordura', p: 'Nossas caixas usam <strong>papel triplex 250g</strong> com impressão offset — firme o suficiente para não ceder com o peso e o calor do lanche, e com acabamento que valoriza a sua marca. O resultado é uma entrega que parece de hamburgueria grande.' },
      { h2: 'Comprar no atacado: a partir de 50 unidades', p: 'Você pode começar com <strong>50 unidades</strong> e escalar para 100 ou 250 conforme o movimento. Comprar embalagem de hambúrguer no atacado direto do fabricante reduz o custo por lanche e melhora a sua margem.' }
    ],
    faq: [
      { q: 'A embalagem é resistente para o transporte do delivery?', a: 'Sim. O papel triplex 250g e o fechamento seguro protegem o hambúrguer durante toda a entrega, sem amassar o pão.' },
      { q: 'Dá para comprar caixa de hambúrguer no atacado?', a: 'Sim. Trabalhamos com pacotes de 50, 100 e 250 unidades, com preço de atacado direto do fabricante.' },
      { q: 'A caixa serve para hambúrguer artesanal grande?', a: 'Sim, o formato acomoda lanches altos e artesanais com segurança.' },
      { q: 'Vocês entregam em todo o Brasil?', a: 'Sim. O frete é calculado pelo seu CEP no checkout, com envio via Correios para todo o Brasil.' }
    ]
  },

  'embalagem-para-churros': {
    title: 'Embalagem para Churros: a Caixa Ideal para Vender no Delivery | TopFood',
    h1: 'Embalagem para Churros: a caixa ideal para o seu delivery',
    desc: 'Embalagem para churros que protege o produto, comporta churros tradicionais e recheados e valoriza a sua marca no delivery. Atacado a partir de 50 unidades.',
    keywords: 'embalagem para churros, caixa para churros, embalagem churros delivery, embalagem churros atacado',
    cta: 'Ver embalagens para churros',
    secoes: [
      { h2: 'A embalagem que valoriza o churros gourmet', p: 'Churros gourmet vende pelos olhos. Uma <strong>caixa bem desenhada</strong> protege o produto, organiza os recheios e dá ao seu churros o ar premium que justifica o preço. No delivery, é ela que segura a experiência até a casa do cliente.' },
      { h2: 'Protege o recheio e o açúcar', p: 'Churros recheado e polvilhado precisa chegar inteiro, sem o recheio vazando nem o açúcar todo no fundo do saco. Uma caixa com <strong>formato firme</strong> mantém o churros na posição e preserva a apresentação.' },
      { h2: 'Material e acabamento', p: 'Usamos <strong>papel triplex 250g com impressão offset</strong> de alta definição: visual elegante, apetitoso e resistente. A embalagem certa transforma um churros simples em um produto de marca.' },
      { h2: 'Atacado a partir de 50 unidades', p: 'Comece com <strong>50 unidades</strong> e cresça para 100 ou 250 com preço melhor. Ideal para quem vende em feiras, eventos, trailer ou delivery e quer profissionalizar a entrega.' }
    ],
    faq: [
      { q: 'Serve para churros recheados?', a: 'Sim. O formato comporta churros tradicionais e recheados com segurança, mantendo o recheio no lugar.' },
      { q: 'Qual é o pedido mínimo?', a: 'O pedido mínimo é de 50 unidades, com pacotes de 100 e 250 a preço de atacado.' },
      { q: 'A embalagem é resistente para o delivery?', a: 'Sim. O papel triplex 250g protege o churros durante todo o transporte.' },
      { q: 'Vocês entregam em todo o Brasil?', a: 'Sim. O frete é calculado pelo seu CEP no checkout, com envio via Correios para todo o Brasil.' }
    ]
  },

  'embalagem-para-batata-frita': {
    title: 'Embalagem para Batata Frita: Como Manter Crocante na Entrega | TopFood',
    h1: 'Embalagem para Batata Frita: como manter crocante no delivery',
    desc: 'Embalagem para batata frita que mantém a crocância e a temperatura por mais tempo. Cone, balde e caixa para porções no delivery e no balcão. Atacado a partir de 50 unidades.',
    keywords: 'embalagem para batata frita, embalagem batata frita delivery, caixa para batata frita, embalagem para fritas, embalagem batata frita atacado',
    cta: 'Ver embalagens para batata frita',
    secoes: [
      { h2: 'O desafio: batata frita que chega murcha', p: 'A batata frita é o item que mais sofre no delivery: fechada num saco sem ventilação, ela <strong>cozinha no próprio vapor</strong> e chega murcha. A embalagem certa favorece a ventilação e conserva a crocância e a temperatura por mais tempo.' },
      { h2: 'Formatos que ventilam: cone, balde e caixa', p: 'Para porções, o <strong>cone e o balde</strong> deixam o vapor escapar e mantêm a batata sequinha. Para combos, a caixa para porções organiza a entrega. Cada formato tem seu uso — o importante é não abafar a batata num saco fechado.' },
      { h2: 'Material que segura o calor', p: 'Usamos <strong>papel triplex 250g</strong> que conserva a temperatura por mais tempo e não encharca com a gordura. Resultado: a batata chega quente, crocante e com boa apresentação.' },
      { h2: 'Atacado a partir de 50 unidades', p: 'Comece com <strong>50 unidades</strong> e escale para 100 ou 250. Embalagem de batata frita no atacado direto do fabricante deixa o custo por porção mais baixo e a margem melhor.' }
    ],
    faq: [
      { q: 'A embalagem mantém a batata crocante?', a: 'Sim. O formato favorece a ventilação e o papel triplex 250g conserva a temperatura por mais tempo, ajudando a manter a crocância.' },
      { q: 'Qual formato é melhor para delivery de batata frita?', a: 'Cone e balde são ótimos para porções individuais porque ventilam; a caixa para porções é ideal para combos.' },
      { q: 'Qual é o pedido mínimo?', a: 'O pedido mínimo é de 50 unidades, com pacotes de 100 e 250 a preço de atacado.' },
      { q: 'Vocês entregam em todo o Brasil?', a: 'Sim. O frete é calculado pelo seu CEP no checkout, com envio via Correios para todo o Brasil.' }
    ]
  }
};

// ── Render da página de um guia ─────────────────────────────
function renderGuia(slug) {
  const g = GUIAS[slug];
  if (!g) return null;
  const url = SITE + '/guia/' + slug;

  const corpo = g.secoes.map(s =>
    '<h2>' + esc(s.h2) + '</h2><p>' + s.p + '</p>'
  ).join('\n');

  const faqHtml = g.faq.map(f =>
    '<h3 style="font-size:1rem;font-weight:700;margin:18px 0 6px;color:#111">' + esc(f.q) + '</h3>'
    + '<p>' + esc(f.a) + '</p>'
  ).join('\n');

  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: g.h1,
    description: g.desc,
    inLanguage: 'pt-BR',
    author: { '@type': 'Organization', name: 'TopFood Embalagens' },
    publisher: { '@type': 'Organization', name: 'TopFood Embalagens', url: SITE },
    mainEntityOfPage: url
  });
  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: g.faq.map(f => ({ '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  });
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Guias', item: SITE + '/guias' },
      { '@type': 'ListItem', position: 3, name: g.h1, item: url }
    ]
  });

  // Outros guias (links internos no rodapé do artigo)
  const outros = Object.keys(GUIAS).filter(s => s !== slug)
    .map(s => '<li><a href="/guia/' + s + '">' + esc(GUIAS[s].h1) + '</a></li>').join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(g.title)}</title>
<meta name="description" content="${esc(g.desc)}"/>
<meta name="keywords" content="${esc(g.keywords)}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${url}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${esc(g.h1)}"/>
<meta property="og:description" content="${esc(g.desc)}"/>
<meta property="og:url" content="${url}"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@700;800&display=swap" rel="stylesheet"/>
<script type="application/ld+json">${articleSchema}</script>
<script type="application/ld+json">${faqSchema}</script>
<script type="application/ld+json">${breadcrumb}</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--red:#CC0000;--black:#111;--gray:#6B7280;--border:#E5E7EB}
body{font-family:Inter,sans-serif;background:#f9fafb;color:#111}
a{color:var(--red);text-decoration:none}
.topbar{background:#111;padding:8px 5%;font-size:.76rem;color:#9CA3AF;display:flex;justify-content:space-between}
.header{background:#fff;padding:14px 5%;display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--red);position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.logo-wrap{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-wrap img{height:52px;width:auto}
.logo-name{font-family:Poppins,sans-serif;font-weight:800;font-size:1.1rem;color:var(--red)}
.container{max-width:860px;margin:0 auto;padding:48px 5% 60px}
.breadcrumb{font-size:.82rem;color:var(--gray);margin-bottom:24px}
.breadcrumb a{color:var(--red);font-weight:600}
h1{font-family:Poppins,sans-serif;font-size:1.8rem;font-weight:800;margin-bottom:8px;line-height:1.25}
.lead{font-size:1rem;color:#374151;margin:14px 0 24px;padding-bottom:20px;border-bottom:1px solid var(--border)}
h2{font-size:1.18rem;font-weight:700;margin:30px 0 10px;color:var(--black)}
p,li{font-size:.96rem;line-height:1.85;color:#374151;margin-bottom:10px}
ul,ol{padding-left:20px;margin-bottom:12px}
.cta{display:inline-block;background:var(--red);color:#fff;font-weight:700;padding:14px 26px;border-radius:10px;margin:24px 0;font-size:1rem}
.cta:hover{background:#a30000}
.faq-wrap{margin-top:34px;padding-top:24px;border-top:1px solid var(--border)}
.outros{margin-top:36px;padding:22px;background:#fff;border:1px solid var(--border);border-radius:12px}
.outros h2{margin-top:0}
.footer-mini{background:#111;color:#6B7280;text-align:center;padding:24px;font-size:.78rem;margin-top:40px}
</style>
</head>
<body>
<div class="topbar"><span>🚚 Frete para todo Brasil &nbsp;|&nbsp; 📦 Pacotes a partir de 50 un</span><a href="${WHATS}">📱 (11) 98885-6367</a></div>
<header class="header">
  <a href="/" class="logo-wrap">
    <img src="/images/WhatsApp Image 2026-05-22 at 16.14.11 (1).jpeg" alt="TopFood" onerror="this.style.display='none'"/>
    <span class="logo-name">TopFood <span style="color:#111;font-weight:400;font-size:.85rem">Embalagens</span></span>
  </a>
  <a href="/" style="margin-left:auto;font-size:.85rem;color:var(--red);font-weight:600">← Voltar à loja</a>
</header>

<div class="container">
  <div class="breadcrumb"><a href="/">Início</a> › <a href="/guias">Guias</a> › ${esc(g.h1)}</div>
  <h1>${esc(g.h1)}</h1>
  <p class="lead">${esc(g.desc)}</p>

  ${corpo}

  <a class="cta" href="/#produtos">${esc(g.cta)} →</a>

  <div class="faq-wrap">
    <h2>Perguntas frequentes</h2>
    ${faqHtml}
  </div>

  <p style="margin-top:28px">Ficou com dúvida? Fale com a gente no <a href="${WHATS}">WhatsApp (11) 98885-6367</a> e peça seu orçamento.</p>

  <div class="outros">
    <h2>Outros guias de embalagem</h2>
    <ul>${outros}</ul>
  </div>
</div>
<footer class="footer-mini">© 2026 TopFood Embalagens Ltda — CNPJ 67.038.607/0001-31 — São Bernardo do Campo, SP</footer></body></html>`;
}

// ── Página índice /guias ────────────────────────────────────
function renderIndice() {
  const cards = Object.keys(GUIAS).map(s => {
    const g = GUIAS[s];
    return '<a href="/guia/' + s + '" style="display:block;background:#fff;border:1px solid var(--border);border-radius:12px;padding:22px;margin-bottom:14px;text-decoration:none">'
      + '<strong style="color:var(--red);font-size:1.05rem;display:block;margin-bottom:6px">' + esc(g.h1) + '</strong>'
      + '<span style="color:#374151;font-size:.92rem">' + esc(g.desc) + '</span></a>';
  }).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Guias de Embalagem para Delivery e Fast Food | TopFood</title>
<meta name="description" content="Guias práticos para escolher a embalagem certa para pastel, hambúrguer, churros e batata frita no delivery. Dicas, materiais e atacado a partir de 50 unidades."/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${SITE}/guias"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@700;800&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--red:#CC0000;--border:#E5E7EB}
body{font-family:Inter,sans-serif;background:#f9fafb;color:#111}
a{color:var(--red);text-decoration:none}
.topbar{background:#111;padding:8px 5%;font-size:.76rem;color:#9CA3AF;display:flex;justify-content:space-between}
.header{background:#fff;padding:14px 5%;display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--red)}
.logo-name{font-family:Poppins,sans-serif;font-weight:800;font-size:1.1rem;color:var(--red)}
.container{max-width:860px;margin:0 auto;padding:48px 5% 60px}
h1{font-family:Poppins,sans-serif;font-size:1.8rem;font-weight:800;margin-bottom:10px}
.footer-mini{background:#111;color:#6B7280;text-align:center;padding:24px;font-size:.78rem;margin-top:40px}
</style></head><body>
<div class="topbar"><span>🚚 Frete para todo Brasil &nbsp;|&nbsp; 📦 Pacotes a partir de 50 un</span><a href="${WHATS}">📱 (11) 98885-6367</a></div>
<header class="header"><a href="/" class="logo-wrap"><span class="logo-name">TopFood <span style="color:#111;font-weight:400;font-size:.85rem">Embalagens</span></span></a><a href="/" style="margin-left:auto;font-size:.85rem;color:var(--red);font-weight:600">← Voltar à loja</a></header>
<div class="container">
  <div style="font-size:.82rem;color:#6B7280;margin-bottom:20px"><a href="/" style="font-weight:600">Início</a> › Guias</div>
  <h1>Guias de embalagem para o seu delivery</h1>
  <p style="color:#374151;margin-bottom:26px;font-size:.98rem">Dicas práticas para escolher a embalagem certa de cada produto — e entregar com a mesma qualidade do balcão.</p>
  ${cards}
</div>
<footer class="footer-mini">© 2026 TopFood Embalagens Ltda — CNPJ 67.038.607/0001-31 — São Bernardo do Campo, SP</footer></body></html>`;
}

// ── Rotas ───────────────────────────────────────────────────
function registerGuiaRoutes(app) {
  app.get('/guias', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8').send(renderIndice());
  });
  app.get('/guia/:slug', (req, res, next) => {
    const html = renderGuia(req.params.slug);
    if (!html) return next(); // slug desconhecido → 404 padrão
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  });
  console.log('[Guias] Conteúdo SEO registrado: /guias + /guia/:slug (' + Object.keys(GUIAS).length + ' guias)');
}

module.exports = { registerGuiaRoutes, guiaSlugs: () => Object.keys(GUIAS) };
