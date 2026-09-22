#!/usr/bin/env node
// ============================================================
// nfe_teste.js — testa a conexao com a SEFAZ.
//
//   node nfe_teste.js
//
// E o primeiro passo da emissao propria: antes de montar nota
// nenhuma, precisamos saber se o certificado A1 esta valido e
// se o servidor consegue falar com o webservice da SEFAZ.
//
// Nao emite nada. So pergunta "voces estao no ar?".
// ============================================================
require('dotenv').config();
const fs = require('fs');
const nfe = require('./modules/nfe_sefaz');

(async () => {
  console.log('\n  ===== teste de conexao com a SEFAZ =====\n');

  const emit = nfe.getEmitente();
  const fis  = nfe.getFiscal();

  console.log('  Emitente:   ' + emit.nome);
  console.log('  CNPJ:       ' + emit.cnpj);
  console.log('  IE:         ' + (emit.inscricao_estadual || '(nao preenchida)'));
  console.log('  UF:         ' + emit.uf);
  console.log('  Ambiente:   ' + fis.ambiente + (fis.ambiente === 'homologacao' ? '  (teste — nao vale fiscalmente)' : '  (PRODUCAO — vale fiscal)'));
  console.log('  Certificado:' + (fs.existsSync(nfe.CERT_FILE) ? ' encontrado' : ' NAO ENCONTRADO em ' + nfe.CERT_FILE));
  console.log('  Senha:      ' + (process.env.NFE_CERT_SENHA ? 'definida no .env' : 'NAO DEFINIDA (NFE_CERT_SENHA)'));
  console.log('');

  const faltam = nfe.checarConfig();
  if (faltam.length) {
    console.log('  FALTA PREENCHER:');
    faltam.forEach(f => console.log('    - ' + f));
    console.log('\n  Resolva os itens acima e rode de novo.\n');
    process.exit(1);
  }

  console.log('  Conectando na SEFAZ...\n');
  try {
    const r = await nfe.statusServico();
    console.log('  RESPOSTA DA SEFAZ:');
    console.log(JSON.stringify(r, null, 2).split('\n').map(l => '    ' + l).join('\n'));
    console.log('\n  Se veio cStat 107, o servico esta em operacao e o');
    console.log('  certificado foi aceito. Proximo passo: emitir em homologacao.\n');
  } catch (e) {
    console.log('  ERRO: ' + e.message + '\n');
    console.log('  Causas comuns:');
    console.log('    - senha do certificado errada');
    console.log('    - certificado vencido (A1 vale 1 ano)');
    console.log('    - arquivo nao e .pfx/.p12');
    console.log('    - servidor sem saida pra internet no webservice da SEFAZ\n');
    process.exit(1);
  }
})();
