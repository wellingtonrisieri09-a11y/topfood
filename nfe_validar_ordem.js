#!/usr/bin/env node
// ============================================================
// nfe_validar_ordem.js — confere a ordem dos campos da NF-e e o
// formato dos numeros contra o schema 4.00, sem sair da maquina.
//
//   node nfe_validar_ordem.js --pedido=ML-2026-001
//
// No XML da NF-e a ordem das tags E parte da regra: campo certo
// na posicao errada e rejeitado igual a campo ausente. Cada
// descoberta dessas pela SEFAZ custa uma ida e volta; aqui custa
// um segundo.
// ============================================================
// Carrega o .env pelo caminho do proprio script: assim o comando funciona
// de qualquer diretorio, nao so de dentro de /var/www/topfood.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { readData } = require('./db');
const nfe = require('./modules/nfe_sefaz');

// Sequencias oficiais do layout 4.00 (campos opcionais podem faltar; os
// presentes precisam respeitar esta ordem).
const SEQ = {
  ide: ['cUF','cNF','natOp','mod','serie','nNF','dhEmi','dhSaiEnt','tpNF','idDest','cMunFG','tpImp','tpEmis','cDV','tpAmb','finNFe','indFinal','indPres','indIntermed','procEmi','verProc','dhCont','xJust'],
  emit: ['CNPJ','CPF','CNPJCPF','xNome','xFant','enderEmit','IE','IEST','IM','CNAE','CRT'],
  enderEmit: ['xLgr','nro','xCpl','xBairro','cMun','xMun','UF','CEP','cPais','xPais','fone'],
  dest: ['CNPJ','CPF','CNPJCPF','idEstrangeiro','xNome','enderDest','indIEDest','IE','ISUF','IM','email'],
  enderDest: ['xLgr','nro','xCpl','xBairro','cMun','xMun','UF','CEP','cPais','xPais','fone'],
  prod: ['cProd','cEAN','xProd','NCM','NVE','CEST','indEscala','CNPJFab','cBenef','EXTIPI','CFOP','uCom','qCom','vUnCom','vProd','cEANTrib','uTrib','qTrib','vUnTrib','vFrete','vSeg','vDesc','vOutro','indTot'],
  imposto: ['vTotTrib','ICMS','IPI','II','ISSQN','PIS','PISST','COFINS','COFINSST','ICMSUFDest'],
  ICMSTot: ['vBC','vICMS','vICMSDeson','vFCPUFDest','vICMSUFDest','vICMSUFRemet','vFCP','vBCST','vST','vFCPST','vFCPSTRet','vProd','vFrete','vSeg','vDesc','vII','vIPI','vIPIDevol','vPIS','vCOFINS','vOutro','vNF'],
  transp: ['modFrete','transporta','retTransp','veicTransp','reboque','vagao','balsa','vol'],
  vol: ['qVol','esp','marca','nVol','pesoL','pesoB','lacres'],
  detPag: ['indPag','tPag','xPag','vPag','dPag','CNPJPag','UFPag','card','vTroco','CNPJReceb','idTermPag'],
  infIntermed: ['CNPJ','idCadIntTran'],
  infNFe: ['ide','NFref','emit','avulsa','dest','autXML','retirada','entrega','det','total','transp','cobr','pag','infIntermed','infAdic','exporta','compra','cana','infRespTec'],
};


// Padroes numericos do schema. Cada casa decimal a mais ou a menos e uma
// rejeicao: peso usa 3 casas, dinheiro 2, valor unitario ate 10.
const PADRAO = {
  pesoL:    /^(0|0\.[0-9]{3}|[1-9][0-9]{0,11}(\.[0-9]{3})?)$/,
  pesoB:    /^(0|0\.[0-9]{3}|[1-9][0-9]{0,11}(\.[0-9]{3})?)$/,
  vUnCom:   /^(0|0\.[0-9]{2,10}|[1-9][0-9]{0,11}(\.[0-9]{2,10})?)$/,
  vUnTrib:  /^(0|0\.[0-9]{2,10}|[1-9][0-9]{0,11}(\.[0-9]{2,10})?)$/,
  vProd:    /^(0|0\.[0-9]{2}|[1-9][0-9]{0,12}(\.[0-9]{2})?)$/,
  vNF:      /^(0|0\.[0-9]{2}|[1-9][0-9]{0,12}(\.[0-9]{2})?)$/,
  vPag:     /^(0|0\.[0-9]{2}|[1-9][0-9]{0,12}(\.[0-9]{2})?)$/,
  cEAN:     /^(SEM GTIN|[0-9]{8}|[0-9]{12,14})?$/,
  cEANTrib: /^(SEM GTIN|[0-9]{8}|[0-9]{12,14})?$/,
  CEP:      /^[0-9]{8}$/,
  NCM:      /^([0-9]{2}|[0-9]{8})$/,
  CNPJ:     /^[0-9]{14}$/,
  CPF:      /^[0-9]{11}$/,
};

