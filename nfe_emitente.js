#!/usr/bin/env node
// ============================================================
// nfe_emitente.js — quem assina a nota fiscal deste site
//
//   node nfe_emitente.js            # mostra os dados em uso
//   node nfe_emitente.js --gravar   # fixa os dados atuais em settings
//   node nfe_emitente.js --cnpj=05788238000147 --nome="Forpack Embalagens Ltda" ...
//
// O emissor de NF-e nao tem nada de empresa escrito no codigo: tudo vem
// de settings, pra mesma base servir TopFood e Forpack. O que existe sao
// VALORES PADRAO do TopFood, usados quando o campo esta vazio.
//
// E ai mora o perigo num clone: o Forpack nasce com uma copia do banco do
// TopFood. Campo de emitente vazio no Forpack = nota saindo com o CNPJ do
// TopFood. Este comando existe pra isso nao acontecer calado — ele mostra,
// campo a campo, o que veio do cadastro e o que veio do padrao.
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
  const origem = noCadastro ? '' : '   <-- PADRAO do TopFood, nao do cadastro';
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
  console.log('\n  ATENCAO: ' + doPadrao + ' campo(s) vindo(s) do padrao do TopFood.');
  console.log('  Se este site NAO e o TopFood, a nota sairia com os dados da outra');
  console.log('  empresa. Preencha cada um, por exemplo:');
  console.log('    node nfe_emitente.js --cnpj=05788238000147 --nome="Forpack Embalagens Ltda" \\');
  console.log('      --fantasia="Forpack Embalagens" --ie=111222333444 \\');
  console.log('      --logradouro="Rua Exemplo" --numero=100 --bairro=Centro \\');
  console.log('      --municipio="Santo Andre" --uf=SP --cep=09120410 --fone=11978332442');
  console.log('\n  Se este site E o TopFood, fixe os valores atuais no cadastro:');
  console.log('    node nfe_emitente.js --gravar');
}
console.log('');
