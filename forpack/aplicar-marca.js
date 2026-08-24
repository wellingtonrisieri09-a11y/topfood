#!/usr/bin/env node
/* ============================================================
   Forpack — transforma o site clonado do TopFood na Forpack
   ------------------------------------------------------------
   Roda DENTRO de /var/www/forpack, depois que o clonar-forpack.sh
   já copiou o código e trocou os nomes. Cuida do que o sed do
   shell não dá conta: paleta, artes, textos de venda e pixels.

     node forpack/aplicar-marca.js          # aplica
     node forpack/aplicar-marca.js --dry    # só mostra o que faria

   É IDEMPOTENTE: rodar de novo não duplica nada. Toda regra que
   não encontrar o texto esperado é listada no fim — é assim que
   a gente descobre que uma melhoria do TopFood mudou o HTML e a
   marcação da Forpack precisa de ajuste.
   ============================================================ */
const fs   = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
try { require('dotenv').config({ path: path.join(RAIZ, '.env') }); } catch (_) { /* sem dotenv: usa só o ambiente */ }
const DRY  = process.argv.includes('--dry');

const WHATSAPP_HERDADO = '5511988856367';
const WHATSAPP  = process.env.FORPACK_WHATSAPP  || WHATSAPP_HERDADO;
const INSTAGRAM = process.env.FORPACK_INSTAGRAM || '';
const FACEBOOK  = process.env.FORPACK_FACEBOOK  || '';
const DOMINIO   = (process.env.BASE_URL || 'https://forpackembalagens.com.br').replace(/\/$/, '');

// Páginas da loja. O admin fica de fora de propósito: lá o vermelho
// é semântico (excluir/cancelar) e trocar a paleta atrapalharia.
const PAGINAS_LOJA = [
  'index.html', 'product.html', 'sobre.html', 'contato.html', 'faq.html',
  'entrega.html', 'devolucao.html', 'privacidade.html', 'termos.html',
  'success.html', 'failure.html', 'pending.html',
];
const ARQUIVOS_PALETA = [...PAGINAS_LOJA, 'app.js', 'modules/seo.js'];

// ── Paleta: vermelho TopFood → grafite + aço polido Forpack ──
// Chaves em minúsculo; a troca é case-insensitive, porque o CSS do
// TopFood mistura #FECACA e #fecaca para a mesma cor.
const PALETA = {
  '#cc0000': '#0C7C92',   // vermelho da marca  → aço polido
  '#a80000': '#095F70',
  '#b80000': '#095F70',
  '#ff2222': '#12A0BC',
  '#dc2626': '#0C7C92',
  '#b91c1c': '#095F70',
  '#ef4444': '#12A0BC',
  '#f87171': '#8FA3B4',
  '#fca5a5': '#A8D8E2',
  '#fecaca': '#CDE9EF',
  '#fee2e2': '#E6F4F8',
  '#1c0000': '#232D39',   // fundo vinho da vitrine de categorias
  '#f97316': '#C6A15B',   // laranja de apoio   → champagne
  '#fff7ed': '#FBF7EE',
  '#92400e': '#7A6224',
  '#fcd34d': '#C6A15B',
  '#111111': '#1B222B',   // preto absoluto     → grafite
  '#1c1c1c': '#232C36',
  '#000000': '#1B222B',
  '#e63012': '#0C7C92',   // faixa da newsletter
  '#fff6e5': '#F2F6F9',   // pílulas do bloco de SEO → prata
  '#ffd699': '#C8D2DC',
  '#fef2f2': '#EFF7F9',   // fundos rosados de "selecionado"/alerta
  '#fff5f5': '#F1F8FA',
};
// hex de 3 dígitos. O \b impede que #111 case com o começo de #111111.
const PALETA_CURTA = { '#000': '#1B222B', '#111': '#1B222B', '#fee': '#EFF7F9' };
const RE_HEX3 = /#[0-9a-fA-F]{3}\b/g;
// rgba() não entra no regex de hex — vai à parte. A troca é pelo PREFIXO
// (só o RGB, sem o alfa), senão escapa cada variação de transparência:
// o CSS do TopFood usa rgba(204,0,0,...) com .6, .18, .5, .15…
const PALETA_RGBA = [
  ['rgba(204,0,0,',     'rgba(12,124,146,'],   // vermelho da marca
  ['rgba(204, 0, 0,',   'rgba(12, 124, 146,'],
  ['rgba(220,38,38,',   'rgba(12,124,146,'],
  ['rgba(185,28,28,',   'rgba(9,95,112,'],
  ['rgba(248,113,113,', 'rgba(200,210,220,'],
  ['rgba(249,115,22,',  'rgba(198,161,91,'],   // laranja → champagne
];
const RE_HEX = /#[0-9a-fA-F]{6}\b/g;

