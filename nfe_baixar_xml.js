#!/usr/bin/env node
// ============================================================
// nfe_baixar_xml.js — baixa o XML de uma NF-e direto da SEFAZ.
//
//   node nfe_baixar_xml.js --chave=35260767038607000131550010000000021585355446
//
// Usa o certificado A1 da empresa e o servico de Distribuicao
// DFe. Nao depende de Focus, de mensalidade nem de painel de
// terceiro — e a propria SEFAZ entregando o documento.
//
// O XML e o documento fiscal; o DANFE (PDF) e so a folha
// impressa dele. E o XML que o contador escritura.
//
// Se o pedido correspondente existir no banco, o script tambem
// regrava os dados da nota nele, pra ela voltar a aparecer em
// "Notas emitidas" no painel.
// ============================================================
// Carrega o .env pelo caminho do proprio script: assim o comando funciona
// de qualquer diretorio, nao so de dentro de /var/www/topfood.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs   = require('fs');
const path = require('path');
const { readData, writeData } = require('./db');
const nfe  = require('./modules/nfe_sefaz');

const argChave = (process.argv.find(a => a.startsWith('--chave=')) || '').split('=')[1] || '';
const chave = argChave.replace(/\D/g, '');

// Codigo da UF dentro da propria chave (2 primeiros digitos)
const UF_CODIGO = { '35': 'SP', '31': 'MG', '33': 'RJ', '41': 'PR', '43': 'RS', '42': 'SC', '29': 'BA' };

(async () => {
  console.log('\n  ===== baixar XML da NF-e na SEFAZ =====\n');

  if (chave.length !== 44) {
    console.log('  Informe a chave de acesso (44 digitos):');
    console.log('    node nfe_baixar_xml.js --chave=3526076703860700013155...\n');
    console.log('  A chave esta impressa no DANFE, no quadro "CHAVE DE ACESSO".\n');
    process.exit(1);
  }

  // A chave se explica sozinha — conferir isso antes evita consulta inutil.
  const uf = chave.slice(0, 2), aamm = chave.slice(2, 6), cnpj = chave.slice(6, 20);
  console.log('  Chave:    ' + chave);
  console.log('  UF:       ' + uf + (UF_CODIGO[uf] ? ' (' + UF_CODIGO[uf] + ')' : ''));
  console.log('  Emissao:  ' + aamm.slice(2) + '/20' + aamm.slice(0, 2));
  console.log('  CNPJ:     ' + cnpj);
  console.log('  Modelo:   ' + chave.slice(20, 22) + ' · serie ' + chave.slice(22, 25) + ' · numero ' + parseInt(chave.slice(25, 34)));
  console.log('');

  const emit = nfe.getEmitente();
  if (cnpj !== emit.cnpj) {
    console.log('  ATENCAO: o CNPJ da chave nao e o do emitente cadastrado.');
    console.log('           chave: ' + cnpj + '  ·  cadastro: ' + emit.cnpj);
    console.log('           A SEFAZ so entrega documento de interesse do CNPJ do certificado.\n');
  }

  const faltam = nfe.checarConfig();
  if (faltam.length) {
    console.log('  FALTA PREENCHER:');
    faltam.forEach(f => console.log('    - ' + f));
    console.log('');
    process.exit(1);
  }

  console.log('  Consultando a SEFAZ...\n');
  let resposta;
  try {
    const w = await nfe.getWizard();
    resposta = await w.NFE_DistribuicaoDFePorChave({
      cUFAutor: parseInt(uf),
      CNPJ: emit.cnpj,
      consChNFe: { chNFe: chave },
    });
  } catch (e) {
    console.log('  ERRO na consulta: ' + e.message + '\n');
    process.exit(1);
  }

  // A lib ja salva os XMLs baixados na pasta de distribuicao.
  const dir = path.join(nfe.XML_DIR, 'distribuicao');
  const arquivos = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.includes(chave) || f.endsWith('.xml'))
    : [];

  console.log('  RESPOSTA:');
  console.log(JSON.stringify(resposta, null, 2).split('\n').slice(0, 40).map(l => '    ' + l).join('\n'));
  console.log('');

  if (arquivos.length) {
    console.log('  XML(s) salvos em ' + dir + ':');
    arquivos.forEach(f => console.log('    ' + f));
    console.log('\n  E esse arquivo que vai pro contador.\n');
  } else {
    console.log('  Nenhum XML salvo. Se a resposta acima trouxer so o resumo');
    console.log('  (resNFe) em vez do documento completo, e porque a SEFAZ');
    console.log('  entrega o XML inteiro pelo destinatario — nesse caso o');
    console.log('  caminho e o contador puxar pela Distribuicao DFe dele.\n');
  }

  // Regrava a nota no pedido, se der pra identificar qual e.
  const numero = String(parseInt(chave.slice(25, 34)));
  const serie  = String(parseInt(chave.slice(22, 25)));
  const orders = readData('orders.json') || [];
  const idx = orders.findIndex(o => o.nfe && String(o.nfe.chave || '').replace(/\D/g, '') === chave);
  if (idx >= 0) {
    console.log('  O pedido ' + orders[idx].id + ' ja tem essa nota registrada.\n');
  } else {
    console.log('  Nenhum pedido no banco aponta pra essa chave.');
    console.log('  Pra religar a nota ao pedido (e ela voltar a aparecer em');
    console.log('  "Notas emitidas" no painel):');
    console.log('    node nfe_baixar_xml.js --chave=' + chave + ' --pedido=ID-DO-PEDIDO\n');
  }

  const argPedido = (process.argv.find(a => a.startsWith('--pedido=')) || '').split('=')[1];
  if (argPedido && idx < 0) {
    const i = orders.findIndex(o => String(o.id) === argPedido);
    if (i < 0) { console.log('  Pedido ' + argPedido + ' nao encontrado.\n'); process.exit(1); }
    orders[i].nfe = Object.assign({}, orders[i].nfe, {
      chave, numero, serie, status: 'autorizado', emitida_em: '20' + aamm.slice(0, 2) + '-' + aamm.slice(2) + '-01',
    });
    writeData('orders.json', orders);
    console.log('  Nota religada ao pedido ' + argPedido + '. Ja aparece no painel.\n');
  }
})();
