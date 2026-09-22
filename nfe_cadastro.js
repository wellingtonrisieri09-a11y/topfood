#!/usr/bin/env node
// ============================================================
// nfe_cadastro.js — pergunta pra SEFAZ se um CNPJ e contribuinte
// de ICMS e qual a Inscricao Estadual dele.
//
//   node nfe_cadastro.js --cnpj=05788238000147
//   node nfe_cadastro.js --cnpj=05788238000147 --uf=SP
//   node nfe_cadastro.js --cnpj=... --pedido=TESTE-001   # grava a IE no pedido
//
// Serve pra nao precisar adivinhar: declarar "nao contribuinte"
// quem tem IE da rejeicao, e declarar contribuinte sem ter a IE
// tambem. Quem sabe a resposta e o cadastro da propria SEFAZ.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { readData, writeData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const cnpj = String(arg('cnpj') || '').replace(/\D/g, '');
const uf = (arg('uf') || nfe.getEmitente().uf).toUpperCase();
const pedidoId = arg('pedido');

(async () => {
  console.log('\n  ===== consulta cadastro na SEFAZ =====\n');

  if (cnpj.length !== 14) {
    console.log('  Informe o CNPJ:  node nfe_cadastro.js --cnpj=05788238000147\n');
    process.exit(1);
  }

  const faltam = nfe.checarConfig();
  if (faltam.length) {
    console.log('  FALTA PREENCHER:');
    faltam.forEach(f => console.log('    - ' + f));
    console.log('');
    process.exit(1);
  }

  console.log('  CNPJ: ' + cnpj + '   UF: ' + uf);
  console.log('  Consultando...\n');

  let bruto;
  try {
    const w = await nfe.getWizard();
    bruto = await w.NFE_ConsultaCadastro({ uf, cnpj });
  } catch (e) {
    console.log('  ERRO: ' + e.message + '\n');
    if (/SOAP|nao encontrado|não encontrado/i.test(e.message)) {
      console.log('  A biblioteca nao traz o endereco desse servico configurado,');
      console.log('  entao a consulta automatica nao esta disponivel.');
    }
    console.log('');
    console.log('  Onde conseguir a Inscricao Estadual:');
    console.log('    1. Perguntar ao cliente (ele sabe, esta na nota dele)');
    console.log('    2. CADESP: cadesp.fazenda.sp.gov.br — consulta por CNPJ, de graca');
    console.log('');
    console.log('  Com a IE em maos:');
    console.log('    node nfe_emitir.js --pedido=ID --ie=110042490114 --enviar\n');
    process.exit(1);
  }

  // Mostra a resposta inteira: e ela que explica qualquer surpresa.
  console.log('  RESPOSTA DA SEFAZ:');
  console.log(JSON.stringify(bruto, null, 2).split('\n').slice(0, 60).map(l => '    ' + l).join('\n'));
  console.log('');

  const txt = JSON.stringify(bruto || {});
  const ie    = (txt.match(/"IE"\s*:\s*"?(\d{2,14})/) || [])[1] || '';
  const nome  = (txt.match(/"xNome"\s*:\s*"([^"]+)/) || [])[1] || '';
  const sit   = (txt.match(/"cSit"\s*:\s*"?(\d)/) || [])[1] || '';
  const cStat = (txt.match(/"cStat"\s*:\s*"?(\d+)/) || [])[1] || '';

  console.log('  RESUMO:');
  console.log('    cStat : ' + (cStat || '?') + (cStat === '111' || cStat === '112' ? '  (cadastro encontrado)' : ''));
  console.log('    Nome  : ' + (nome || '—'));
  console.log('    IE    : ' + (ie || '—'));
  console.log('    Sit.  : ' + (sit === '1' ? 'habilitado' : sit ? 'nao habilitado (' + sit + ')' : '—'));
  console.log('');

  if (!ie) {
    console.log('  Sem IE no cadastro: a nota vai como consumidor final.');
    console.log('  Se mesmo assim a SEFAZ recusar por "IE nao informada", peca');
    console.log('  a IE ao cliente e use --ie= na emissao.\n');
    process.exit(0);
  }

  if (pedidoId) {
    const orders = readData('orders.json') || [];
    const idx = orders.findIndex(o => String(o.id) === pedidoId);
    if (idx < 0) { console.log('  Pedido ' + pedidoId + ' nao encontrado.\n'); process.exit(1); }
    orders[idx].customer = Object.assign({}, orders[idx].customer, { ie });
    writeData('orders.json', orders);
    console.log('  IE gravada no pedido ' + pedidoId + '.');
    console.log('  Agora: node nfe_emitir.js --pedido=' + pedidoId + ' --enviar\n');
  } else {
    console.log('  Pra gravar no pedido:');
    console.log('    node nfe_cadastro.js --cnpj=' + cnpj + ' --pedido=SEU-PEDIDO\n');
  }
})();
