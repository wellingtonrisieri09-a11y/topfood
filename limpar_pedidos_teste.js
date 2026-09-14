#!/usr/bin/env node
// ============================================================
// limpar_pedidos_teste.js — tira da lista os pedidos de R$ 5
// que o robo de teste de cartao criou.
//
// Roda na VPS, direto no banco — nao depende do painel nem do
// cache do navegador.
//
//   node limpar_pedidos_teste.js            # so mostra o que seria removido
//   node limpar_pedidos_teste.js --confirm  # remove de verdade
//
// Antes de remover, grava uma copia em
// data/pedidos-removidos-<data>.json. Se algum virar chargeback,
// a prova continua existindo.
// ============================================================
const fs   = require('fs');
const path = require('path');
const { readData, writeData } = require('./db');

// Mesmo criterio da rota do painel: item do produto interno de teste,
// ou total ate R$ 5,01 (o pacote mais barato da loja e R$ 30).
function ehPedidoDeTeste(o) {
  const total = parseFloat(o.total) || 0;
  const temItemInterno = (o.items || []).some(it =>
    /produto de teste/i.test(it.name || '') || String(it.id || '') === 'teste-pag');
  return temItemInterno || (total > 0 && total <= 5.01);
}

const confirmar = process.argv.includes('--confirm');
const orders    = readData('orders.json');
const alvos     = orders.filter(ehPedidoDeTeste);
const ficam     = orders.filter(o => !ehPedidoDeTeste(o));

console.log('');
console.log('  Pedidos no banco:   ' + orders.length);
console.log('  De teste (R$ 5):    ' + alvos.length);
console.log('  Vendas de verdade:  ' + ficam.length);
console.log('');

if (!alvos.length) {
  console.log('  Nada a remover — a lista ja esta limpa.\n');
  process.exit(0);
}

console.log('  Primeiros que seriam removidos:');
alvos.slice(0, 10).forEach(o => {
  console.log('   - ' + o.id + '  R$ ' + o.total +
              '  ' + (o.customer?.name || 'sem nome') +
              '  <' + (o.customer?.email || '') + '>');
});
if (alvos.length > 10) console.log('   ... e mais ' + (alvos.length - 10) + ' pedido(s).');
console.log('');

if (!confirmar) {
  console.log('  Isto foi so a previa. Para remover de verdade:');
  console.log('    node limpar_pedidos_teste.js --confirm\n');
  process.exit(0);
}

const dir = path.join(__dirname, 'data');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const arquivo = path.join(dir, 'pedidos-removidos-' + ts + '.json');
fs.writeFileSync(arquivo, JSON.stringify(alvos, null, 2), 'utf8');

writeData('orders.json', ficam);

console.log('  OK — ' + alvos.length + ' pedido(s) removido(s).');
console.log('  Copia de seguranca: ' + arquivo);
console.log('  Sobraram ' + ficam.length + ' pedido(s) de verdade.\n');