// ── Motor de substituição com relatório ─────────────────────
const relatorio = [];
function editar(arquivo, regras) {
  const p = path.join(RAIZ, arquivo);
  if (!fs.existsSync(p)) { relatorio.push(['—', arquivo, 'arquivo não existe']); return; }
  let txt = fs.readFileSync(p, 'utf8');
  const original = txt;

  for (const [nome, de, para] of regras) {
    const antes = txt;
    txt = typeof de === 'string' ? txt.split(de).join(para) : txt.replace(de, para);
    if (txt === antes) {
      // já aplicado antes? então não é problema — só não repetiu.
      // Confere o texto de substituição INTEIRO: conferir só o começo deixa
      // um <div style=...> genérico "provar" uma troca que nunca aconteceu.
      const jaFeito = typeof para === 'string' && para.length > 20 && txt.includes(para);
      relatorio.push([jaFeito ? '=' : '!', arquivo, nome]);
    } else {
      relatorio.push(['✓', arquivo, nome]);
    }
  }

  if (txt !== original && !DRY) fs.writeFileSync(p, txt);
}

// ════════════════════════════════════════════════════════════
// 1. PALETA — em todos os arquivos da loja
// ════════════════════════════════════════════════════════════
for (const arq of ARQUIVOS_PALETA) {
  const p = path.join(RAIZ, arq);
  if (!fs.existsSync(p)) continue;
  let txt = fs.readFileSync(p, 'utf8');
  let n = 0;
  txt = txt.replace(RE_HEX, (hex) => {
    const novo = PALETA[hex.toLowerCase()];
    if (!novo) return hex;
    n++;
    return novo;
  });
  txt = txt.replace(RE_HEX3, (hex) => {
    const novo = PALETA_CURTA[hex.toLowerCase()];
    if (!novo) return hex;
    n++;
    return novo;
  });
  for (const [de, para] of PALETA_RGBA) {
    const partes = txt.split(de);
    if (partes.length > 1) { n += partes.length - 1; txt = partes.join(para); }
  }
  if (n && !DRY) fs.writeFileSync(p, txt);
  if (n) relatorio.push(['✓', arq, `paleta metalizada (${n} cores trocadas)`]);
}

// ════════════════════════════════════════════════════════════
// 2. TEMA — <link> do forpack-theme.css em toda página da loja
// ════════════════════════════════════════════════════════════
const LINK_TEMA = '  <link rel="stylesheet" href="/forpack-theme.css?v=1">\n</head>';
for (const arq of PAGINAS_LOJA) {
  const p = path.join(RAIZ, arq);
  if (!fs.existsSync(p)) continue;
  let txt = fs.readFileSync(p, 'utf8');
  if (txt.includes('forpack-theme.css')) { relatorio.push(['=', arq, 'tema metalizado']); continue; }
  if (!txt.includes('</head>'))          { relatorio.push(['!', arq, 'tema metalizado (sem </head>)']); continue; }
  txt = txt.replace('</head>', LINK_TEMA);
  if (!DRY) fs.writeFileSync(p, txt);
  relatorio.push(['✓', arq, 'tema metalizado']);
}

