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
const { readData, writeData } = require('../db');

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

// ============================================================
// EMISSAO — monta a NF-e a partir de um pedido do site
//
// A estrutura abaixo copia a NF-e n 2/serie 1 (20/07/2026), que
// foi autorizada pela SEFAZ. Nao inventamos layout: seguimos o
// que ja passou.
// ============================================================

// Dinheiro na NF-e vai como string com 2 casas; quantidade com 4.
const v2 = n => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);
const v4 = n => (Math.round((parseFloat(n) || 0) * 10000) / 10000).toFixed(4);
const so = s => String(s == null ? '' : s).replace(/\D/g, '');

// Acentuacao quebra a validacao do schema em alguns campos; a SEFAZ
// trabalha em ASCII maiusculo pros dados cadastrais.
function limpa(s, max) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim().slice(0, max || 60);
}

// Tabela de UF -> codigo IBGE, pro campo cUF e pra saber se a venda
// e dentro ou fora do estado (muda o CFOP).
const UF_IBGE = {
  AC:12, AL:27, AP:16, AM:13, BA:29, CE:23, DF:53, ES:32, GO:52, MA:21,
  MT:51, MS:50, MG:31, PA:15, PB:25, PR:41, PE:26, PI:22, RJ:33, RN:24,
  RS:43, RO:11, RR:14, SC:42, SP:35, SE:28, TO:17,
};

// Forma de pagamento do site -> codigo da NF-e (tPag)
const T_PAG = {
  pix: '17', credit_card: '03', mercadopago: '99', whatsapp: '99',
  boleto: '15', dinheiro: '01', mercadolivre: '99',
};

