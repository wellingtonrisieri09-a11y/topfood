#!/usr/bin/env node
// ============================================================
// status.js — raio-x rapido do TopFood na VPS.
//
//   node status.js
//
// Serve pra conferir, depois de um deploy, se o que subiu realmente
// pegou: versao do codigo, faxina dos pedidos de teste, telefone e
// notas fiscais. So le, nao altera nada.
// ============================================================
const { execSync } = require('child_process');
const { readData, readSettings } = require('./db');

function linha(rotulo, valor, ok) {
  const marca = ok === true ? 'OK   ' : ok === false ? 'OLHAR' : '     ';
  console.log('  ' + marca + '  ' + rotulo.padEnd(22) + valor);
}

console.log('\n  ===== TopFood — status =====\n');

// versao do codigo que esta rodando
try {
  const commit = execSync('git log --oneline -1', { cwd: __dirname }).toString().trim();
  linha('Codigo', commit);
} catch (_) { linha('Codigo', '(nao foi possivel ler o git)'); }

const orders   = readData('orders.json') || [];
const settings = readSettings() || {};

// pedidos de R$ 5 do robo de teste de cartao
const cinco = orders.filter(o => { const v = parseFloat(o.total) || 0; return v > 0 && v <= 5.01; });
linha('Pedidos no banco', String(orders.length));
linha('Ainda de R$ 5', String(cinco.length), cinco.length === 0);

// telefone do site
const fone = String(settings.whatsapp || '').replace(/\D/g, '');
linha('WhatsApp', fone || '(vazio)', fone === '5511978332442');

// notas fiscais
const comNota   = orders.filter(o => o.nfe);
const autorizadas = comNota.filter(o => o.nfe.status === 'autorizado');
const fiscal    = settings.fiscal || {};
linha('Notas emitidas', String(comNota.length) + ' (' + autorizadas.length + ' autorizada(s))');
linha('Ambiente fiscal', fiscal.ambiente || 'homologacao',
      fiscal.ambiente === 'producao' ? true : null);

const faltam = [];
if (!fiscal.inscricao_estadual) faltam.push('Inscricao Estadual');
if (!fiscal.ncm) faltam.push('NCM');
if (!(fiscal.ambiente === 'producao' ? fiscal.token_producao : fiscal.token_homologacao)) faltam.push('Token Focus');
linha('Config fiscal', faltam.length ? 'falta: ' + faltam.join(', ') : 'completa', faltam.length === 0);

if (autorizadas.length) {
  console.log('\n  Notas autorizadas:');
  autorizadas.forEach(o => console.log('    no ' + (o.nfe.numero || '?') +
    '  pedido ' + o.id + '  R$ ' + o.total + '  chave ' + (o.nfe.chave || '-')));
}
console.log('');
