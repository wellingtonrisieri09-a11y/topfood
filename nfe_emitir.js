#!/usr/bin/env node
// ============================================================
// nfe_emitir.js — emite a NF-e de um pedido, direto na SEFAZ.
//
//   node nfe_emitir.js --pedido=ML-2026-001           # monta e mostra, NAO envia
//   node nfe_emitir.js --pedido=ML-2026-001 --enviar  # envia de verdade
//
// Comece SEMPRE em homologacao (ambiente de teste). Nota errada
// em producao exige carta de correcao ou cancelamento, e
// cancelamento tem prazo de 24 horas.
// ============================================================
// Carrega o .env pelo caminho do proprio script: assim o comando funciona
// de qualquer diretorio, nao so de dentro de /var/www/topfood.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { readData, writeData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

const cli = p => (p && p.customer) || {};
const so  = v => String(v == null ? '' : v).replace(/\D/g, '');

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const pedidoId = arg('pedido');
const enviar   = process.argv.includes('--enviar');
const numeroForcado = parseInt(arg('numero')) || 0;
// IE do cliente informada na hora: evita ter que editar o pedido so pra isso.
const ieArg = arg('ie');
const ieInformada = String(ieArg || '').replace(/\D/g, '');
// Passar --ie=NUMERO (o exemplo literal) resultaria em IE vazia e a nota
// seguiria como nao contribuinte, silenciosamente. Melhor parar e dizer.
if (ieArg !== undefined && !ieInformada) {
  console.log('\n  --ie=' + ieArg + ' nao tem digito nenhum.');
  console.log('  Informe a Inscricao Estadual de verdade, por exemplo:');
  console.log('    --ie=110042490114\n');
  process.exit(1);
}

