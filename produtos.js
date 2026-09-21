#!/usr/bin/env node
// ============================================================
// produtos.js — deixa no ar so os 6 produtos da linha atual.
//
//   node produtos.js             # so mostra o que faria
//   node produtos.js --confirm   # aplica
//
// Os que sobram sao DESATIVADOS, nao apagados: somem da loja, do
// sitemap, dos feeds de anuncio e do catalogo, mas o cadastro fica
// no banco e o historico de pedidos nao quebra. Pra voltar, e so
// ligar o "Ativo" no painel.
//
// Antes de mexer, grava data/produtos-antes-<data>.json.
// ============================================================
const fs   = require('fs');
const path = require('path');
const { readData, writeData } = require('./db');

// Os 6 da linha atual — mesmos ids dos links dos anuncios do Meta.
const MANTER = [
  'pastel',
  'burger',
  'churros',
  'churros-aberto',
  'fritas',
  'caixa-para-batata-frita-fechada',
];

const confirmar = process.argv.includes('--confirm');
const produtos  = readData('products.json') || [];

const ficam = produtos.filter(p => MANTER.includes(String(p.id)));
const saem  = produtos.filter(p => !MANTER.includes(String(p.id)) && p.active !== false);
const jaOff = produtos.filter(p => !MANTER.includes(String(p.id)) && p.active === false);

console.log('\n  ===== produtos do site =====\n');
console.log('  Total cadastrado: ' + produtos.length + '\n');

console.log('  FICAM NO AR (' + ficam.length + ' de 6 esperados):');
ficam.forEach(p => console.log('    ' + String(p.id).padEnd(34) + p.name));
const faltando = MANTER.filter(id => !produtos.some(p => String(p.id) === id));
if (faltando.length) {
  console.log('\n    [!] esperado mas nao encontrado no banco: ' + faltando.join(', '));
  console.log('        confira se o id mudou antes de aplicar.');
}

console.log('\n  SAEM DO AR (' + saem.length + '):');
if (!saem.length) console.log('    (nenhum — o site ja esta so com a linha atual)');
saem.forEach(p => console.log('    ' + String(p.id).padEnd(34) + p.name));

if (jaOff.length) console.log('\n  Ja estavam desativados: ' + jaOff.length);

if (!saem.length) { console.log(''); process.exit(0); }

if (!confirmar) {
  console.log('\n  Isto foi so a previa — nada foi alterado.');
  console.log('  Confira a lista acima. Se estiver certa:');
  console.log('    node produtos.js --confirm\n');
  process.exit(0);
}

const dir = path.join(__dirname, 'data');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const arquivo = path.join(dir, 'produtos-antes-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json');
fs.writeFileSync(arquivo, JSON.stringify(produtos, null, 2), 'utf8');

produtos.forEach(p => { if (!MANTER.includes(String(p.id))) p.active = false; });
writeData('products.json', produtos);

console.log('\n  OK — ' + saem.length + ' produto(s) tirado(s) do ar.');
console.log('  Backup do cadastro anterior: ' + arquivo);
console.log('  Ficaram ' + ficam.length + ' produto(s) na loja.\n');