// Varre a nota inteira procurando valor que nao bate com o padrao do campo.
function conferirFormatos(obj, caminho, achados) {
  if (Array.isArray(obj)) { obj.forEach((v, i) => conferirFormatos(v, caminho + '[' + i + ']', achados)); return achados; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const cam = caminho ? caminho + '.' + k : k;
      if (PADRAO[k] && (typeof v === 'string' || typeof v === 'number')) {
        if (!PADRAO[k].test(String(v))) achados.push({ campo: cam, valor: String(v) });
      }
      conferirFormatos(v, cam, achados);
    }
  }
  return achados;
}


// ── Regras cruzadas da SEFAZ ────────────────────────────────────────────
// Campo isolado pode estar certo e a nota ser recusada porque dois campos se
// contradizem. Estas sao as regras que ja nos morderam, mais as vizinhas
// delas — conferir aqui custa um segundo; descobrir pela rejeicao custa uma
// ida e volta.
function conferirRegras(i) {
  const erros = [];
  const num = v => parseFloat(v) || 0;
  const ide = i.ide || {}, dest = i.dest || {}, emit = i.emit || {};
  const itens = [].concat(i.det || []);
  const tot = (i.total || {}).ICMSTot || {};

  // 811 — nao contribuinte obriga consumidor final
  if (dest.indIEDest === 9 && ide.indFinal !== 1)
    erros.push('indIEDest=9 (nao contribuinte) exige indFinal=1, esta ' + ide.indFinal);

  // 785 — destinatario declarado contribuinte precisa da IE
  if (dest.indIEDest === 1 && !dest.IE)
    erros.push('indIEDest=1 (contribuinte) exige a IE do destinatario');
  if (dest.indIEDest === 9 && dest.IE)
    erros.push('indIEDest=9 (nao contribuinte) nao pode levar IE');

  // NT 2020.006 — venda pela internet declara intermediador
  if (ide.indPres === 2 && ide.indIntermed === undefined)
    erros.push('indPres=2 (internet) exige indIntermed (0 = loja propria, 1 = marketplace)');
  if (ide.indIntermed === 1 && !(i.infIntermed && i.infIntermed.CNPJ && i.infIntermed.idCadIntTran))
    erros.push('indIntermed=1 exige infIntermed com CNPJ e idCadIntTran');
  if (ide.indIntermed === 0 && i.infIntermed)
    erros.push('indIntermed=0 nao pode vir com o grupo infIntermed');

  // CFOP tem que casar com o destino: 5xxx dentro do estado, 6xxx fora
  itens.forEach((d, n) => {
    const cfop = String((d.prod || {}).CFOP || '');
    if (ide.idDest === 1 && !cfop.startsWith('5'))
      erros.push('item ' + (n + 1) + ': venda dentro do estado (idDest=1) pede CFOP 5xxx, esta ' + cfop);
    if (ide.idDest === 2 && !cfop.startsWith('6'))
      erros.push('item ' + (n + 1) + ': venda para outro estado (idDest=2) pede CFOP 6xxx, esta ' + cfop);
  });

  // UF do destinatario tem que bater com o idDest
  const mesmaUF = (dest.enderDest || {}).UF === (emit.enderEmit || {}).UF;
  if (mesmaUF && ide.idDest !== 1) erros.push('destinatario na mesma UF do emitente, mas idDest=' + ide.idDest);
  if (!mesmaUF && ide.idDest !== 2) erros.push('destinatario em outra UF, mas idDest=' + ide.idDest);

  // Codigo IBGE do municipio comeca com o codigo da UF
  const UF_COD = {AC:12,AL:27,AP:16,AM:13,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MT:51,MS:50,MG:31,PA:15,PB:25,PR:41,PE:26,PI:22,RJ:33,RN:24,RS:43,RO:11,RR:14,SC:42,SP:35,SE:28,TO:17};
  [['emitente', emit.enderEmit], ['destinatario', dest.enderDest]].forEach(([quem, end]) => {
    if (!end) return;
    const esperado = UF_COD[end.UF];
    if (esperado && String(end.cMun).slice(0, 2) !== String(esperado))
      erros.push(quem + ': municipio ' + end.cMun + ' nao pertence a ' + end.UF + ' (deveria comecar com ' + esperado + ')');
  });

  // Simples Nacional usa CSOSN, nao CST
  itens.forEach((d, n) => {
    const icms = ((d.imposto || {}).ICMS) || {};
    const temCSOSN = Object.keys(icms).some(k => k.startsWith('ICMSSN'));
    if (emit.CRT === 1 && !temCSOSN)
      erros.push('item ' + (n + 1) + ': emitente no Simples (CRT=1) precisa de CSOSN (ICMSSN...), nao CST');
  });

  // Totais tem que fechar com os itens
  const somaItens = itens.reduce((a, d) => a + num((d.prod || {}).vProd), 0);
  if (Math.abs(somaItens - num(tot.vProd)) > 0.01)
    erros.push('vProd do total (' + tot.vProd + ') nao bate com a soma dos itens (' + somaItens.toFixed(2) + ')');
  const esperadoNF = num(tot.vProd) + num(tot.vFrete) + num(tot.vSeg) + num(tot.vOutro) - num(tot.vDesc);
  if (Math.abs(esperadoNF - num(tot.vNF)) > 0.01)
    erros.push('vNF (' + tot.vNF + ') nao bate com produtos + frete - desconto (' + esperadoNF.toFixed(2) + ')');

  // Cada item: quantidade x unitario = total do item
  itens.forEach((d, n) => {
    const p = d.prod || {};
    const calc = Math.round(num(p.qCom) * num(p.vUnCom) * 100) / 100;
    if (Math.abs(calc - num(p.vProd)) > 0.01)
      erros.push('item ' + (n + 1) + ': ' + p.qCom + ' x ' + p.vUnCom + ' = ' + calc.toFixed(2) + ', mas vProd esta ' + p.vProd);
  });

  // Pagamento tem que somar o total da nota
  const somaPag = [].concat((i.pag || {}).detPag || []).reduce((a, d) => a + num(d.vPag), 0);
  if (Math.abs(somaPag - num(tot.vNF)) > 0.01)
    erros.push('pagamento (' + somaPag.toFixed(2) + ') nao soma o total da nota (' + tot.vNF + ')');

  // 822 — meio de pagamento "outros" exige descricao
  [].concat((i.pag || {}).detPag || []).forEach((d, n) => {
    if (String(d.tPag) === '99' && !d.xPag)
      erros.push('pagamento ' + (n + 1) + ': tPag=99 (outros) exige xPag com a descricao');
  });

  // Destinatario sem documento e recusado
  if (!dest.CNPJCPF && !dest.CNPJ && !dest.CPF && !dest.idEstrangeiro)
    erros.push('destinatario sem CPF/CNPJ');

  // Homologacao exige a razao social fixa
  if (ide.tpAmb === 2 && dest.xNome !== 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL')
    erros.push('em homologacao o xNome do destinatario tem que ser a frase padrao da SEFAZ');

  return erros;
}

const pedidoId = (process.argv.find(a => a.startsWith('--pedido=')) || '').split('=')[1];
const orders = readData('orders.json') || [];
const pedido = pedidoId ? orders.find(o => String(o.id) === pedidoId) : orders[0];

if (!pedido) {
  console.log('\n  Informe um pedido:  node nfe_validar_ordem.js --pedido=ID\n');
  process.exit(1);
}

const i = nfe.montarNFe(pedido, {
  numero: 1, dhEmi: nfe.dhEmiAgora(),
  tpAmb: nfe.AMBIENTE[nfe.getFiscal().ambiente],
}).infNFe;

const blocos = {
  infNFe: i, ide: i.ide, emit: i.emit, enderEmit: i.emit.enderEmit,
  dest: i.dest, enderDest: i.dest.enderDest,
  prod: i.det[0].prod, imposto: i.det[0].imposto,
  ICMSTot: i.total.ICMSTot, transp: i.transp,
  vol: [].concat(i.transp.vol)[0], detPag: [].concat(i.pag.detPag)[0],
  infIntermed: i.infIntermed,
};

console.log('\n  ===== ordem dos campos vs schema 4.00 =====\n');
let falhas = 0;
for (const [nome, obj] of Object.entries(blocos)) {
  if (!obj) continue;
  const seq = SEQ[nome], ks = Object.keys(obj).filter(k => k !== '$');
  const fora = ks.filter(k => !seq.includes(k));
  const pos  = ks.filter(k => seq.includes(k)).map(k => seq.indexOf(k));
  const ordemOk = pos.every((v, x) => x === 0 || v > pos[x - 1]);
  if (ordemOk && !fora.length) { console.log("  " + nome.padEnd(13) + "ok"); continue; }
  falhas++;
  console.log('  ' + nome.padEnd(13) + 'PROBLEMA');
  if (!ordemOk) {
    console.log('      atual:    ' + ks.join(' > '));
    console.log('      esperado: ' + seq.filter(k => ks.includes(k)).join(' > '));
  }
  if (fora.length) console.log('      campo(s) fora do schema: ' + fora.join(', '));
}
console.log('');

const formatos = conferirFormatos(i, '', []);
if (formatos.length) {
  console.log('  FORMATO DE NUMERO FORA DO PADRAO:');
  formatos.forEach(f => console.log('    ' + f.campo + ' = "' + f.valor + '"'));
  console.log('');
} else {
  console.log('  Formatos numericos ok.\n');
}

const regras = conferirRegras(i);
if (regras.length) {
  console.log('  REGRAS CRUZADAS DA SEFAZ:');
  regras.forEach(r => console.log('    - ' + r));
  console.log('');
} else {
  console.log('  Regras cruzadas ok.\n');
}

const total = falhas + formatos.length + regras.length;
console.log(total ? '  ' + total + ' problema(s).\n' : '  Tudo certo — ordem, formatos e regras.\n');
process.exit(total ? 1 : 0);