// ════════════════════════════════════════════════════════════
// 3. PIXELS — o Forpack NÃO pode medir na conta do TopFood
// ════════════════════════════════════════════════════════════
// Deixar o GTM/GA4/Meta/TikTok do TopFood no ar aqui suja os dados
// e o público dos anúncios dos dois sites. Saem daqui; o Forpack
// coloca os IDs próprios no /admin.html (Configurações → Tracking),
// que o tracking.js lê do banco.
const BLOCOS_PIXEL = [
  ['Google Tag Manager',   /<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/g],
  ['GTM (noscript)',       /<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/g],
  ['Meta Pixel',           /<!-- Meta Pixel -->[\s\S]*?<!-- \/Meta Pixel -->/g],
  ['TikTok Pixel',         /<!-- TikTok Pixel -->[\s\S]*?<!-- \/TikTok Pixel -->/g],
  ['GA4 + Google Ads',     /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[^"]*"><\/script><script>window\.dataLayer[\s\S]*?<\/script>/g],
  ['verificação Meta',     /<meta name="facebook-domain-verification"[^>]*>\s*/g],
  ['GTM solto (product)',  /<!-- Google Tag Manager -->[\s\S]*?<\/script>\s*<!-- End Google Tag Manager -->/g],
];
const AVISO_PIXEL = '<!-- Pixels: configure os IDs próprios da Forpack em /admin.html → Configurações (o tracking.js os injeta a partir do banco). -->';

for (const arq of ['index.html', 'product.html']) {
  const p = path.join(RAIZ, arq);
  if (!fs.existsSync(p)) continue;
  let txt = fs.readFileSync(p, 'utf8');
  let removidos = [];
  for (const [nome, re] of BLOCOS_PIXEL) {
    if (re.test(txt)) { txt = txt.replace(re, ''); removidos.push(nome); }
  }
  // sobras avulsas (o product.html tem os blocos grudados numa linha só)
  const sobras = [
    /<script>\s*!function\s*\(f,b,e,v,n,t,s\)[\s\S]*?fbq\('track', 'PageView'\);\s*<\/script>/g,
    /<noscript><img height="1" width="1" style="display:none"\s*src="https:\/\/www\.facebook\.com\/tr[^>]*\/?>\s*<\/noscript>/g,
    /<script>\s*!function \(w, d, t\)\s*\{[\s\S]*?ttq\.page\(\);[\s\S]*?\}\(window, document, 'ttq'\);\s*<\/script>/g,
    /<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-[^"]*"[\s\S]*?<\/noscript>/g,
    /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[^"]*"><\/script>/g,
  ];
  for (const re of sobras) if (re.test(txt)) { txt = txt.replace(re, ''); removidos.push('sobra'); }

  if (removidos.length) {
    if (!txt.includes('Pixels: configure os IDs')) txt = txt.replace('<head>', '<head>\n  ' + AVISO_PIXEL);
    if (!DRY) fs.writeFileSync(p, txt);
    relatorio.push(['✓', arq, `pixels do TopFood removidos (${[...new Set(removidos)].join(', ')})`]);
  } else {
    relatorio.push(['=', arq, 'pixels do TopFood']);
  }
}

// ════════════════════════════════════════════════════════════
// 4. SEO + TEXTOS DE VENDA — index.html
// ════════════════════════════════════════════════════════════
const TITULO = 'Embalagem Metalizada para Delivery | Pastel, Hambúrguer, Batata e Churros — Forpack';
const DESC   = 'Embalagens metalizadas para delivery e fast food: pastel, hambúrguer, batata frita, churros, espetinho e hot dog. Interior metalizado que segura o calor e não encharca. Atacado a partir de 50 unidades, para todo o Brasil.';
const KEYS   = 'embalagem metalizada, embalagens metalizadas, embalagem metalizada para pastel, caixa metalizada hamburguer, embalagem metalizada batata frita, embalagem metalizada churros, caixa metalizada espetinho, embalagem delivery metalizada, embalagem térmica delivery, embalagem antigordura, embalagem atacado';

editar('index.html', [
  ['título', /<title>[\s\S]*?<\/title>/, `<title>${TITULO}</title>`],
  ['meta description', /<meta name="description" content="[^"]*">/, `<meta name="description" content="${DESC}">`],
  ['meta keywords',    /<meta name="keywords" content="[^"]*">/,    `<meta name="keywords" content="${KEYS}">`],
  ['og:title',       /<meta property="og:title" content="[^"]*">/,       `<meta property="og:title" content="Forpack Embalagens — Embalagens Metalizadas para Delivery">`],
  ['og:description', /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="Interior 100% metalizado: segura o calor, não encharca e chega apresentável. Pastel, hambúrguer, batata, churros e espetinho.">`],
  ['og:image',       /<meta property="og:image" content="[^"]*">/,       `<meta property="og:image" content="${DOMINIO}/images/marca/og-forpack.jpg">`],
  ['twitter:title',       /<meta name="twitter:title" content="[^"]*">/,       `<meta name="twitter:title" content="Forpack Embalagens — Embalagens Metalizadas para Delivery">`],
  ['twitter:description', /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="Embalagens metalizadas para pastel, hambúrguer, batata frita, churros e espetinho. Atacado a partir de 50 unidades.">`],
  ['twitter:image',       /<meta name="twitter:image" content="[^"]*">/,       `<meta name="twitter:image" content="${DOMINIO}/images/marca/og-forpack.jpg">`],

  ['H1', /<h1 class="sr-only">[\s\S]*?<\/h1>/,
    '<h1 class="sr-only">Embalagens Metalizadas para Delivery e Fast Food — Pastel, Hambúrguer, Batata Frita, Churros e Espetinho | Forpack Embalagens</h1>'],

  ['logo', /<img class="logo-img" src="[^"]*" alt="[^"]*"([^>]*)>/,
    '<img class="logo-img" src="/images/marca/forpack-logo.webp" alt="Forpack Embalagens — embalagens metalizadas" width="900" height="300" onerror="this.style.display=\'none\'" />'],

  ['busca (placeholder)', /placeholder="Busque por tipo de embalagem[^"]*"/,
    'placeholder="Busque por tipo de embalagem metalizada (pastel, hambúrguer, batata...)"'],

  ['faixa de aviso', /<span id="announcement-text">[\s\S]*?<\/span>/,
    '<span id="announcement-text">Interior 100% metalizado — 5% OFF no PIX com o código <strong>PIX5</strong></span>'],
]);

// ── Slider: banners metalizados (5 modelos) ─────────────────
const SLIDES = [
  ['pastel',    'banner-pastel',    'Embalagem metalizada para pastel'],
  ['hamburger', 'banner-burguer',   'Caixa metalizada para hambúrguer'],
  ['batata',    'banner-fritas',    'Embalagem metalizada para batata frita'],
  ['churros',   'banner-churros',   'Embalagem metalizada para churros'],
  ['espetinho', 'banner-espetinho', 'Caixa metalizada para espetinho'],
];
const SLIDES_HTML = SLIDES.map(([cat, arq, alt]) => `
    <div class="slide slide-imgbnr" onclick="filterCategory('${cat}')" role="link" aria-label="${alt}">
      <img class="imgbnr" src="images/banners/${arq}.webp?v=1" alt="${alt} — Forpack Embalagens" width="1920" height="1000"${arq === 'banner-pastel' ? ' fetchpriority="high"' : ''}>
    </div>`).join('\n');
const DOTS_HTML = SLIDES.map((_, i) =>
  `    <button class="slider-dot${i === 0 ? ' active' : ''}" onclick="slideTo(${i})" aria-label="Slide ${i + 1}"></button>`
).join('\n');

editar('index.html', [
  ['banners do slider', /<div class="slider-track" id="sliderTrack">[\s\S]*?<\/div><!-- \/slider-track -->/,
    `<div class="slider-track" id="sliderTrack">\n${SLIDES_HTML}\n\n  </div><!-- /slider-track -->`],
  ['pontos do slider', /<div class="slider-dots" id="sliderDots">[\s\S]*?<\/div>/,
    `<div class="slider-dots" id="sliderDots">\n${DOTS_HTML}\n  </div>`],
]);

// ── Faixa de vantagens: o diferencial é o metalizado ────────
editar('index.html', [
  ['faixa de vantagens', /<div style="font-size:26px;line-height:1;">📦<\/div>\s*<div><div style="font-size:13px;font-weight:700;color:#(?:111|1B222B);">Entrega Rápida<\/div><div style="font-size:11px;color:#6b7280;">Para todo o Brasil<\/div><\/div>/,
    '<div style="font-size:26px;line-height:1;">✨</div>\n      <div><div style="font-size:13px;font-weight:700;color:#1B222B;">Interior Metalizado</div><div style="font-size:11px;color:#6b7280;">Segura o calor de verdade</div></div>'],
]);

// ── FAQ: as dúvidas de quem compra metalizada ───────────────
const FAQ = [
  ['Por que a embalagem metalizada é melhor para delivery?',
   'O interior metalizado reflete o calor de volta para o alimento em vez de absorvê-lo, então a comida chega quente sem gerar aquele vapor que murcha a massa e amolece o pão. A mesma camada funciona como barreira contra gordura e umidade: a embalagem não encharca, não mancha por fora e chega apresentável na mão do cliente.'],
  ['Qual é o pedido mínimo?',
   'O pedido mínimo é de 50 unidades por pacote. Quanto maior o volume, menor o preço por unidade — veja as opções de 100 e 250 unidades no card de cada produto.'],
  ['O material pode encostar no alimento?',
   'Sim. A linha é produzida em cartão de alta gramatura com laminação metalizada própria para contato com alimento, atóxica e resistente ao calor da fritura.'],
  ['Vocês entregam para todo o Brasil?',
   'Sim, enviamos para todos os estados com rastreamento incluso. O prazo varia conforme o CEP — use o calculador de frete aqui na página para simular antes de fechar o pedido.'],
  ['Dá para personalizar com a minha marca?',
   'Dá. Para volumes maiores fazemos a impressão personalizada com o seu logo e as suas cores sobre a mesma estrutura metalizada. Chame no WhatsApp que a gente monta o orçamento.'],
];
const FAQ_HTML = FAQ.map(([q, a]) =>
`    <details style="background:#fff; border-radius:8px; padding:16px 20px; margin-bottom:12px; cursor:pointer;">
      <summary style="font-weight:600; font-size:1rem;">${q}</summary>
      <p style="margin-top:10px; color:#555;">${a}</p>
    </details>`).join('\n');

editar('index.html', [
  // o [ \t]* inicial é essencial: sem ele a regex não come o recuo e cada
  // execução empurra o bloco 4 espaços para a direita
  ['perguntas frequentes', /[ \t]*<details style="background:#fff; border-radius:8px; padding:16px 20px; margin-bottom:12px; cursor:pointer;">[\s\S]*<\/details>\s*<\/div>\s*<\/section>\s*<!-- BANNER PERSONALIZADAS -->/,
   `${FAQ_HTML}\n  </div>\n</section>\n\n<!-- BANNER PERSONALIZADAS -->`],

  ['banner personalizadas (arte)', /<img src="\/images\/mockup-personalizado\.webp" alt="[^"]*"/,
   '<img src="/images/marca/personalizadas.webp" alt="Embalagens metalizadas personalizadas com a sua marca — Forpack"'],
  ['banner personalizadas (texto)', /Embalagens exclusivas com logotipo do seu negocio\. Orcamento sem compromisso\./,
   'A mesma estrutura metalizada, impressa com o seu logo e as suas cores. Orçamento sem compromisso.'],

  // rodapé: o quadradinho 56x56 com a foto do logo do TopFood dá lugar
  // à versão branca da marca, que já traz o nome e a assinatura
  ['logo do rodapé', /<div class="footer-logo">[\s\S]*?<\/div>\s*<div class="footer-logo-name">[^<]*<\/div>\s*<div class="footer-logo-sub">[^<]*<\/div>/,
   '<div class="footer-logo">\n            <img src="/images/marca/forpack-logo-branco.webp" alt="Forpack Embalagens — embalagens metalizadas" onerror="this.style.display=\'none\'" />\n          </div>'],
  ['texto do rodapé',
   'Embalagens que valorizam seu alimento. Design exclusivo para restaurantes, lanchonetes e delivery em todo o Brasil.',
   'Embalagens metalizadas para food service: seguram o calor, não encharcam e chegam apresentáveis. Atacado para todo o Brasil.'],

  ['banner de saída (arte)', /<img src="\/images\/01 - Pastel\.webp" alt="[^"]*"/,
   '<img src="/images/produtos/pastel-metalizada.webp" alt="Embalagem metalizada para pastel — Forpack"'],
  ['banner de saída (texto)', /Embalagens de qualidade para seu delivery\. Use o cupom abaixo e ganhe/,
   'Embalagem metalizada de verdade: segura o calor e não encharca. Use o cupom abaixo e ganhe'],
]);


