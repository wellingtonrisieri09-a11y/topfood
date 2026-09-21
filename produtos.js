#!/usr/bin/env node
// ============================================================
// produtos.js — deixa no catalogo SO os 6 produtos da linha atual.
//
//   node produtos.js             # so mostra o que seria apagado
//   node produtos.js --confirm   # APAGA do banco
//
// O que nao esta na lista dos 6 e removido do cadastro de vez.
// Antes de apagar, grava data/produtos-antes-<data>.json com o
// cadastro inteiro — e por ali que da pra recuperar se precisar.
//
// Pedido antigo nao quebra: o pedido guarda nome e preco do item
// no momento da compra, nao depende do produto continuar cadastrado.
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
const saem  = produtos.filter(p => !MANTER.includes(String(p.id)));

console.log('\n  ===== catalogo do site =====\n');
console.log('  Total cadastrado: ' + produtos.length + '\n');

console.log('  FICAM (' + ficam.length + ' de 6 esperados):');
ficam.forEach(p => console.log('    ' + String(p.id).padEnd(34) + p.name));

const faltando = MANTER.filter(id => !produtos.some(p => String(p.id) === id));
if (faltando.length) {
  console.log('\n    [!] ATENCAO — esperado mas nao encontrado: ' + faltando.join(', '));
  console.log('        o id pode ter mudado. NAO aplique antes de conferir,');
  console.log('        ou voce apaga um produto que deveria ficar.');
}

console.log('\n  SERAO APAGADOS (' + saem.length + '):');
if (!saem.length) console.log('    (nenhum — o catalogo ja esta so com os 6)');
saem.forEach(p => console.log('    ' + String(p.id).padEnd(34) + p.name));

if (!saem.length) { console.log(''); process.exit(0); }

if (!confirmar) {
  console.log('\n  Isto foi so a previa — nada foi apagado.');
  console.log('  Confira a lista acima com calma. Se estiver certa:');
  console.log('    node produtos.js --confirm\n');
  process.exit(0);
}

if (faltando.length) {
  console.log('\n  PAREI. Faltou encontrar ' + faltando.length + ' dos 6 que deveriam ficar.');
  console.log('  Conferir isso antes e mais barato que recuperar depois.\n');
  process.exit(1);
}

const dir = path.join(__dirname, 'data');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const arquivo = path.join(dir, 'produtos-antes-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json');
fs.writeFileSync(arquivo, JSON.stringify(produtos, null, 2), 'utf8');

writeData('products.json', ficam);

console.log('\n  OK — ' + saem.length + ' produto(s) apagado(s) do cadastro.');
console.log('  Backup do cadastro anterior: ' + arquivo);
console.log('  O catalogo agora tem ' + ficam.length + ' produto(s).\n');
