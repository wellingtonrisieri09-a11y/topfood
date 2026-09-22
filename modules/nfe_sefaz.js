// ============================================================
// NF-e direto na SEFAZ (sem intermediario pago)
//
// Substitui a Focus NFe: em vez de mandar o pedido pra API de um
// fornecedor, o proprio servidor assina o XML com o certificado
// A1 da empresa e fala com o webservice da SEFAZ, usando a
// biblioteca nfewizard-io (open source).
//
// O que e preciso pra funcionar:
//   1. Certificado digital A1 (.pfx) em data/certificado.pfx
//   2. A senha dele em NFE_CERT_SENHA no .env  (nunca no banco,
//      nunca no codigo, nunca sai pro cliente)
//   3. Os dados fiscais preenchidos no painel (IE, NCM, CFOP...)
//
// Serve tanto pra TopFood quanto pra Forpack: nada de emitente
// fica no codigo, tudo vem de settings — cada site tem o seu.
// ============================================================
const fs   = require('fs');
const path = require('path');
const { readData } = require('../db');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const CERT_FILE = process.env.NFE_CERT_PATH || path.join(DATA_DIR, 'certificado.pfx');
const XML_DIR   = path.join(DATA_DIR, 'nfe');

// Ambiente da SEFAZ: 1 = producao (vale fiscal) · 2 = homologacao (teste)
const AMBIENTE = { producao: 1, homologacao: 2 };

// Dados do emitente. Vem de settings pra mesma base servir os dois sites;
// os valores abaixo sao so o que ja estava no cadastro da TopFood.
function getEmitente() {
  const s = readData('settings.json') || {};
  const f = s.fiscal || {};
  const e = f.emitente || {};
  return {
    cnpj:       String(e.cnpj       || '67038607000131').replace(/\D/g, ''),
    nome:       e.nome       || s.store_name || 'TopFood Embalagens Ltda',
    fantasia:   e.fantasia   || s.store_name || 'TopFood Embalagens',
    logradouro: e.logradouro || 'R. Reinaldo Teixeira',
    numero:     String(e.numero || '85'),
    bairro:     e.bairro     || 'Alvarenga',
    municipio:  e.municipio  || 'São Bernardo do Campo',
    codMunicipio: String(e.cod_municipio || '3548708'),   // IBGE de SBC
    uf:         e.uf         || 'SP',
    cep:        String(e.cep || '09850720').replace(/\D/g, ''),
    inscricao_estadual: String(f.inscricao_estadual || '').replace(/\D/g, ''),
    regime_tributario:  parseInt(f.regime_tributario) || 1,  // 1 = Simples Nacional
  };
}

function getFiscal() {
  const s = readData('settings.json') || {};
  const f = s.fiscal || {};
  return {
    ambiente:    f.ambiente === 'producao' ? 'producao' : 'homologacao',
    ncm:         String(f.ncm || '').replace(/\D/g, ''),
    cest:        String(f.cest || '').replace(/\D/g, ''),
    cfop_dentro: String(f.cfop_dentro || '5102'),
    cfop_fora:   String(f.cfop_fora   || '6102'),
    csosn:       String(f.csosn || '102'),
    origem:      f.origem != null ? parseInt(f.origem) : 0,
    unidade:     f.unidade || 'UN',
    natureza_operacao: f.natureza_operacao || 'Venda de mercadoria',
    serie:       parseInt(f.serie) || 1,
    versaoDF:    f.versao_df || '4.00',
  };
}

// O que falta pra conseguir emitir. Devolve lista vazia quando esta pronto.
function checarConfig() {
  const faltam = [];
  const emit = getEmitente();
  const fis  = getFiscal();
  if (!fs.existsSync(CERT_FILE))       faltam.push('Certificado A1 em data/certificado.pfx');
  if (!process.env.NFE_CERT_SENHA)     faltam.push('NFE_CERT_SENHA no .env');
  if (!emit.inscricao_estadual)        faltam.push('Inscrição Estadual');
  if (!emit.cnpj || emit.cnpj.length !== 14) faltam.push('CNPJ do emitente');
  if (!fis.ncm || fis.ncm.length !== 8) faltam.push('NCM dos produtos (8 dígitos)');
  return faltam;
}

// Instancia da lib, criada uma vez e reaproveitada. Carregar o certificado
// custa caro, entao nao da pra fazer isso a cada nota.
let _wizard = null;
let _wizardAmbiente = null;

async function getWizard() {
  const fis = getFiscal();
  if (_wizard && _wizardAmbiente === fis.ambiente) return _wizard;

  const faltam = checarConfig();
  if (faltam.length) throw new Error('Configuração incompleta: ' + faltam.join(', '));

  const emit = getEmitente();
  const { NFeWizard } = require('nfewizard-io');
  const w = new NFeWizard();

  if (!fs.existsSync(XML_DIR)) fs.mkdirSync(XML_DIR, { recursive: true });

  await w.NFE_LoadEnvironment({
    config: {
      dfe: {
        pathCertificado:  CERT_FILE,
        senhaCertificado: process.env.NFE_CERT_SENHA,
        UF:               emit.uf,
        CPFCNPJ:          emit.cnpj,
        // Guardar os XMLs e obrigacao legal (5 anos), nao conveniencia.
        armazenarXMLAutorizacao: true,
        pathXMLAutorizacao: path.join(XML_DIR, 'autorizacao'),
        armazenarXMLRetorno: true,
        pathXMLRetorno: path.join(XML_DIR, 'retorno'),
        baixarXMLDistribuicao: true,
        pathXMLDistribuicao: path.join(XML_DIR, 'distribuicao'),
      },
      nfe: {
        ambiente:  AMBIENTE[fis.ambiente],
        versaoDF:  fis.versaoDF,
      },
      lib: {
        connection: { timeout: 30000 },
        log: { exibirLogNoConsole: false, armazenarLogs: true, pathLogs: path.join(XML_DIR, 'logs') },
        // validacao em JS: nao exige JDK instalado no servidor
        useForSchemaValidation: 'validateSchemaJsBased',
      },
    },
  });

  _wizard = w;
  _wizardAmbiente = fis.ambiente;
  return w;
}

// Derruba a instancia — usar depois de trocar certificado ou ambiente.
function resetWizard() { _wizard = null; _wizardAmbiente = null; }

// Bate na SEFAZ e ve se responde. E o teste que prova que o certificado
// esta valido e que o servidor alcanca o webservice.
async function statusServico() {
  const w = await getWizard();
  const r = await w.NFE_ConsultaStatusServico();
  return r;
}

module.exports = {
  CERT_FILE, XML_DIR, AMBIENTE,
  getEmitente, getFiscal, checarConfig,
  getWizard, resetWizard, statusServico,
};
