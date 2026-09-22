#!/usr/bin/env node
// ============================================================
// ml_desconectar.js — tira TODAS as contas do Mercado Livre do
// painel e apaga o vinculo dos produtos com os anuncios antigos.
//
//   node ml_desconectar.js             # so mostra o que faria
//   node ml_desconectar.js --confirm   # aplica
//
// IMPORTANTE: isto NAO apaga os anuncios la no Mercado Livre.
// Eles continuam no ar, vendendo, nas contas antigas — so que o
// site para de acompanhar. Pra tirar do ar, pause ou encerre os
// anuncios dentro do proprio Mercado Livre.
//
// Antes de mexer, grava copia em data/ml-antes-<data>/.
// ============================================================
const fs   = require('fs');
const path = require('path');
const { readData, writeData } = require('./db');

const DATA_DIR  = path.join(__dirname, 'data');
const ACCT_FILE = path.join(DATA_DIR, 'ml_accounts.json');
const TOK_FILE  = path.join(DATA_DIR, 'ml_tokens.json'); // legado (conta unica)

const confirmar = process.argv.includes('--confirm');

function lerJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } }

const contas   = lerJSON(ACCT_FILE) || {};
const legado   = lerJSON(TOK_FILE);
const produtos = readData('products.json') || [];

// quais produtos/variacoes tem anuncio vinculado
const vinculos = [];
produtos.forEach(p => (p.variants || []).forEach(v => {
  const ids = [];
  if (v.ml_items && typeof v.ml_items === 'object') Object.values(v.ml_items).forEach(x => ids.push(x));
  if (v.ml_item_id) ids.push(v.ml_item_id);
  if (ids.length) vinculos.push({ produto: p.name, id: p.id, units: v.units, anuncios: ids });
}));

console.log('\n  ===== Mercado Livre =====\n');

const ids = Object.keys(contas);
console.log('  CONTAS CONECTADAS (' + ids.length + '):');
if (!ids.length) console.log('    (nenhuma)');
ids.forEach(id => {
  const a = contas[id];
  console.log('    ' + String(id).padEnd(14) + (a.label || a.nickname || '(sem nome)'));
});
if (legado) console.log('\n    + ml_tokens.json (conta unica antiga) tambem sera removido');

console.log('\n  PRODUTOS COM ANUNCIO VINCULADO (' + vinculos.length + ' variacao(oes)):');
if (!vinculos.length) console.log('    (nenhum)');
vinculos.forEach(v => console.log('    ' + String(v.id).padEnd(34) + v.units + ' un  ->  ' + v.anuncios.join(', ')));

if (!ids.length && !vinculos.length && !legado) {
  console.log('\n  Nada a desconectar — o painel ja esta sem Mercado Livre.\n');
  process.exit(0);
}

if (!confirmar) {
  console.log('\n  Isto foi so a previa — nada foi alterado.');
  console.log('  Lembre: os anuncios continuam no ar no Mercado Livre.');
  console.log('  Pra aplicar:');
  console.log('    node ml_desconectar.js --confirm\n');
  process.exit(0);
}

// copia de seguranca
const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(DATA_DIR, 'ml-antes-' + ts);
fs.mkdirSync(dir, { recursive: true });
if (fs.existsSync(ACCT_FILE)) fs.copyFileSync(ACCT_FILE, path.join(dir, 'ml_accounts.json'));
if (fs.existsSync(TOK_FILE))  fs.copyFileSync(TOK_FILE,  path.join(dir, 'ml_tokens.json'));
fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify(produtos, null, 2), 'utf8');

// 1. contas fora
fs.writeFileSync(ACCT_FILE, JSON.stringify({}, null, 2), 'utf8');
if (fs.existsSync(TOK_FILE)) fs.unlinkSync(TOK_FILE);

// 2. vinculo dos produtos fora
let limpos = 0;
produtos.forEach(p => (p.variants || []).forEach(v => {
  if (v.ml_items)   { delete v.ml_items;   limpos++; }
  if (v.ml_item_id) { delete v.ml_item_id; limpos++; }
}));
writeData('products.json', produtos);

console.log('\n  OK — ' + ids.length + ' conta(s) desconectada(s) do painel.');
console.log('  ' + limpos + ' vinculo(s) de anuncio apagado(s) dos produtos.');
console.log('  Copia de seguranca: ' + dir);
console.log('\n  ATENCAO: os anuncios continuam no ar no Mercado Livre.');
console.log('  Pra tirar de venda, pause ou encerre dentro do proprio ML.\n');
