#!/usr/bin/env node
// ============================================================
// nfe_danfe.js — gera o DANFE (PDF) de uma nota autorizada e
// mostra onde esta o XML dela.
//
//   node nfe_danfe.js --pedido=TESTE-002
//   node nfe_danfe.js --chave=35260967038607000131550010000009061453169586
//
// O DANFE e a folha que acompanha a mercadoria. O XML e o
// documento fiscal em si — e ele que vai pro contador.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs   = require('fs');
const path = require('path');
const { readData } = require('./db');
const nfe  = require('./modules/nfe_sefaz');

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const pedidoId = arg('pedido');
let chave = String(arg('chave') || '').replace(/\D/g, '');

(async () => {
  console.log('\n  ===== DANFE =====\n');

  let pedido = null;
  if (pedidoId) {
    pedido = (readData('orders.json') || []).find(o => String(o.id) === pedidoId);
    if (!pedido)        { console.log('  Pedido ' + pedidoId + ' nao encontrado.\n'); process.exit(1); }
    if (!pedido.nfe)    { console.log('  Pedido ' + pedidoId + ' nao tem nota emitida.\n'); process.exit(1); }
    chave = String(pedido.nfe.chave || '').replace(/\D/g, '');
  }

  if (chave.length !== 44) {
    console.log('  Informe o pedido ou a chave:');
    console.log('    node nfe_danfe.js --pedido=TESTE-002');
    console.log('    node nfe_danfe.js --chave=<44 digitos>\n');
    process.exit(1);
  }

  console.log('  Chave: ' + chave);
  if (pedido) console.log('  Pedido: ' + pedido.id + '  ·  nota ' + (pedido.nfe.numero || '?') +
                          ' / serie ' + (pedido.nfe.serie || '1'));
  console.log('');

  // O XML autorizado fica salvo pela propria lib (armazenarXMLAutorizacao).
  const dirs = ['autorizacao', 'retorno', 'distribuicao'].map(d => path.join(nfe.XML_DIR, d));
  let arquivoXml = null;
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const achou = fs.readdirSync(d).filter(f => f.includes(chave) && f.endsWith('.xml'));
    if (achou.length) { arquivoXml = path.join(d, achou[achou.length - 1]); break; }
  }

  if (!arquivoXml) {
    console.log('  Nao achei o XML dessa nota em ' + nfe.XML_DIR + '.');
    console.log('  Pastas conferidas: autorizacao, retorno, distribuicao.');
    console.log('');
    console.log('  Se a nota foi emitida antes de os XMLs passarem a ser salvos,');
    console.log('  da pra baixar da SEFAZ:');
    console.log('    node nfe_baixar_xml.js --chave=' + chave + '\n');
    process.exit(1);
  }

  console.log('  XML: ' + arquivoXml);
  const xml = fs.readFileSync(arquivoXml, 'utf8');

  const destino = path.join(nfe.XML_DIR, 'danfe');
  if (!fs.existsSync(destino)) fs.mkdirSync(destino, { recursive: true });
  // outputPath e o caminho do ARQUIVO (a lib faz createWriteStream nele).
  // Passar a pasta faz o PDF sumir sem erro nenhum.
  const arquivoPdf = path.join(destino, 'DANFE-' + chave + '.pdf');

  console.log('  Gerando o PDF...\n');
  try {
    const { gerarDanfe } = require('./modules/danfe_topfood');
    const r = await gerarDanfe({ xml, chave, arquivo: arquivoPdf });
    console.log('  ' + (r && r.message ? r.message : 'DANFE gerado.'));
  } catch (e) {
    console.log('  ERRO ao gerar o DANFE: ' + e.message + '\n');
    process.exit(1);
  }

  // O gerador pode criar subpasta, entao a busca desce um nivel e ignora
  // diretorios — listar so o topo dava EISDIR.
  const achados = [];
  (function varrer(dir, nivel) {
    if (nivel > 2 || !fs.existsSync(dir)) return;
    for (const nome of fs.readdirSync(dir)) {
      const completo = path.join(dir, nome);
      const st = fs.statSync(completo);
      if (st.isDirectory()) varrer(completo, nivel + 1);
      else if (nome.toLowerCase().endsWith('.pdf')) achados.push({ completo, kb: st.size / 1024, mtime: st.mtimeMs });
    }
  })(destino, 0);
  achados.sort((a, b) => a.mtime - b.mtime);

  console.log('');
  if (!achados.length) {
    console.log('  O gerador disse que criou o PDF, mas nao achei arquivo .pdf em ' + destino + '.\n');
    process.exit(1);
  }
  console.log('  PDF gerado:');
  achados.slice(-3).forEach(a => console.log('    ' + a.completo + '   (' + a.kb.toFixed(0) + ' KB)'));
  const ultimo = achados[achados.length - 1].completo;
  console.log('');
  console.log('  Pra trazer o PDF pro seu computador, rode NO WINDOWS:');
  console.log('    scp root@2.25.151.19:' + ultimo + ' .');
  console.log('');
})();
