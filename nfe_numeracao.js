#!/usr/bin/env node
// ============================================================
// nfe_numeracao.js — conferir e acertar a numeracao das notas
//
//   node nfe_numeracao.js                      # mostra a situacao
//   node nfe_numeracao.js --marcar-teste=906,907
//   node nfe_numeracao.js --producao=2
//
// Homologacao e producao tem numeracao independente na SEFAZ. O que
// decide o proximo numero de producao e o MAIOR numero ja usado em
// producao — e nota de teste nao pode entrar nessa conta, senao a
// primeira nota real nasce centenas de numeros a frente e o fisco
// cobra a justificativa do buraco (inutilizacao).
//
// Notas emitidas antes de o campo "ambiente" existir nao dizem de que
// ambiente sao. Este comando serve pra marcar essas.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { readData, writeData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];

const marcar = String(arg('marcar-teste') || '').split(',').map(x => x.trim()).filter(Boolean);
const prod   = arg('producao');

const orders = readData('orders.json') || [];
const comNota = orders.filter(o => o && o.nfe && o.nfe.numero);

if (marcar.length) {
  let mexeu = 0;
  orders.forEach(o => {
    if (o && o.nfe && marcar.includes(String(o.nfe.numero))) {
      o.nfe.ambiente = 'homologacao';
      mexeu++;
    }
  });
  if (mexeu) { writeData('orders.json', orders); console.log('\n  ' + mexeu + ' nota(s) marcada(s) como homologacao.'); }
  else console.log('\n  Nenhuma nota com esses numeros. Nada mudou.');
}

if (prod !== undefined) {
  const n = parseInt(prod);
  if (!(n >= 0)) { console.log('\n  --producao precisa de um numero. Ex: --producao=2\n'); process.exit(1); }
  const s = readData('settings.json') || {};
  s.fiscal = Object.assign({}, s.fiscal, { ultimo_numero: n });
  writeData('settings.json', s);
  console.log('\n  Contador de producao gravado: ultima nota = ' + n + '.');
}

console.log('\n  ===== numeracao das notas =====\n');
const fis = nfe.getFiscal();
console.log('  Ambiente configurado agora: ' + fis.ambiente +
  (fis.ambiente === 'producao' ? '   *** AS NOTAS VALEM FISCALMENTE ***' : '   (teste)'));

if (!comNota.length) console.log('\n  Nenhuma nota registrada nos pedidos.');
else {
  console.log('\n  Notas registradas:');
  comNota
    .sort((a, b) => parseInt(a.nfe.numero) - parseInt(b.nfe.numero))
    .forEach(o => console.log('    n ' + String(o.nfe.numero).padEnd(6) +
      (o.nfe.ambiente || '(ambiente nao marcado — conta como producao)').padEnd(46) +
      ' pedido ' + o.id));
}

const s = readData('settings.json') || {};
const f = s.fiscal || {};
console.log('\n  Contador guardado  · producao: ' + (f.ultimo_numero || 0) +
            '  · homologacao: ' + (f.ultimo_numero_homologacao || 0));
console.log('  Proximo numero     · producao: ' + nfe.proximoNumero('producao') +
            '  · homologacao: ' + nfe.proximoNumero('homologacao'));

const semAmbiente = comNota.filter(o => !o.nfe.ambiente);
if (semAmbiente.length) {
  console.log('\n  ATENCAO: ' + semAmbiente.length + ' nota(s) sem ambiente marcado contam como producao.');
  console.log('  Se forem de teste, marque antes de virar a chave:');
  console.log('    node nfe_numeracao.js --marcar-teste=' + semAmbiente.map(o => o.nfe.numero).join(','));
}
console.log('');
