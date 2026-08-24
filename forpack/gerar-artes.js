#!/usr/bin/env node
/* ============================================================
   Forpack — gerador das artes da marca (logo, banners, OG)
   ------------------------------------------------------------
   Gera os SVGs (fonte, editáveis) e rasteriza em .webp/.jpg com
   o sharp — as mesmas dependências que o site já usa.

   Rodar:  node forpack/gerar-artes.js
   Saída:  forpack/site/images/marca/    (logo, og)
           forpack/site/images/banners/  (banners do slider)

   Sem fotos das embalagens reais ainda: as artes são
   tipográficas + ilustração vetorial (chapa metalizada), o que
   fica coerente no ar até chegarem as fotos de estúdio.
   ============================================================ */
const fs   = require('fs');
const path = require('path');

const OUT_MARCA   = path.join(__dirname, 'site', 'images', 'marca');
const OUT_BANNERS = path.join(__dirname, 'site', 'images', 'banners');
const OUT_PRODUTOS = path.join(__dirname, 'site', 'images', 'produtos');
[OUT_MARCA, OUT_BANNERS, OUT_PRODUTOS].forEach(d => fs.mkdirSync(d, { recursive: true }));

const FONT = "Liberation Sans, Helvetica, Arial, sans-serif";

// Reflexo de papel-alumínio: a mesma rampa do forpack-theme.css
const foil = (id, angle = 115) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"
      gradientTransform="rotate(${angle - 90} .5 .5)">
    <stop offset="0%"   stop-color="#EDF2F7"/>
    <stop offset="22%"  stop-color="#C3CEDA"/>
    <stop offset="40%"  stop-color="#FBFDFE"/>
    <stop offset="58%"  stop-color="#B4C1CE"/>
    <stop offset="78%"  stop-color="#E4EBF2"/>
    <stop offset="100%" stop-color="#C9D4DE"/>
  </linearGradient>`;

// Escovado: fios diagonais finíssimos por cima de tudo
const escovado = (id) => `
  <pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"
      patternTransform="rotate(115)">
    <rect width="6" height="6" fill="none"/>
    <rect width="1" height="6" fill="#FFFFFF" opacity=".55"/>
    <rect x="3" width="1" height="6" fill="#8FA0B0" opacity=".16"/>
  </pattern>`;

// ── LOGO ────────────────────────────────────────────────────
// Marca: chapa hexagonal metalizada + "FORPACK" + assinatura.
function logo({ dark = false } = {}) {
  const tinta   = dark ? '#FFFFFF' : '#1B222B';
  const tinta2  = dark ? '#AEBECB' : '#4A5A6B';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300" width="900" height="300" role="img" aria-label="Forpack Embalagens">
  <defs>
    ${foil('lfoil')}
    ${escovado('lbrush')}
    <linearGradient id="lacc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12A0BC"/><stop offset="100%" stop-color="#095F70"/>
    </linearGradient>
  </defs>
  <!-- chapa hexagonal -->
  <g transform="translate(40 62)">
    <path d="M88 0 L172 48 L172 144 L88 192 L4 144 L4 48 Z" fill="url(#lfoil)"/>
    <path d="M88 0 L172 48 L172 144 L88 192 L4 144 L4 48 Z" fill="url(#lbrush)" opacity=".5"/>
    <path d="M88 0 L172 48 L172 144 L88 192 L4 144 L4 48 Z" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".85"/>
    <!-- caixa aberta, interior metalizado -->
    <path d="M44 84 L88 62 L132 84 L88 106 Z" fill="#FFFFFF" opacity=".9"/>
    <path d="M44 84 L88 106 L88 152 L44 130 Z" fill="${dark ? '#2E3945' : '#1B222B'}" opacity=".82"/>
    <path d="M132 84 L88 106 L88 152 L132 130 Z" fill="${dark ? '#4A5A6B' : '#4A5A6B'}" opacity=".7"/>
    <path d="M44 84 L88 62 L132 84 L88 106 Z" fill="none" stroke="#0C7C92" stroke-width="2.5" opacity=".55"/>
  </g>
  <!-- wordmark -->
  <text x="248" y="150" font-family="${FONT}" font-size="104" font-weight="bold"
        letter-spacing="2" fill="${tinta}">FORPACK</text>
  <rect x="250" y="172" width="612" height="3" fill="url(#lfoil)"/>
  <text x="250" y="212" font-family="${FONT}" font-size="30" font-weight="bold"
        letter-spacing="9.5" fill="${tinta2}">EMBALAGENS METALIZADAS</text>
</svg>`;
}