function montarNFe(order, opcoes) {
  const emit = getEmitente();
  const fis  = getFiscal();
  const o    = order || {};
  const ship = o.shipping || {};
  const cli  = o.customer || {};

  const ufDest = String(ship.state || ship.uf || emit.uf).toUpperCase().slice(0, 2);
  const dentroDoEstado = ufDest === emit.uf;
  const cfop = parseInt(dentroDoEstado ? fis.cfop_dentro : fis.cfop_fora);

  // CPF ou CNPJ do destinatario — o que vier preenchido.
  let doc = so(cli.cnpj || cli.cpf || cli.documento || '');
  // A SEFAZ (e a lib) exigem documento do destinatario. Em homologacao, quando
  // o pedido nao tem CPF — caso dos pedidos importados do Mercado Livre —,
  // usamos o CNPJ da propria TopFood: documento real, sem envolver terceiro,
  // e a nota nao vale fiscalmente mesmo. Em producao isso nao acontece: o
  // nfe_emitir.js recusa o pedido antes de chegar aqui.
  if (!doc && opcoes.tpAmb === 2) doc = emit.cnpj;
  const destDoc = doc ? { CNPJCPF: doc } : {};

  // Itens. O pedido guarda nome e preco do momento da compra; o NCM e a
  // unidade vem da config fiscal, iguais pra toda a linha de embalagens.
  const itens = (o.items || []).map((it, i) => {
    const qtd = parseFloat(it.qty) || 1;
    // Pedido da loja grava "price"; pedido importado do Mercado Livre grava
    // "unit_price". Sem esse fallback a nota sai com valor zero.
    let unit = parseFloat(it.price);
    if (!unit) unit = parseFloat(it.unit_price);
    if (!unit && it.total) unit = (parseFloat(it.total) || 0) / qtd;
    unit = unit || 0;
    const total = Math.round(qtd * unit * 100) / 100;
    return {
      $: { nItem: i + 1 },
      prod: {
        cProd: limpa(it.id || it.product_id || ('ITEM' + (i + 1)), 60),
        cEAN: 'SEM', cEANTrib: 'SEM',
        xProd: limpa(it.name, 120) || 'Embalagem',
        NCM: fis.ncm,
        CFOP: cfop,
        uCom: fis.unidade, qCom: qtd, vUnCom: v4(unit), vProd: v2(total),
        uTrib: fis.unidade, qTrib: qtd, vUnTrib: v4(unit),
        indTot: 1,
      },
      imposto: {
        // Simples Nacional: CSOSN 102 (sem permissao de credito). Foi o que
        // a nota autorizada usou.
        ICMS: { ICMSSN102: { orig: fis.origem, CSOSN: parseInt(fis.csosn) } },
        PIS:    { PISOutr:    { CST: '49', vBC: 0, pPIS: 0, vPIS: 0 } },
        COFINS: { COFINSOutr: { CST: '49', vBC: 0, pCOFINS: 0, vCOFINS: 0 } },
      },
    };
  });

  if (!itens.length) throw new Error('Pedido sem itens');

  const vProd  = itens.reduce((s, d) => s + parseFloat(d.prod.vProd), 0);
  const vFrete = parseFloat(ship.price || ship.preco || 0) || 0;
  const vDesc  = parseFloat(o.discount || 0) || 0;
  const vNF    = Math.round((vProd + vFrete - vDesc) * 100) / 100;

  return {
    infNFe: {
      versao: '4.00',
      ide: {
        cUF: UF_IBGE[emit.uf] || 35,
        cNF: String(Math.floor(Math.random() * 99999999)).padStart(8, '0'),
        natOp: limpa(fis.natureza_operacao, 60),
        mod: 55,
        serie: String(fis.serie),
        nNF: opcoes.numero,
        dhEmi: opcoes.dhEmi,
        tpNF: 1,                                   // 1 = saida
        idDest: dentroDoEstado ? 1 : 2,            // 1 = mesma UF, 2 = outra UF
        cMunFG: parseInt(emit.codMunicipio),
        tpImp: 1, tpEmis: 1,
        tpAmb: opcoes.tpAmb,                       // 1 producao, 2 homologacao
        finNFe: 1,                                 // nota normal
        indFinal: doc.length === 11 ? 1 : 0,       // consumidor final se pessoa fisica
        indPres: 2,                                // operacao pela internet
        procEmi: 0, verProc: 'TopFood/1.0',
      },
      emit: {
        // A lib espera CNPJCPF e ela mesma renomeia pra CNPJ ou CPF depois
        // de validar. Mandar "CNPJ" direto da "Documento do emitente ausente".
        CNPJCPF: emit.cnpj,
        xNome: limpa(emit.nome, 60),
        xFant: limpa(emit.fantasia, 60),
        enderEmit: {
          xLgr: limpa(emit.logradouro, 60), nro: String(emit.numero),
          xBairro: limpa(emit.bairro, 60),
          cMun: parseInt(emit.codMunicipio), xMun: limpa(emit.municipio, 60),
          UF: emit.uf, CEP: emit.cep, cPais: 1058, xPais: 'BRASIL',
        },
        IE: emit.inscricao_estadual,
        CRT: emit.regime_tributario,               // 1 = Simples Nacional
      },
      dest: Object.assign({}, destDoc, {
        // Regra da SEFAZ: em homologacao a razao social do destinatario TEM
        // que ser exatamente esta frase, senao a nota e rejeitada. Serve pra
        // ninguem confundir nota de teste com nota de verdade.
        xNome: opcoes.tpAmb === 2
          ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : (limpa(cli.name, 60) || 'CONSUMIDOR'),
        enderDest: {
          xLgr: limpa(ship.address || ship.logradouro, 60) || 'NAO INFORMADO',
          nro: limpa(ship.number || ship.numero, 60) || 'S/N',
          xBairro: limpa(ship.district || ship.bairro, 60) || 'CENTRO',
          cMun: parseInt(ship.cod_municipio || opcoes.codMunicipioDest || 0) || parseInt(emit.codMunicipio),
          xMun: limpa(ship.city || ship.municipio, 60) || limpa(emit.municipio, 60),
          UF: ufDest, CEP: so(ship.cep) || emit.cep,
          cPais: 1058, xPais: 'BRASIL',
        },
        // 9 = nao contribuinte. Venda pra consumidor final e sempre 9.
        indIEDest: 9,
        email: limpa(cli.email, 60) || undefined,
      }),
      det: itens,
      total: {
        ICMSTot: {
          vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00', vFCP: '0.00',
          vBCST: '0.00', vST: '0.00', vFCPST: '0.00', vFCPSTRet: '0.00',
          vProd: v2(vProd), vFrete: v2(vFrete), vSeg: '0.00', vDesc: v2(vDesc),
          vII: '0.00', vIPI: '0.00', vIPIDevol: '0.00',
          vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00', vNF: v2(vNF),
        },
      },
      // 9 = sem frete (a nota autorizada usou isso). Com frete cobrado,
      // 0 = por conta do emitente.
      transp: {
        modFrete: vFrete > 0 ? 0 : 9,
        vol: [{ qVol: 1, esp: 'Volume', pesoL: v2(opcoes.pesoKg || 0.1), pesoB: v2(opcoes.pesoKg || 0.1) }],
      },
      pag: {
        detPag: [{ indPag: 0, tPag: T_PAG[o.payment_method] || '99', vPag: v2(vNF) }],
      },
      infAdic: {
        infCpl: limpa('Pedido ' + (o.id || '') + '. Documento emitido por ME optante pelo Simples Nacional.', 500),
      },
    },
  };
}