// ════════════════════════════════════════════════════════════
// 4b. TEXTOS DO SEO SERVER-SIDE (modules/seo.js)
// ════════════════════════════════════════════════════════════
// É o bloco que o Google lê sem JS, no rodapé da home e das páginas
// de produto. No TopFood ele vende "papel triplex + chalk art"; aqui
// o argumento é o interior metalizado.
editar('modules/seo.js', [
  // ATENÇÃO À ORDEM: as frases longas vêm primeiro. Se a curta rodar antes,
  // ela corta o miolo da longa e sobra texto sem sentido
  // ("cartão ... com interior metalizado com impressão offset").
  ['SEO: acabamento (churros)',
   'o acabamento em papel triplex 250g com impressão offset dá um visual elegante e apetitoso para a sua marca',
   'o interior metalizado dá um acabamento premium e ainda segura a temperatura do doce'],
  ['SEO: material (genérico)',
   'em papel triplex 250g com impressão offset de alta qualidade',
   'em cartão de alta gramatura com laminação metalizada interna'],
  ['SEO: material (resposta)',
   'Papel triplex 250g com impressão offset de alta definição.',
   'Cartão de alta gramatura com laminação metalizada interna, própria para contato com alimento.'],
  // o </strong> no meio é do próprio seo.js — sem ele a frase não casa
  ['SEO: material + impressão',
   'papel triplex 250g e impressão offset</strong> de alta definição',
   'cartão de alta gramatura e laminação metalizada interna</strong>'],
  ['SEO: material (curto)',
   'papel triplex 250g',
   'cartão de alta gramatura com interior metalizado'],
  ['SEO: linha de impressão',
   '🖨️ Impressão: offset de alta definição',
   '✨ Interior: metalizado — barreira térmica e antigordura'],
  ['SEO: diferencial',
   'design chalk art exclusivo',
   'interior 100% metalizado'],
  ['SEO: título da home',
   '>Embalagens para fast food e delivery<',
   '>Embalagens metalizadas para fast food e delivery<'],
  ['SEO: parágrafo da home',
   'embalagens para fast food, delivery e food service',
   'embalagens metalizadas para fast food, delivery e food service'],
  ['SEO: pílula hambúrguer', 'Embalagem para Hambúrguer', 'Metalizada para Hambúrguer'],
  ['SEO: pílula pastel',     'Embalagem para Pastel',     'Metalizada para Pastel'],
  ['SEO: pílula churros',    'Embalagem para Churros',    'Metalizada para Churros'],
  ['SEO: pílula batata',     'Embalagem para Batata Frita', 'Metalizada para Batata Frita'],
]);

