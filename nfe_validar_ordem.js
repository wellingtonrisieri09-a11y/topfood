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
require('dotenv').config();
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

const pedidoId = (process.argv.find(a => a.startsWith('--pedido=')) || '').split('=')[1];
const orders = readData('orders.json') || [];
const pedido = pedidoId ? orders.find(o => String(o.id) === pedidoId) : orders[0];

if (!pedido) {
  console.log('\n  Informe um pedido:  node nfe_validar_ordem.js --pedido=ID\n');
  process.exit(1);
}

const i = nfe.montarNFe(pedido, {
  numero: 1, dhEmi: new Date().toISOString().replace(/\.\d{3}Z$/, '-03:00'),
  tpAmb: nfe.AMBIENTE[nfe.getFiscal().ambiente],
}).infNFe;

const blocos = {
  infNFe: i, ide: i.ide, emit: i.emit, enderEmit: i.emit.enderEmit,
  dest: i.dest, enderDest: i.dest.enderDest,
  prod: i.det[0].prod, imposto: i.det[0].imposto,
  ICMSTot: i.total.ICMSTot, transp: i.transp,
  vol: [].concat(i.transp.vol)[0], detPag: [].concat(i.pag.detPag)[0],
};

console.log('\n  ===== ordem dos campos vs schema 4.00 =====\n');
let falhas = 0;
for (const [nome, obj] of Object.entries(blocos)) {
  if (!obj) continue;
  const seq = SEQ[nome], ks = Object.keys(obj).filter(k => k !== '$');
  const fora = ks.filter(k => !seq.includes(k));
  const pos  = ks.filter(k => seq.includes(k)).map(k => seq.indexOf(k));
  const ordemOk = pos.every((v, x) => x === 0 || v > pos[x - 1]);
  if (ordemOk && !fora.length) { console.log('  ' + nome.padEnd(11) + 'ok'); continue; }
  falhas++;
  console.log('  ' + nome.padEnd(11) + 'PROBLEMA');
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

const total = falhas + formatos.length;
console.log(total ? '  ' + total + ' problema(s).\n' : '  Tudo certo — ordem e formatos.\n');
process.exit(total ? 1 : 0);
