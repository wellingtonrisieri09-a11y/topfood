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
    console.log('  Para forcar um numero:  --numero=900\n');
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
  let out;
  try {
    out = await nfe.emitirPedido(pedido, { numero });
  } catch (e) {
    console.log('  ERRO: ' + e.message + '\n');
    // Rejeicao 539: ja existe nota com esse numero/serie para o CNPJ. Pode ser
    // de outro emissor usado antes (a Focus, por exemplo). Avanca o contador
    // pra proxima tentativa nao insistir no mesmo numero.
    if (/duplicidade/i.test(e.message)) {
      nfe.reservarNumero(numero + 1, fis.ambiente);
      console.log('  O numero ' + numero + ' ja existe na SEFAZ (' + fis.ambiente + ').');
      console.log('  Pode ser nota emitida por outro sistema antes deste.');
      console.log('  Contador avancado — rode de novo que ele tenta o ' + (numero + 1) + '.\n');
    }
    process.exit(1);
  }

  const r = out.retorno || {};
  console.log('  RETORNO DA SEFAZ:');
  console.log(JSON.stringify(r, null, 2).split('\n').slice(0, 50).map(l => '    ' + l).join('\n'));
  console.log('');

  // A lib devolve formatos um pouco diferentes conforme o caminho; procuramos
  // a chave e o status onde quer que venham.
  const txt = JSON.stringify(r);
  const mChave = txt.match(/"chNFe"\s*:\s*"?(\d{44})/) || txt.match(/(\d{44})/);
  const mStat  = txt.match(/"cStat"\s*:\s*"?(\d+)/);
  const mMotivo= txt.match(/"xMotivo"\s*:\s*"([^"]+)/);
  const cStat  = mStat ? mStat[1] : '';
  const motivo = mMotivo ? mMotivo[1] : '';

  console.log('  Status: ' + (cStat || '?') + (motivo ? '  ' + motivo : ''));

  if (cStat === '100') {
    orders[idx].nfe = {
      chave: mChave ? mChave[1] : '',
      numero: String(out.numero), serie: String(fis.serie),
      status: 'autorizado', ambiente: fis.ambiente,
      emitida_em: new Date().toISOString(),
    };
    writeData('orders.json', orders);
    console.log('\n  AUTORIZADA. Registrada no pedido ' + pedido.id + '.');
    console.log('  Chave: ' + (mChave ? mChave[1] : '(ver retorno acima)'));
    if (!producao) console.log('\n  Lembre: homologacao. Esta nota NAO vale fiscalmente.');
    console.log('');
  } else {
    console.log('\n  Nao autorizada. O numero ' + out.numero + ' foi queimado —');
    console.log('  a proxima tentativa usa o seguinte, sem duplicar.\n');
  }
})();