// ── Depoimentos: site novo não tem avaliação real ───────────
// Herdar "Mais de 500 restaurantes confiam" do TopFood seria propaganda
// enganosa. A seção sai do ar até existir avaliação de cliente Forpack —
// para reativar, basta apagar o style="display:none" abaixo.
{
  const p = path.join(RAIZ, 'index.html');
  let txt = fs.readFileSync(p, 'utf8');
  const alvo = '<section id="depoimentos" style="padding:60px 5%;background:#fff;">';
  const novo = '<!-- Depoimentos ocultos: só entram no ar com avaliações reais de clientes Forpack. Para reativar, remova o display:none. -->\n<section id="depoimentos" style="display:none;padding:60px 5%;background:#fff;">';
  if (txt.includes(alvo)) {
    txt = txt.replace(alvo, novo);
    if (!DRY) fs.writeFileSync(p, txt);
    relatorio.push(['✓', 'index.html', 'depoimentos do TopFood ocultados']);
  } else {
    relatorio.push([txt.includes('Depoimentos ocultos') ? '=' : '!', 'index.html', 'depoimentos ocultados']);
  }
}

// ── Logo das demais páginas + WhatsApp/redes ────────────────
for (const arq of PAGINAS_LOJA) {
  const p = path.join(RAIZ, arq);
  if (!fs.existsSync(p)) continue;
  let txt = fs.readFileSync(p, 'utf8');
  const antes = txt;

  // casa a tag inteira: o index escreve class antes de src, o product.html
  // escreve src antes de class — e o caminho tem de ser absoluto por causa
  // da rota /produto/:slug
  txt = txt.replace(/<img[^>]*class="logo-img"[^>]*>/g,
    tag => tag.replace(/src="[^"]*"/, 'src="/images/marca/forpack-logo.webp"'));
  // fallback textual do logo: o hambúrguer é do TopFood
  txt = txt.replace(/<span class="logo-fallback">🍔 /g, '<span class="logo-fallback">✨ ');
  if (WHATSAPP !== WHATSAPP_HERDADO) txt = txt.split(WHATSAPP_HERDADO).join(WHATSAPP);
  if (INSTAGRAM) {
    txt = txt.replace(/https:\/\/www\.instagram\.com\/(topfood|forpack)embalagens\/?/g, INSTAGRAM);
  }
  if (FACEBOOK) {
    txt = txt.replace(/https:\/\/www\.facebook\.com\/profile\.php\?id=\d+/g, FACEBOOK);
  }
  if (txt !== antes) {
    if (!DRY) fs.writeFileSync(p, txt);
    relatorio.push(['✓', arq, 'marca (logo/contatos)']);
  }
}

if (WHATSAPP === WHATSAPP_HERDADO) {
  relatorio.push(['·', '.env', 'FORPACK_WHATSAPP não definido — o site está usando o WhatsApp do TopFood']);
}
if (!INSTAGRAM) relatorio.push(['·', '.env', 'FORPACK_INSTAGRAM não definido — links sociais apontam para o perfil do TopFood']);

// ════════════════════════════════════════════════════════════
// Relatório
// ════════════════════════════════════════════════════════════
// ✓ aplicado · = já estava · ! regra não encontrou o texto · · aviso
console.log(DRY ? '\n[simulação — nada foi gravado]\n' : '');
for (const [s, arq, o] of relatorio) console.log(`   ${s} ${arq.padEnd(16)} ${o}`);

const faltando = relatorio.filter(r => r[0] === '!');
if (faltando.length) {
  console.log(`\n   ⚠ ${faltando.length} regra(s) não encontraram o texto esperado.`);
  console.log('     Se o HTML do TopFood mudou, ajuste forpack/aplicar-marca.js.');
}
console.log(`\n   ${relatorio.filter(r => r[0] === '✓').length} alterações aplicadas.`);