// ── ILUSTRAÇÃO: caixa aberta mostrando o interior metalizado ─
function caixa(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <!-- sombra de contato -->
    <ellipse cx="240" cy="452" rx="230" ry="30" fill="#1B222B" opacity=".13"/>
    <!-- tampa erguida -->
    <g transform="rotate(-13 240 150)">
      <path d="M60 150 L240 62 L420 150 L240 238 Z" fill="url(#bfoil)"/>
      <path d="M60 150 L240 62 L420 150 L240 238 Z" fill="url(#bbrush)" opacity=".55"/>
      <path d="M60 150 L240 62 L420 150 L240 238 Z" fill="none" stroke="#FFFFFF" stroke-width="3"/>
    </g>
    <!-- interior metalizado -->
    <path d="M64 262 L240 176 L416 262 L240 348 Z" fill="url(#bfoil)"/>
    <path d="M64 262 L240 176 L416 262 L240 348 Z" fill="url(#bbrush)" opacity=".7"/>
    <!-- corpo -->
    <path d="M64 262 L240 348 L240 452 L64 366 Z" fill="#232D39"/>
    <path d="M416 262 L240 348 L240 452 L416 366 Z" fill="#3B4856"/>
    <path d="M64 262 L240 348 L240 452 L64 366 Z" fill="none" stroke="#0C7C92" stroke-width="2" opacity=".45"/>
    <!-- brilho na aresta -->
    <path d="M240 176 L416 262" stroke="#FFFFFF" stroke-width="3" opacity=".8"/>
  </g>`;
}


// ── ILUSTRAÇÃO: cone/scoop (batata de balcão) ───────────────
function cone(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="240" cy="452" rx="180" ry="26" fill="#1B222B" opacity=".13"/>
    <path d="M120 120 L360 120 L300 430 L180 430 Z" fill="#232D39"/>
    <path d="M240 120 L360 120 L300 430 L240 430 Z" fill="#3B4856"/>
    <path d="M112 96 L368 96 L360 156 L120 156 Z" fill="url(#bfoil)"/>
    <path d="M112 96 L368 96 L360 156 L120 156 Z" fill="url(#bbrush)" opacity=".6"/>
    <path d="M112 96 L368 96 L360 156 L120 156 Z" fill="none" stroke="#FFFFFF" stroke-width="3"/>
    <path d="M150 150 L330 150 L318 210 L162 210 Z" fill="url(#bfoil)" opacity=".85"/>
  </g>`;
}

// ── ILUSTRAÇÃO: tubo (churros / hot dog) ────────────────────
function tubo(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="240" cy="452" rx="200" ry="26" fill="#1B222B" opacity=".13"/>
    <rect x="96" y="150" width="288" height="286" rx="14" fill="#232D39"/>
    <rect x="240" y="150" width="144" height="286" rx="14" fill="#3B4856"/>
    <path d="M96 164 L240 96 L384 164 L240 232 Z" fill="url(#bfoil)"/>
    <path d="M96 164 L240 96 L384 164 L240 232 Z" fill="url(#bbrush)" opacity=".6"/>
    <path d="M96 164 L240 96 L384 164 L240 232 Z" fill="none" stroke="#FFFFFF" stroke-width="3"/>
    <rect x="130" y="268" width="220" height="6" rx="3" fill="url(#bfoil)" opacity=".8"/>
    <rect x="130" y="300" width="150" height="6" rx="3" fill="url(#bfoil)" opacity=".5"/>
  </g>`;
}

// ── FOTO PROVISÓRIA DE PRODUTO (1000x1000) ──────────────────
// Ilustração vetorial no padrão da marca — deixa o site no ar
// com aparência coerente até chegarem as fotos de estúdio.
const FORMAS = { caixa, cone, tubo };
function produto({ titulo, forma = 'caixa' }) {
  const desenho = (FORMAS[forma] || caixa)(180, 110, 1.35);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="${titulo}">
  <defs>
    ${foil('bfoil')}
    ${escovado('bbrush')}
    <linearGradient id="pbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#E9EFF4"/>
    </linearGradient>
  </defs>
  <rect width="1000" height="1000" fill="url(#pbg)"/>
  <g transform="rotate(-18 500 500)"><rect x="180" y="-200" width="180" height="1400" fill="#FFFFFF" opacity=".55"/></g>
  ${desenho}
  <rect x="80" y="828" width="132" height="5" rx="3" fill="url(#bfoil)"/>
  <text x="80" y="898" font-family="${FONT}" font-size="46" font-weight="bold" fill="#1B222B">${titulo}</text>
  <text x="80" y="946" font-family="${FONT}" font-size="27" font-weight="bold" letter-spacing="5" fill="#0C7C92">INTERIOR METALIZADO</text>
</svg>`;
}

