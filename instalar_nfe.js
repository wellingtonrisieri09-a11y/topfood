#!/usr/bin/env node
// ============================================================
// instalar_nfe.js — instala o emissor de NF-e neste site
//
// Roda DENTRO da pasta do site que vai emitir:
//   node /var/www/NOME-DO-SITE/instalar_nfe.js
//
// Pergunta os dados da empresa, grava no cadastro deste site, deixa o
// ambiente em teste, zera a numeracao e diz o que ainda falta. Nunca
// vira pra producao — isso e decisao do dono, depois de testar.
//
// Sem terminal interativo (rodando por outro programa), passe tudo de
// uma vez:
//   node instalar_nfe.js --cnpj=00000000000000 --nome="Razao Social Ltda" \
//     --fantasia="Fantasia" --ie=000000000000 --logradouro="Rua X" \
//     --numero=100 --bairro=Centro --municipio="Santo Andre" --uf=SP \
//     --cep=09120410 --fone=11999999999
//
// O manual completo esta no EMISSOR-NFE.md.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { readData, writeData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

const arg = n => {
  const a = process.argv.find(x => x.startsWith('--' + n + '='));
  return a === undefined ? undefined : a.slice(('--' + n + '=').length).trim();
};
const forcar = process.argv.includes('--forcar');

// campo · onde mora em settings.fiscal · pergunta · obrigatorio
const CAMPOS = [
  ['cnpj',       'emitente.cnpj',       'CNPJ (só números)',              true],
  ['nome',       'emitente.nome',       'Razão social',                   true],
  ['fantasia',   'emitente.fantasia',   'Nome fantasia',                  false],
  ['ie',         'inscricao_estadual',  'Inscrição Estadual (só números)', true],
  ['logradouro', 'emitente.logradouro', 'Rua / Avenida',                  true],
  ['numero',     'emitente.numero',     'Número',                         true],
  ['bairro',     'emitente.bairro',     'Bairro',                         true],
  ['municipio',  'emitente.municipio',  'Município',                      true],
  ['uf',         'emitente.uf',         'UF (2 letras)',                  true],
  ['cep',        'emitente.cep',        'CEP (só números)',               true],
  ['fone',       'emitente.fone',       'Telefone com DDD',               false],
];

const pôr = (obj, caminho, valor) => {
  const p = caminho.split('.');
  let alvo = obj;
  p.slice(0, -1).forEach(k => { alvo[k] = alvo[k] || {}; alvo = alvo[k]; });
  alvo[p[p.length - 1]] = valor;
};

function validar(campo, v) {
  const so = String(v || '').replace(/\D/g, '');
  if (campo === 'cnpj' && so.length !== 14) return 'CNPJ tem 14 dígitos.';
  if (campo === 'cep'  && so.length !== 8)  return 'CEP tem 8 dígitos.';
  if (campo === 'ie'   && so.length < 8)    return 'Inscrição Estadual parece curta demais.';
  if (campo === 'uf'   && String(v).trim().length !== 2) return 'UF são 2 letras. Ex: SP';
  return null;
}

