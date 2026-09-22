#!/usr/bin/env node
// ============================================================
// nfe_configurar.js — grava os dados do emitente no cadastro.
//
//   node nfe_configurar.js             # mostra o que faria
//   node nfe_configurar.js --confirm   # grava
//
// Os dados abaixo sao os do Cartao CNPJ e do Contrato Social da
// TopFood, conferidos documento por documento. Digitar isso na
// mao no painel e onde nascem os erros que a SEFAZ rejeita.
//
// A Inscricao Estadual NAO esta nos documentos (ela e estadual,
// sai do CADESP) — tem que ser informada separada:
//   node nfe_configurar.js --confirm --ie=123456789012
// ============================================================
const { readData, writeData } = require('./db');

// Conferido no Comprovante de Inscricao (CNPJ) emitido em 28/05/2026
// e no Contrato Social.
const EMITENTE = {
  cnpj:         '67038607000131',
  nome:         'TOPFOOD EMBALAGENS LTDA',      // razao social
  fantasia:     'TopFood Embalagens',
  logradouro:   'R REINALDO TEIXEIRA',
  numero:       '85',
  bairro:       'ALVARENGA',
  municipio:    'SAO BERNARDO DO CAMPO',
  cod_municipio:'3548708',                       // IBGE de Sao Bernardo do Campo
  uf:           'SP',
  cep:          '09850720',
  cnae:         '1731100',                       // Fabricacao de embalagens de papel
  natureza_juridica: '2062',                     // Sociedade Empresaria Limitada
};

const confirmar = process.argv.includes('--confirm');
const argIE = (process.argv.find(a => a.startsWith('--ie=')) || '').split('=')[1];
const ie = (argIE || '').replace(/\D/g, '');

const s = readData('settings.json') || {};
const f = s.fiscal || {};
const atualIE = String(f.inscricao_estadual || '').replace(/\D/g, '');

console.log('\n  ===== emitente da NF-e =====\n');
Object.entries(EMITENTE).forEach(([k, v]) => console.log('  ' + k.padEnd(18) + v));
console.log('  ' + 'inscricao_estadual'.padEnd(18) + (ie || atualIE || '*** FALTA ***'));
console.log('');

if (!ie && !atualIE) {
  console.log('  A Inscricao Estadual nao esta nos documentos e nao esta no cadastro.');
  console.log('  Sem ela a SEFAZ rejeita a nota. Pegue no CADESP e rode:');
  console.log('    node nfe_configurar.js --confirm --ie=SEUNUMERO\n');
}

if (!confirmar) {
  console.log('  Previa — nada foi gravado. Para gravar:');
  console.log('    node nfe_configurar.js --confirm' + (ie ? ' --ie=' + ie : '') + '\n');
  process.exit(0);
}

f.emitente = Object.assign({}, f.emitente, EMITENTE);
if (ie) f.inscricao_estadual = ie;
if (!f.regime_tributario) f.regime_tributario = 1;       // Simples Nacional (porte ME)
if (!f.ambiente)          f.ambiente = 'homologacao';     // sempre comeca em teste
if (!f.serie)             f.serie = 1;
s.fiscal = f;
writeData('settings.json', s);

console.log('  Gravado no cadastro.');
console.log('  Ambiente: ' + f.ambiente + (f.ambiente === 'homologacao' ? ' (teste — correto pra comecar)' : ''));
console.log('\n  Proximo passo: node nfe_teste.js\n');
