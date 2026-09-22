#!/usr/bin/env node
// ============================================================
// nfe_emitente.js — quem assina a nota fiscal deste site
//
//   node nfe_emitente.js            # mostra os dados em uso
//   node nfe_emitente.js --cnpj=00000000000000 --nome="Razao Social Ltda" ...
//   node nfe_emitente.js --gravar   # fixa no cadastro o que ja esta valendo
//
// O emissor nao tem empresa nenhuma escrita no codigo: cada site preenche
// o seu aqui, e campo vazio trava a emissao em vez de completar sozinho.
//
// E este comando que se usa pra plugar o emissor num site novo. O passo a
// passo completo esta no EMISSOR-NFE.md.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs   = require('fs');
const path = require('path');
const { readData, writeData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

const arg = n => {
  const a = process.argv.find(x => x.startsWith('--' + n + '='));
  return a === undefined ? undefined : a.slice(('--' + n + '=').length);
};

// nome do campo na linha de comando -> onde mora em settings.fiscal
const CAMPOS = [
  ['cnpj',       'emitente.cnpj',        'CNPJ'],
  ['nome',       'emitente.nome',        'Razao social'],
  ['fantasia',   'emitente.fantasia',    'Nome fantasia'],
  ['logradouro', 'emitente.logradouro',  'Rua / Avenida'],
  ['numero',     'emitente.numero',      'Numero'],
  ['bairro',     'emitente.bairro',      'Bairro'],
  ['municipio',  'emitente.municipio',   'Municipio'],
  ['uf',         'emitente.uf',          'UF'],
  ['cep',        'emitente.cep',         'CEP'],
  ['fone',       'emitente.fone',        'Telefone'],
  ['ie',         'inscricao_estadual',   'Inscricao Estadual'],
];

function pegar(f, caminho) {
  return caminho.split('.').reduce((o, k) => (o || {})[k], f);
}
function pôr(f, caminho, valor) {
  const partes = caminho.split('.');
  let alvo = f;
  partes.slice(0, -1).forEach(k => { alvo[k] = alvo[k] || {}; alvo = alvo[k]; });
  alvo[partes[partes.length - 1]] = valor;
}

const s = readData('settings.json') || {};
const fiscal = Object.assign({}, s.fiscal);
let mexeu = false;

// 1) valores passados na linha de comando
CAMPOS.forEach(([flag, caminho]) => {
  const v = arg(flag);
  if (v !== undefined) { pôr(fiscal, caminho, v.trim()); mexeu = true; }
});

// 2) --gravar fixa o que esta valendo agora (inclusive o que vinha do padrao),
//    pra nenhum campo continuar dependendo de um padrao que nao e desta empresa
if (process.argv.includes('--gravar')) {
  const atual = nfe.getEmitente();
  const de = { cnpj: atual.cnpj, nome: atual.nome, fantasia: atual.fantasia,
    logradouro: atual.logradouro, numero: atual.numero, bairro: atual.bairro,
    municipio: atual.municipio, uf: atual.uf, cep: atual.cep, fone: atual.fone,
    ie: atual.inscricao_estadual };
  CAMPOS.forEach(([flag, caminho]) => {
    if (!pegar(fiscal, caminho) && de[flag]) { pôr(fiscal, caminho, de[flag]); mexeu = true; }
  });
}

if (mexeu) {
  // O codigo IBGE tem que bater com o municipio, senao a SEFAZ recusa a nota.
  const em = fiscal.emitente || {};
  const ibge = nfe.codMunicipio(em.uf, em.municipio);
  if (ibge) pôr(fiscal, 'emitente.cod_municipio', String(ibge));
  s.fiscal = fiscal;
  writeData('settings.json', s);
  console.log('\n  Dados do emitente gravados no cadastro deste site.');
}

// ── relatorio ──────────────────────────────────────────────
const e = nfe.getEmitente();
const f2 = (readData('settings.json') || {}).fiscal || {};

console.log('\n  ===== emitente da nota fiscal =====\n');
console.log('  Pasta: ' + __dirname);

const valores = { cnpj: e.cnpj, nome: e.nome, fantasia: e.fantasia,
  logradouro: e.logradouro, numero: e.numero, bairro: e.bairro,
  municipio: e.municipio, uf: e.uf, cep: e.cep, fone: e.fone,
  ie: e.inscricao_estadual };

let doPadrao = 0;
console.log('');
CAMPOS.forEach(([flag, caminho, rotulo]) => {
  const noCadastro = pegar(f2, caminho);
  const origem = noCadastro ? '' : '   <-- VEM DO CODIGO, nao do cadastro deste site';
  if (!noCadastro) doPadrao++;
  console.log('    ' + rotulo.padEnd(20) + String(valores[flag] || '(vazio)').padEnd(34) + origem);
});
console.log('    ' + 'IBGE do municipio'.padEnd(20) + e.codMunicipio);
console.log('    ' + 'Regime tributario'.padEnd(20) + e.regime_tributario + (e.regime_tributario === 1 ? ' (Simples Nacional)' : ''));

const cert = nfe.CERT_FILE;
console.log('\n  Certificado A1: ' + cert + (fs.existsSync(cert) ? '   (encontrado)' : '   *** NAO ENCONTRADO ***'));
console.log('  Senha no .env : ' + (process.env.NFE_CERT_SENHA ? 'preenchida' : '*** FALTANDO (NFE_CERT_SENHA) ***'));

const faltam = nfe.checarConfig();
console.log('\n  Falta pra emitir: ' + (faltam.length ? faltam.join(', ') : 'nada — esta pronto.'));

if (doPadrao) {
  console.log('\n  ATENCAO: ' + doPadrao + ' campo(s) nao estao no cadastro deste site.');
  console.log('  Eles vem de valores embutidos no codigo, que sao os da empresa de');
  console.log('  onde este site foi copiado. Confira o CNPJ acima: se nao for o desta');
  console.log('  empresa, a nota sairia no nome de outra. Preencha cada campo:');
  console.log('    node nfe_emitente.js --cnpj=00000000000000 --nome="Razao Social Ltda" \\');
  console.log('      --fantasia="Nome Fantasia" --ie=111222333444 \\');
  console.log('      --logradouro="Rua Exemplo" --numero=100 --bairro=Centro \\');
  console.log('      --municipio="Santo Andre" --uf=SP --cep=09120410 --fone=11978332442');
  console.log('\n  Se o CNPJ acima E o desta empresa, fixe os valores no cadastro:');
  console.log('    node nfe_emitente.js --gravar');
}
console.log('');