(async () => {
  console.log('\n  ===== instalar o emissor de NF-e neste site =====\n');
  console.log('  Pasta: ' + __dirname);

  // ── 1. o emissor esta aqui? ────────────────────────────────
  const precisa = ['modules/nfe_sefaz.js', 'modules/danfe_topfood.js',
    'data_municipios.json', 'nfe_emitente.js', 'nfe_numeracao.js', 'nfe_emitir.js'];
  const sumidos = precisa.filter(f => !fs.existsSync(path.join(__dirname, f)));
  if (sumidos.length) {
    console.log('\n  Faltam arquivos do emissor neste site:');
    sumidos.forEach(f => console.log('    - ' + f));
    console.log('\n  Rode o script de clonagem pra trazer o codigo e pare aqui.\n');
    process.exit(1);
  }
  try { require.resolve('nfewizard-io'); }
  catch (_) {
    console.log('\n  Falta a biblioteca nfewizard-io. Rode, nesta pasta:');
    console.log('    npm install --legacy-peer-deps --no-audit --no-fund\n');
    process.exit(1);
  }
  console.log('  Arquivos do emissor: ok');

  // ── 2. este site ja emite? nao mexer sem querer ────────────
  const fisAtual = nfe.getFiscal();
  const notas = (readData('orders.json') || []).filter(o => o && o.nfe && o.nfe.numero);
  const reais = notas.filter(o => o.nfe.ambiente !== 'homologacao');
  if (!forcar && fisAtual.ambiente === 'producao') {
    console.log('\n  PAREI. Este site ja esta em PRODUCAO' +
      (reais.length ? ' e tem ' + reais.length + ' nota(s) real(is).' : '.'));
    console.log('  Instalar aqui trocaria o emitente e zeraria a numeracao de quem ja');
    console.log('  emite de verdade. Se voce colou este comando na janela errada, e aqui');
    console.log('  que da pra voltar atras sem estrago.');
    console.log('\n  Se e este site mesmo, repita com --forcar.\n');
    process.exit(1);
  }

  const antes = nfe.getEmitente();
  if (antes.cnpj) {
    console.log('\n  CNPJ hoje no cadastro deste site: ' + antes.cnpj + '  (' + (antes.nome || 'sem nome') + ')');
    console.log('  Se este site foi copiado de outro, esse CNPJ e o da empresa de origem.');
  } else {
    console.log('\n  Nenhum emitente cadastrado ainda neste site.');
  }

  // ── 3. dados da empresa ────────────────────────────────────
  const valores = {};
  CAMPOS.forEach(([campo]) => { const v = arg(campo); if (v !== undefined) valores[campo] = v; });

  const faltaPerguntar = CAMPOS.filter(([campo, , , obrig]) => obrig && !valores[campo]);
  if (faltaPerguntar.length) {
    if (!process.stdin.isTTY) {
      console.log('\n  Sem terminal interativo. Passe os dados da empresa na linha de comando:');
      console.log('    node instalar_nfe.js \\');
      CAMPOS.forEach(([campo, , pergunta]) => console.log('      --' + campo + '=...   # ' + pergunta));
      console.log('');
      process.exit(1);
    }
    console.log('\n  Responda com os dados DESTA empresa. Nada e reaproveitado de outro site.\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const perguntar = q => new Promise(r => rl.question(q, x => r(x.trim())));
    for (const [campo, , pergunta, obrig] of CAMPOS) {
      if (valores[campo]) continue;
      for (;;) {
        const v = await perguntar('    ' + pergunta + (obrig ? ' *' : ' (pode deixar vazio)') + ': ');
        if (!v && !obrig) break;
        if (!v) { console.log('      precisa preencher.'); continue; }
        const erro = validar(campo, v);
        if (erro) { console.log('      ' + erro); continue; }
        valores[campo] = v;
        break;
      }
    }
    rl.close();
  }

  for (const [campo, , , obrig] of CAMPOS) {
    if (!obrig) continue;
    const erro = validar(campo, valores[campo]);
    if (erro) { console.log('\n  ' + erro + '  (campo ' + campo + ')\n'); process.exit(1); }
  }

  // ── 4. gravar ──────────────────────────────────────────────
  const s = readData('settings.json') || {};
  const fiscal = Object.assign({}, s.fiscal);
  const limpo = v => String(v || '').replace(/\D/g, '');
  pôr(fiscal, 'emitente.cnpj',       limpo(valores.cnpj));
  pôr(fiscal, 'emitente.nome',       valores.nome);
  pôr(fiscal, 'emitente.fantasia',   valores.fantasia || valores.nome);
  pôr(fiscal, 'inscricao_estadual',  limpo(valores.ie));
  pôr(fiscal, 'emitente.logradouro', valores.logradouro);
  pôr(fiscal, 'emitente.numero',     String(valores.numero));
  pôr(fiscal, 'emitente.bairro',     valores.bairro);
  pôr(fiscal, 'emitente.municipio',  valores.municipio);
  pôr(fiscal, 'emitente.uf',         String(valores.uf).toUpperCase());
  pôr(fiscal, 'emitente.cep',        limpo(valores.cep));
  pôr(fiscal, 'emitente.fone',       limpo(valores.fone));

  // O codigo IBGE precisa bater com a UF, senao a SEFAZ recusa a nota.
  const ibge = nfe.codMunicipio(valores.uf, valores.municipio);
  if (!ibge) {
    console.log('\n  Nao achei o codigo IBGE de "' + valores.municipio + '/' + valores.uf + '".');
    console.log('  Confira o nome do municipio e a UF e rode de novo.\n');
    process.exit(1);
  }
  pôr(fiscal, 'emitente.cod_municipio', String(ibge));

  // Site novo comeca em teste, sempre, e com a numeracao do zero: a primeira
  // nota desta empresa na SEFAZ e a numero 1, nao a que sobrou da copia.
  fiscal.ambiente = 'homologacao';
  fiscal.ultimo_numero = 0;
  fiscal.ultimo_numero_homologacao = 0;

  s.fiscal = fiscal;
  writeData('settings.json', s);
  if (typeof nfe.resetWizard === 'function') nfe.resetWizard();

  // ── 5. aviso das notas herdadas ────────────────────────────
  if (notas.length) {
    console.log('\n  ATENCAO: ha ' + notas.length + ' pedido(s) com nota registrada neste banco.');
    console.log('  Se este site foi copiado de outro, sao notas e clientes da outra empresa.');
    console.log('  Elas contam pra numeracao. Limpe os pedidos herdados no painel.');
    notas.slice(0, 10).forEach(o => console.log('    n ' + String(o.nfe.numero).padEnd(6) +
      (o.nfe.ambiente || 'ambiente nao marcado').padEnd(24) + ' pedido ' + o.id));
  }

  // ── 6. o que falta ─────────────────────────────────────────
  const e = nfe.getEmitente();
  console.log('\n  ----- emitente gravado neste site -----');
  console.log('    CNPJ        ' + e.cnpj);
  console.log('    Razao social ' + e.nome);
  console.log('    IE          ' + e.inscricao_estadual);
  console.log('    Endereco    ' + e.logradouro + ', ' + e.numero + ' - ' + e.bairro);
  console.log('                ' + e.municipio + '/' + e.uf + '  CEP ' + e.cep + '  IBGE ' + e.codMunicipio);
  console.log('    Telefone    ' + (e.fone || '(sem telefone — o DANFE sai sem a linha)'));

  const faltam = nfe.checarConfig();
  console.log('\n  Ambiente: homologacao (teste) — a virada pra producao e por sua conta, depois de testar.');
  console.log('  Proximo numero em producao: ' + nfe.proximoNumero('producao'));
  console.log('\n  Falta pra emitir: ' + (faltam.length ? faltam.join(', ') : 'nada — esta pronto.'));

  // ── 7. bilhete do certificado ──────────────────────────────
  if (!fs.existsSync(nfe.CERT_FILE) || !process.env.NFE_CERT_SENHA) {
    const bilhete = path.join(__dirname, 'FALTA-CERTIFICADO.md');
    fs.writeFileSync(bilhete,
`# Falta o certificado digital

O emissor de NF-e deste site já está instalado e com os dados da empresa
preenchidos. Falta só o certificado.

Precisa ser **A1** — arquivo \`.pfx\` ou \`.p12\` com senha. A3 (cartão ou token
físico) não funciona em servidor.

Quando o certificado chegar:

1. \`cp certificado.pfx ${path.join(__dirname, 'data', 'certificado.pfx')}\`
2. \`chmod 600 ${path.join(__dirname, 'data', 'certificado.pfx')}\`
3. Acrescente no \`${path.join(__dirname, '.env')}\`:  \`NFE_CERT_SENHA=a-senha\`
4. \`pm2 restart ${path.basename(__dirname)}\`
5. \`node ${path.join(__dirname, 'nfe_emitente.js')}\` — tem que dizer "nada — está pronto"
6. Emita **uma** nota de teste em homologação e confira o DANFE inteiro
7. Só depois disso, e com o CFOP/NCM confirmados pelo contador desta empresa:
   \`node ${path.join(__dirname, 'nfe_numeracao.js')} --ambiente=producao --confirmo\`
   e \`pm2 restart ${path.basename(__dirname)}\`

Manual completo: \`EMISSOR-NFE.md\`
`);
    console.log('\n  Deixei o que fazer quando o certificado chegar em:');
    console.log('    ' + bilhete);
  }

  console.log('\n  Instalacao concluida.\n');
})().catch(e => { console.error('\n  FALHOU: ' + e.message + '\n'); process.exit(1); });
