#!/usr/bin/env node
/* ============================================================
   Forpack — carrega o catálogo metalizado no banco do clone
   ------------------------------------------------------------
   Roda DENTRO de /var/www/forpack (o db.js de lá aponta para
   data/forpack.db). Chamado pelo clonar-forpack.sh.

     node forpack/seed-forpack.js            # só na 1ª vez
     node forpack/seed-forpack.js --forcar   # regrava por cima

   Sem --forcar o script NÃO mexe num catálogo que já tenha
   produtos Forpack: os preços e as medidas que o Wellington
   corrigir no /admin.html sobrevivem a toda atualização.
   ============================================================ */
const fs   = require('fs');
const path = require('path');
const { readData, writeData, readSettings } = require('../db');

const FORCAR   = process.argv.includes('--forcar');
const CATALOGO = path.join(__dirname, 'produtos-forpack.json');

const novos = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
const idsForpack = new Set(novos.map(p => p.id));

// ── 1. Catálogo ─────────────────────────────────────────────
const atuais = readData('products.json') || [];
const jaTemForpack = atuais.some(p => idsForpack.has(p.id));

if (jaTemForpack && !FORCAR) {
  console.log(`   catálogo preservado (${atuais.length} produtos já cadastrados) — use --forcar para regravar`);
} else {
  writeData('products.json', novos);
  console.log(`   catálogo metalizado gravado: ${novos.length} produtos ` +
              `(${[...new Set(novos.map(p => p.category))].length} categorias)`);
  if (atuais.length) console.log(`   (${atuais.length} produtos herdados do TopFood foram substituídos)`);
  console.log('   ⚠ PREÇOS E MEDIDAS SÃO PROVISÓRIOS — confira em /admin.html antes de divulgar');
}

// ── 2. Identidade da loja ───────────────────────────────────
const s = readSettings() || {};
const jaConfigurado = s.store_name === 'Forpack Embalagens';

if (jaConfigurado && !FORCAR) {
  console.log('   configurações da loja preservadas');
} else {
  const cfg = {
    store_name: 'Forpack Embalagens',
    pix_name:   'Forpack',
  };
  // Dados próprios do Forpack, quando informados no .env
  if (process.env.FORPACK_WHATSAPP)  cfg.whatsapp    = process.env.FORPACK_WHATSAPP;
  if (process.env.FORPACK_EMAIL)     cfg.store_email = process.env.FORPACK_EMAIL;
  if (process.env.FORPACK_PIX_KEY)   cfg.pix_key     = process.env.FORPACK_PIX_KEY;

  writeData('settings.json', cfg);
  console.log('   loja configurada: Forpack Embalagens');
  ['FORPACK_WHATSAPP', 'FORPACK_EMAIL', 'FORPACK_PIX_KEY']
    .filter(k => !process.env[k])
    .forEach(k => console.log(`   ⚠ ${k} não definido no .env — o valor herdado do TopFood continua valendo`));
}

// ── 3. Pixels herdados do TopFood ───────────────────────────
// O banco veio copiado do TopFood e traz os IDs de GTM/GA4/Meta/Ads
// dele. Se ficarem aqui, o tracking.js injeta esses pixels no site da
// Forpack e as duas lojas passam a medir (e remarketing) na mesma
// conta. Limpa, a menos que o Forpack já tenha os IDs próprios.
const CHAVES_PIXEL = ['gtm_id', 'meta_pixel_id', 'google_analytics_id', 'google_ads_id', 'google_ads_label'];
const herdados = CHAVES_PIXEL.filter(k => s[k]);
if (herdados.length && !jaConfigurado) {
  const limpar = {};
  herdados.forEach(k => { limpar[k] = ''; });
  writeData('settings.json', limpar);
  console.log(`   pixels herdados do TopFood limpos: ${herdados.join(', ')}`);
  console.log('   → cadastre os IDs próprios da Forpack em /admin.html → Configurações');
} else if (!herdados.length) {
  console.log('   nenhum pixel herdado do TopFood no banco');
}