const PRODUTOS_ARTE = [
  { arq: 'pastel-metalizada',        titulo: 'Pastel',             forma: 'caixa' },
  { arq: 'churros-metalizada',       titulo: 'Churros',            forma: 'tubo'  },
  { arq: 'hamburguer-metalizada',    titulo: 'Hambúrguer',         forma: 'caixa' },
  { arq: 'batata-200g-metalizada',   titulo: 'Batata frita 200 g', forma: 'caixa' },
  { arq: 'batata-balcao-metalizada', titulo: 'Batata de balcão',   forma: 'cone'  },
  { arq: 'espetinho-metalizada',     titulo: 'Espetinho',          forma: 'caixa' },
  { arq: 'hotdog-metalizada',        titulo: 'Hot dog',            forma: 'tubo'  },
  { arq: 'porcoes-metalizada',       titulo: 'Porções',            forma: 'caixa' },
];


// ── ARTE "PERSONALIZE COM A SUA MARCA" (fundo transparente) ─
function personalizadas() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800" role="img" aria-label="Embalagens metalizadas personalizadas com a sua marca">
  <defs>
    ${foil('bfoil')}
    ${escovado('bbrush')}
  </defs>
  <g transform="translate(-40 250) scale(.62)">${caixa(0, 0, 1)}</g>
  <g transform="translate(560 300) scale(.58)">${tubo(0, 0, 1)}</g>
  <g transform="translate(300 120) scale(.86)">${caixa(0, 0, 1)}
    <g transform="translate(150 250)">
      <rect rx="10" width="196" height="56" fill="url(#bfoil)" stroke="#FFFFFF" stroke-width="2"/>
      <text x="30" y="38" font-family="${FONT}" font-size="27" font-weight="bold" letter-spacing="2.4" fill="#1B222B">SUA MARCA</text>
    </g>
  </g>
</svg>`;
}

// ── BANNER DO SLIDER ────────────────────────────────────────
function banner({ eyebrow, titulo1, titulo2, sub }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1000" width="1920" height="1000" role="img" aria-label="${titulo1} ${titulo2}">
  <defs>
    ${foil('bfoil')}
    ${escovado('bbrush')}
    <linearGradient id="bbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#FFFFFF"/>
      <stop offset="55%"  stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#DFE7EE"/>
    </linearGradient>
    <linearGradient id="bsweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="50%"  stop-color="#FFFFFF" stop-opacity=".85"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bacc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12A0BC"/><stop offset="100%" stop-color="#095F70"/>
    </linearGradient>
  </defs>

  <rect width="1920" height="1000" fill="url(#bbg)"/>
  <!-- varredura de luz diagonal (o "reflexo" do metal) -->
  <g transform="rotate(-18 960 500)">
    <rect x="380" y="-260" width="330" height="1520" fill="url(#bsweep)" opacity=".9"/>
    <rect x="900" y="-260" width="140" height="1520" fill="url(#bsweep)" opacity=".55"/>
  </g>
  <!-- fio metálico no rodapé -->
  <rect y="982" width="1920" height="18" fill="url(#bfoil)"/>

  <!-- coluna de texto -->
  <g transform="translate(150 288)">
    <rect x="0" y="-58" rx="26" width="${20 + eyebrow.length * 15.2}" height="52" fill="url(#bfoil)" stroke="#FFFFFF" stroke-width="2"/>
    <text x="26" y="-22" font-family="${FONT}" font-size="24" font-weight="bold"
          letter-spacing="3.2" fill="#1B222B">${eyebrow}</text>

    <text x="0" y="96"  font-family="${FONT}" font-size="104" font-weight="bold" letter-spacing="-1" fill="#1B222B">${titulo1}</text>
    <text x="0" y="212" font-family="${FONT}" font-size="104" font-weight="bold" letter-spacing="-1" fill="#0C7C92">${titulo2}</text>

    <rect x="0" y="252" width="132" height="6" rx="3" fill="url(#bfoil)"/>
    <text x="0" y="330" font-family="${FONT}" font-size="34" fill="#4A5A6B">${sub}</text>

    <g transform="translate(0 386)">
      <rect rx="12" width="330" height="76" fill="url(#bacc)"/>
      <text x="46" y="50" font-family="${FONT}" font-size="30" font-weight="bold" fill="#FFFFFF">Ver modelos  &#8594;</text>
    </g>
  </g>

  ${caixa(1140, 230, 1.12)}
</svg>`;
}

