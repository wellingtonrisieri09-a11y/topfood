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
//
// A IE da TopFood ja esta preenchida abaixo (conferida pelos digitos
// verificadores); --ie so e preciso pra outra empresa, como a Forpack.
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
  // IE do CADESP. Nao vem no Cartao CNPJ nem no Contrato Social.
  inscricao_estadual: '160075044114',
};

// Confere os dois digitos verificadores da IE paulista. Melhor descobrir o
// erro de digitacao aqui do que na rejeicao da SEFAZ.
function validaIeSP(ie) {
  const d = String(ie).replace(/\D/g, '');
  if (d.length !== 12) return { ok: false, motivo: 'IE de SP tem 12 digitos, esta tem ' + d.length };
  const n = d.split('').map(Number);
  const p1 = [1, 3, 4, 5, 6, 7, 8, 10];
  let s1 = 0; for (let i = 0; i < 8; i++) s1 += n[i] * p1[i];
  const p2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  let s2 = 0; for (let i = 0; i < 11; i++) s2 += n[i] * p2[i];
  const ok = (s1 % 11) % 10 === n[8] && (s2 % 11) % 10 === n[11];
  return { ok, motivo: ok ? '' : 'digito verificador nao confere' };
}

const confirmar = process.argv.includes('--confirm');
const argIE = (process.argv.find(a => a.startsWith('--ie=')) || '').split('=')[1];
const argAmb = (process.argv.find(a => a.startsWith('--ambiente=')) || '').split('=')[1];
const ie = (argIE || '').replace(/\D/g, '') || EMITENTE.inscricao_estadual;

const s = readData('settings.json') || {};
const f = s.fiscal || {};
const atualIE = String(f.inscricao_estadual || '').replace(/\D/g, '');

console.log('\n  ===== emitente da NF-e =====\n');
Object.entries(EMITENTE)
  .filter(([k]) => k !== 'inscricao_estadual')   // mostrada logo abaixo, com a validacao
  .forEach(([k, v]) => console.log('  ' + k.padEnd(20) + v));
const ieFinal = ie || atualIE;
const check = ieFinal ? validaIeSP(ieFinal) : { ok: false, motivo: 'nao informada' };
console.log('  ' + 'inscricao_estadual'.padEnd(20) + (ieFinal || '*** FALTA ***') +
            (ieFinal ? (check.ok ? '   (digitos conferem)' : '   *** ' + check.motivo + ' ***') : ''));
console.log('');

if (ieFinal && !check.ok) {
  console.log('  PAREI: a Inscricao Estadual nao passa na validacao (' + check.motivo + ').');
  console.log('  Confira o numero antes de gravar — a SEFAZ rejeitaria a nota.\n');
  process.exit(1);
}

if (!ieFinal) {
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
// --ambiente troca explicitamente; sem ele, so define quando ainda nao existe.
if (argAmb === 'producao' || argAmb === 'homologacao') f.ambiente = argAmb;
if (!f.ambiente)          f.ambiente = 'homologacao';     // sempre comeca em teste
if (!f.serie)             f.serie = 1;
s.fiscal = f;
writeData('settings.json', s);

console.log('  Gravado no cadastro.');
console.log('  Ambiente: ' + f.ambiente + (f.ambiente === 'homologacao' ? ' (teste — correto pra comecar)' : ''));
console.log('\n  Proximo passo: node nfe_teste.js\n');
