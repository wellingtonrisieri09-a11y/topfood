#!/usr/bin/env node
// ============================================================
// nfe_pedido_teste.js — cria um pedido de teste com dados reais
// de cliente, pra exercitar a emissao como sera em producao.
//
//   node nfe_pedido_teste.js                   # mostra o que criaria
//   node nfe_pedido_teste.js --criar           # grava o pedido
//   node nfe_pedido_teste.js --criar --ie=...  # informa a IE do cliente
//
// Se o cliente for CNPJ e a IE nao for informada, o script pergunta
// pra SEFAZ (consulta cadastro) se ele e contribuinte. Adivinhar
// isso e rejeicao na certa: contribuinte sem IE e recusado, e nao
// contribuinte com IE tambem.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { readData, writeData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const criar = process.argv.includes('--criar');

// Dados do pedido de teste. Trocar aqui pra testar outro cliente.
const PEDIDO = {
  id: arg('id') || 'TESTE-001',
  date: new Date().toISOString(),
  customer: {
    name:  arg('nome') || 'PASTELARIA VALENTIM LTDA - ME',
    cnpj:  (arg('cnpj') || '05788238000147').replace(/\D/g, ''),
    email: arg('email') || '',
    phone: '',
  },
  shipping: {
    address:  arg('rua')    || 'AV VALENTIM MAGALHAES',
    number:   arg('numero') || '1196',
    district: arg('bairro') || 'Cond Maracana',
    city:     arg('cidade') || 'Santo Andre',
    state:    (arg('uf')    || 'SP').toUpperCase(),
    cep:      (arg('cep')   || '09120410').replace(/\D/g, ''),
    price: 0,
  },
  items: [{
    id: arg('produto') || 'pastel',
    name: arg('item') || 'Embalagem de Pastel - Pillow Box (pacote 100 un)',
    qty: parseInt(arg('qtd')) || 1,
    price: parseFloat(arg('valor')) || 70,
  }],
  subtotal: 0, discount: 0, total: 0,
  status: 'paid',
  payment_method: arg('pagamento') || 'pix',
};
PEDIDO.items[0].total = Math.round(PEDIDO.items[0].qty * PEDIDO.items[0].price * 100) / 100;
PEDIDO.subtotal = PEDIDO.total = PEDIDO.items[0].total;

(async () => {
  console.log('\n  ===== pedido de teste =====\n');
  console.log('  Pedido:   ' + PEDIDO.id);
  console.log('  Cliente:  ' + PEDIDO.customer.name);
  console.log('  CNPJ:     ' + PEDIDO.customer.cnpj);
  console.log('  Endereco: ' + PEDIDO.shipping.address + ', ' + PEDIDO.shipping.number +
              ' - ' + PEDIDO.shipping.district);
  console.log('            ' + PEDIDO.shipping.city + '/' + PEDIDO.shipping.state +
              '  CEP ' + PEDIDO.shipping.cep);

  const cod = nfe.codMunicipio(PEDIDO.shipping.state, PEDIDO.shipping.city);
  console.log('  IBGE:     ' + (cod || '*** municipio nao encontrado na tabela ***'));
  console.log('  Item:     ' + PEDIDO.items[0].qty + ' x ' + PEDIDO.items[0].name);
  console.log('  Total:    R$ ' + PEDIDO.total.toFixed(2));
  console.log('  Pagto:    ' + PEDIDO.payment_method);
  console.log('');

  if (!cod) {
    console.log('  Sem o codigo IBGE a SEFAZ recusa (municipio nao pertence a UF).');
    console.log('  Confira a grafia da cidade.\n');
    process.exit(1);
  }

  // IE: informada na linha de comando, ou perguntada pra SEFAZ.
  let ie = (arg('ie') || '').replace(/\D/g, '');
  if (ie) {
    console.log('  IE informada: ' + ie + '  -> destinatario contribuinte\n');
  } else {
    console.log('  IE nao informada. Consultando o cadastro na SEFAZ...');
    const c = await nfe.consultarCadastro(PEDIDO.customer.cnpj, PEDIDO.shipping.state);
    if (!c || c.erro) {
      console.log('  Nao deu pra consultar' + (c && c.erro ? ': ' + c.erro : '') + '.');
      console.log('  Sem a IE, a nota vai como consumidor final (nao contribuinte).');
      console.log('  Se esse cliente tiver IE, a SEFAZ vai recusar — nesse caso rode');
      console.log('  de novo com --ie=NUMERO.\n');
    } else if (c.contribuinte) {
      ie = c.ie;
      console.log('  SEFAZ: contribuinte ativo' + (c.nome ? ' (' + c.nome + ')' : ''));
      console.log('  IE: ' + ie + '\n');
    } else {
      console.log('  SEFAZ: nao consta como contribuinte ativo' +
                  (c.situacao ? ' (situacao ' + c.situacao + ')' : ''));
      console.log('  A nota vai como consumidor final.\n');
    }
  }
  if (ie) PEDIDO.customer.ie = ie;

  if (!criar) {
    console.log('  Previa — nada foi gravado. Para criar o pedido:');
    console.log('    node nfe_pedido_teste.js --criar' + (ie ? ' --ie=' + ie : '') + '\n');
    process.exit(0);
  }

  const orders = readData('orders.json') || [];
  if (orders.some(o => String(o.id) === PEDIDO.id)) {
    console.log('  Ja existe um pedido ' + PEDIDO.id + '. Use --id=OUTRO.\n');
    process.exit(1);
  }
  orders.unshift(PEDIDO);
  writeData('orders.json', orders);
  console.log('  Pedido ' + PEDIDO.id + ' criado.');
  console.log('\n  Proximo passo:');
  console.log('    node nfe_emitir.js --pedido=' + PEDIDO.id + '\n');
})();