const BANNERS = [
  { arq: 'banner-pastel', eyebrow: 'INTERIOR 100% METALIZADO',
    titulo1: 'Embalagem metalizada', titulo2: 'para pastel',
    sub: 'Segura o calor, não encharca e chega apresentável.' },
  { arq: 'banner-burguer', eyebrow: 'LINHA HAMBURGUERIA',
    titulo1: 'Caixa metalizada', titulo2: 'para hambúrguer',
    sub: 'Pão firme, queijo derretido — do balcão até a porta.' },
  { arq: 'banner-fritas', eyebrow: 'DELIVERY E BALCÃO',
    titulo1: 'Batata frita', titulo2: 'crocante na entrega',
    sub: 'Interior metalizado que mantém a temperatura.' },
  { arq: 'banner-churros', eyebrow: 'DOCES E CHURROS',
    titulo1: 'Embalagem metalizada', titulo2: 'para churros',
    sub: 'Barreira contra gordura e umidade, montagem por encaixe.' },
  { arq: 'banner-espetinho', eyebrow: 'ESPETINHO E PORÇÕES',
    titulo1: 'Caixa metalizada', titulo2: 'para espetinho',
    sub: 'Resistente ao calor, com fechamento reforçado.' },
];

// ── OG / compartilhamento ───────────────────────────────────
function og() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    ${foil('bfoil')}
    ${escovado('bbrush')}
    <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B222B"/><stop offset="100%" stop-color="#0E141A"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <rect y="612" width="1200" height="18" fill="url(#bfoil)"/>
  <text x="80" y="214" font-family="${FONT}" font-size="76" font-weight="bold" letter-spacing="1" fill="#FFFFFF">FORPACK</text>
  <rect x="82" y="240" width="360" height="4" fill="url(#bfoil)"/>
  <text x="82" y="292" font-family="${FONT}" font-size="27" font-weight="bold" letter-spacing="7" fill="#AEBECB">EMBALAGENS METALIZADAS</text>
  <text x="80" y="392" font-family="${FONT}" font-size="38" fill="#E7EDF3">Pastel · Hambúrguer · Batata · Churros · Espetinho</text>
  <text x="80" y="452" font-family="${FONT}" font-size="30" fill="#8FA3B4">Atacado a partir de 50 unidades — envio para todo o Brasil</text>
  ${caixa(760, 130, .74)}
</svg>`;
}

// ── Escreve SVG + rasteriza ─────────────────────────────────
let sharp = null;
try { sharp = require('sharp'); } catch (_) {
  console.warn('⚠ sharp não encontrado — só os SVGs serão gerados.');
}

async function grava(dir, nome, svg, raster) {
  const svgPath = path.join(dir, nome + '.svg');
  fs.writeFileSync(svgPath, svg);
  let extra = '';
  if (sharp && raster) {
    const buf = Buffer.from(svg);
    if (raster === 'webp') {
      await sharp(buf, { density: 144 }).webp({ quality: 88 }).toFile(path.join(dir, nome + '.webp'));
      extra = ' + .webp';
    } else if (raster === 'jpg') {
      await sharp(buf, { density: 144 }).jpeg({ quality: 90 }).toFile(path.join(dir, nome + '.jpg'));
      extra = ' + .jpg';
    }
  }
  console.log('  ✓ ' + path.relative(process.cwd(), svgPath) + extra);
}

(async () => {
  console.log('Gerando artes da Forpack…');
  await grava(OUT_MARCA, 'forpack-logo',        logo(),               'webp');
  await grava(OUT_MARCA, 'forpack-logo-branco', logo({ dark: true }), 'webp');
  await grava(OUT_MARCA, 'og-forpack',          og(),                 'jpg');
  await grava(OUT_MARCA, 'personalizadas',      personalizadas(),     'webp');
  for (const b of BANNERS) await grava(OUT_BANNERS, b.arq, banner(b), 'webp');
  for (const p of PRODUTOS_ARTE) await grava(OUT_PRODUTOS, p.arq, produto(p), 'webp');
  console.log('Pronto.');
})();