// Numero da proxima nota. A SEFAZ recusa numero repetido na mesma serie,
// entao o controle e nosso: o maior ja usado + 1.
function proximoNumero() {
  const orders = readData('orders.json') || [];
  let maior = 0;
  orders.forEach(o => {
    const n = parseInt(o.nfe && o.nfe.numero);
    if (n > maior) maior = n;
  });
  const s = readData('settings.json') || {};
  const guardado = parseInt((s.fiscal || {}).ultimo_numero) || 0;
  return Math.max(maior, guardado) + 1;
}

// Emite a nota de um pedido e devolve o retorno da SEFAZ.
async function emitirPedido(order, opcoes) {
  const fis = getFiscal();
  const faltam = checarConfig();
  if (faltam.length) throw new Error('Configuração incompleta: ' + faltam.join(', '));

  const numero = (opcoes && opcoes.numero) || proximoNumero();
  const nota = montarNFe(order, {
    numero,
    dhEmi: new Date().toISOString().replace(/\.\d{3}Z$/, '-03:00'),
    tpAmb: AMBIENTE[fis.ambiente],
    pesoKg: (opcoes && opcoes.pesoKg) || 0.1,
    codMunicipioDest: opcoes && opcoes.codMunicipioDest,
  });

  // Envelope do envio em lote (enviNFe). Alem da nota, a SEFAZ exige:
  //   idLote  — identificador do lote, 1 a 15 digitos (usamos o numero da nota)
  //   indSinc — 1 pede processamento sincrono, ou seja, a resposta ja vem no
  //             retorno, sem precisar consultar recibo depois
  const w = await getWizard();
  const retorno = await w.NFE_Autorizacao({
    idLote: numero,
    indSinc: 1,
    NFe: nota,
  });

  // Guarda o numero usado mesmo se a SEFAZ rejeitar: numero queimado nao
  // volta, e reaproveitar gera duplicidade.
  const s = readData('settings.json') || {};
  s.fiscal = Object.assign({}, s.fiscal, { ultimo_numero: numero });
  writeData('settings.json', s);

  return { numero, nota, retorno };
}

module.exports = {
  CERT_FILE, XML_DIR, AMBIENTE,
  getEmitente, getFiscal, checarConfig,
  getWizard, resetWizard, statusServico,
  montarNFe, proximoNumero, emitirPedido,
};