(async () => {
  console.log('\n  ===== emissao de NF-e =====\n');

  // Versao do codigo em execucao. Sem isso nao da pra distinguir "a correcao
  // nao funcionou" de "a correcao ainda nao subiu".
  try {
    const { execSync } = require('child_process');
    const v = execSync('git log -1 --format="%h %s"', { cwd: __dirname }).toString().trim();
    console.log('  Versao:   ' + v.slice(0, 70));
  } catch (_) {}

  const fis = nfe.getFiscal();
  const producao = fis.ambiente === 'producao';
  console.log('  Ambiente: ' + fis.ambiente + (producao ? '   *** PRODUCAO — A NOTA VALE FISCALMENTE ***' : '   (teste — nao vale fiscalmente)'));

  if (!pedidoId) {
    console.log('\n  Informe o pedido:  node nfe_emitir.js --pedido=ML-2026-001');
    console.log('  Para forcar um numero:  --numero=900');
    console.log('  Para informar a IE do cliente:  --ie=110042490114\n');
    const comNota = (readData('orders.json') || []).filter(o => !o.nfe).slice(0, 10);
    if (comNota.length) {
      console.log('  Pedidos sem nota emitida:');
      comNota.forEach(o => console.log('    ' + String(o.id).padEnd(16) + 'R$ ' + o.total + '  ' + (o.customer && o.customer.name || '')));
      console.log('');
    }
    process.exit(1);
  }

  const orders = readData('orders.json') || [];
  const idx = orders.findIndex(o => String(o.id) === pedidoId);
  if (idx < 0) { console.log('\n  Pedido ' + pedidoId + ' nao encontrado.\n'); process.exit(1); }
  const pedido = orders[idx];
  if (ieInformada) {
    pedido.customer = Object.assign({}, pedido.customer, { ie: ieInformada });
    orders[idx] = pedido;
    writeData('orders.json', orders);
    console.log('  IE do cliente informada e gravada no pedido: ' + ieInformada);
  }

  if (pedido.nfe && pedido.nfe.status === 'autorizado') {
    console.log('\n  Esse pedido JA tem nota autorizada (n ' + pedido.nfe.numero + ', chave ' + pedido.nfe.chave + ').');
    console.log('  Emitir de novo criaria nota em duplicidade. Parei.\n');
    process.exit(1);
  }

  const numero = numeroForcado || nfe.proximoNumero(fis.ambiente);
  console.log('  Pedido:   ' + pedido.id + '  ·  R$ ' + pedido.total + '  ·  ' + ((pedido.customer || {}).name || ''));
  console.log('  Nota:     n ' + numero + ' / serie ' + fis.serie + '\n');

  // Sempre mostra o que vai ser enviado. Conferir antes e mais barato
  // que cancelar depois.
  const previa = nfe.montarNFe(pedido, {
    numero, dhEmi: nfe.dhEmiAgora(),
    tpAmb: nfe.AMBIENTE[fis.ambiente], pesoKg: 0.1,
  });
  const i = previa.infNFe;
  console.log('  Natureza: ' + i.ide.natOp);
  console.log('  Emitente: ' + i.emit.xNome + '  IE ' + i.emit.IE);
  const docDest = i.dest.CNPJCPF || i.dest.CNPJ || i.dest.CPF || '';
  console.log('  Destino:  ' + i.dest.xNome + '  ' +
    (docDest ? (docDest.length === 14 ? 'CNPJ ' : 'CPF ') + docDest : '(sem documento)'));
  console.log('            ' + i.dest.enderDest.xMun + '/' + i.dest.enderDest.UF + '  CEP ' + i.dest.enderDest.CEP);
  console.log('            ' + (i.dest.indIEDest === 1
    ? 'contribuinte de ICMS · IE ' + (i.dest.IE || '(faltando)')
    : 'nao contribuinte · consumidor final'));
  console.log('  Itens:');
  [].concat(i.det).forEach(d => console.log('    ' + d.prod.qCom + ' x ' + d.prod.xProd +
    '   NCM ' + d.prod.NCM + '  CFOP ' + d.prod.CFOP + '  CSOSN ' + d.imposto.ICMS.ICMSSN102.CSOSN +
    '   R$ ' + d.prod.vProd));
  console.log('  Total:    R$ ' + i.total.ICMSTot.vNF + '  (frete R$ ' + i.total.ICMSTot.vFrete + ')');
  console.log('');

  // Problemas que fazem a nota nascer errada. Em homologacao so avisamos (o
  // objetivo ali e exercitar o fluxo); em producao paramos, porque nota com
  // dado errado custa cancelamento em 24h ou carta de correcao.
  const problemas = [];
  if (!so(cli(pedido).cnpj || cli(pedido).cpf)) problemas.push('pedido sem CPF/CNPJ do cliente');
  if (parseFloat(i.total.ICMSTot.vNF) <= 0) problemas.push('valor total zerado');
  const semEndereco = !((pedido.shipping || {}).address || (pedido.shipping || {}).logradouro);
  if (semEndereco) problemas.push('pedido sem endereco de entrega — a nota sairia com o endereco da propria TopFood no destinatario');

  if (problemas.length) {
    console.log('  PROBLEMAS NOS DADOS:');
    problemas.forEach(p => console.log('    - ' + p));
    console.log('');
    if (producao) {
      console.log('  PAREI. Em producao a nota vale fiscalmente e corrigir depois');
      console.log('  exige cancelamento (prazo de 24h) ou carta de correcao.\n');
      process.exit(1);
    }
    console.log('  Como e homologacao, da pra seguir so pra testar o fluxo.\n');
  }

  if (!enviar) {
    console.log('  Previa — NADA foi enviado. Para emitir de verdade:');
    console.log('    node nfe_emitir.js --pedido=' + pedidoId + ' --enviar\n');
    process.exit(0);
  }

  const faltam = nfe.checarConfig();
  if (faltam.length) {
    console.log('  FALTA PREENCHER PRA ENVIAR:');
    faltam.forEach(f => console.log('    - ' + f));
    console.log('');
    process.exit(1);
  }

  console.log('  Enviando para a SEFAZ...\n');

  // Daqui pra frente e o mesmo caminho do botao do painel: envio, leitura do
  // retorno, gravacao no pedido e DANFE. Uma regra so pros dois.
  const out = await nfe.emitirEGravar(pedidoId, { numero, ie: ieInformada });

  if (out.retorno) {
    console.log('  RETORNO DA SEFAZ:');
    console.log(JSON.stringify(out.retorno, null, 2).split('\n').slice(0, 50).map(l => '    ' + l).join('\n'));
    console.log('');
  }

  if (!out.ok) {
    console.log('  NAO EMITIDA: ' + out.erro + '\n');
    process.exit(1);
  }

  console.log('  Status: ' + out.cStat + (out.motivo ? '  ' + out.motivo : ''));
  console.log('\n  AUTORIZADA. Registrada no pedido ' + pedidoId + '.');
  if (out.danfe) console.log('  DANFE: ' + out.danfe);
  else console.log('  (DANFE nao saiu agora — gere com: node nfe_danfe.js --pedido=' + pedidoId + ')');
  console.log('  Chave: ' + (out.chave || '(ver retorno acima)'));
  if (!producao) console.log('\n  Lembre: homologacao. Esta nota NAO vale fiscalmente.');
  console.log('');
})();
