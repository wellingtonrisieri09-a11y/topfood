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

// Quem assina a nota. Vem TODO do cadastro do proprio site (settings), pra
// mesma base servir varias empresas.
//
// Aqui nao existe valor padrao de empresa nenhuma, de proposito. Um padrao
// "pra facilitar" e o que faz um site copiado de outro emitir nota com o CNPJ
// da empresa de origem — erro que ninguem percebe, porque a razao social vem
// certa e so o numero esta errado. Campo vazio tem que travar a emissao, e o
// checarConfig() abaixo e quem trava. Preencher: node nfe_emitente.js
function getEmitente() {
  const s = readData('settings.json') || {};
  const f = s.fiscal || {};
  const e = f.emitente || {};
  return {
    cnpj:       String(e.cnpj || '').replace(/\D/g, ''),
    nome:       e.nome     || '',
    fantasia:   e.fantasia || e.nome || '',
    logradouro: e.logradouro || '',
    numero:     String(e.numero || ''),
    bairro:     e.bairro    || '',
    municipio:  e.municipio || '',
    codMunicipio: String(e.cod_municipio || ''),
    uf:         String(e.uf || '').toUpperCase(),
    cep:        String(e.cep || '').replace(/\D/g, ''),
    inscricao_estadual: String(f.inscricao_estadual || '').replace(/\D/g, ''),
    regime_tributario:  parseInt(f.regime_tributario) || 1,  // 1 = Simples Nacional
    // Telefone do emitente sai impresso no DANFE. Sem ele a linha some.
    fone: String(e.fone || '').replace(/\D/g, '').replace(/^55/, ''),
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
    // Grupo card do pagamento: 2 = nao integrado (padrao seguro), 1 = integrado
    // ao sistema, e ai o CNPJ da instituicao de pagamento e obrigatorio.
    tp_integra:        String(f.tp_integra || '2'),
    cnpj_credenciadora: String(f.cnpj_credenciadora || '').replace(/\D/g, ''),
    versaoDF:    f.versao_df || '4.00',
  };
}

// O que falta pra conseguir emitir. Devolve lista vazia quando esta pronto.
function checarConfig() {
  const faltam = [];
  const emit = getEmitente();
  const fis  = getFiscal();
  // A biblioteca que fala com a SEFAZ precisa estar instalada. Ela depende de
  // Java no servidor (o xsd-schema-validator compila um auxiliar na instalacao),
  // entao um servidor sem Java instala pela metade e o erro so aparecia quando
  // alguem clicava em Emitir — depois de este diagnostico dizer que estava tudo
  // pronto.
  try { require.resolve('nfewizard-io'); }
  catch (_) { faltam.push('Biblioteca nfewizard-io (precisa de Java: apt-get install default-jdk-headless)'); }
  try { require.resolve('@nfewizard/danfe'); }
  catch (_) { faltam.push('Biblioteca @nfewizard/danfe (o DANFE em PDF depende dela)'); }
  if (!fs.existsSync(CERT_FILE))       faltam.push('Certificado A1 em data/certificado.pfx');
  if (!process.env.NFE_CERT_SENHA)     faltam.push('NFE_CERT_SENHA no .env');
  if (!emit.inscricao_estadual)        faltam.push('Inscrição Estadual');
  if (!emit.cnpj || emit.cnpj.length !== 14) faltam.push('CNPJ do emitente');
  // Endereco do emitente sai na nota e na DANFE. Faltando qualquer pedaco a
  // SEFAZ recusa — e pior que recusar seria completar com dado de outra
  // empresa, que e o que acontecia quando isto tinha valor padrao.
  if (!emit.nome)       faltam.push('Razão social do emitente');
  if (!emit.logradouro) faltam.push('Logradouro do emitente');
  if (!emit.numero)     faltam.push('Número do endereço do emitente');
  if (!emit.bairro)     faltam.push('Bairro do emitente');
  if (!emit.municipio)  faltam.push('Município do emitente');
  if (!emit.uf || emit.uf.length !== 2) faltam.push('UF do emitente');
  if (!emit.codMunicipio) faltam.push('Código IBGE do município do emitente');
  if (!emit.cep || emit.cep.length !== 8) faltam.push('CEP do emitente (8 dígitos)');
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
// Peso na NF-e usa 3 casas — o padrao do schema e '0|0\.[0-9]{3}|...', entao
// "0.10" e recusado e "0.100" passa.
const v3 = n => (Math.round((parseFloat(n) || 0) * 1000) / 1000).toFixed(3);
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

// Forma de pagamento do site -> codigo da NF-e (tPag) e, quando o codigo e
// 99 (outros), a descricao obrigatoria (xPag).
//
// As chaves sao os valores que o sistema realmente grava em payment_method —
// conferidos no codigo, nao supostos. "mercado_livre" vem com underscore; sem
// isso caia no 99 sem descricao e a SEFAZ recusava.
const T_PAG = {
  pix:           { tPag: '17' },                                  // PIX
  credit_card:   { tPag: '03' },                                  // cartao de credito
  boleto:        { tPag: '15' },                                  // boleto bancario
  dinheiro:      { tPag: '01' },
  mercadopago:   { tPag: '99', xPag: 'Mercado Pago' },
  mercado_livre: { tPag: '99', xPag: 'Mercado Pago (Mercado Livre)' },
  shopee:        { tPag: '99', xPag: 'Shopee Pay' },
  amazon:        { tPag: '99', xPag: 'Amazon Pay' },
  whatsapp:      { tPag: '99', xPag: 'A combinar pelo WhatsApp' },
};
const PAG_PADRAO = { tPag: '99', xPag: 'Outros' };

// Codigo IBGE do municipio (7 digitos), obrigatorio no endereco da NF-e.
// A tabela dos 5571 municipios vem embutida (data_municipios.json): resolver
// isso por API na hora da emissao seria transformar cada nota numa aposta na
// rede. A lib so oferece o codigo da UF, que nao basta.
let _municipios = null;
function codMunicipio(uf, cidade) {
  if (!uf || !cidade) return null;
  if (!_municipios) {
    try { _municipios = require('../data_municipios.json'); }
    catch (_) { _municipios = {}; }
  }
  const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
  return _municipios[String(uf).toUpperCase() + ':' + norm(cidade)] || null;
}

// Marketplaces conhecidos. Venda pela internet em site de terceiro exige
// declarar quem intermediou (NT 2020.006) — sem isso a SEFAZ rejeita com
// "NF-e sem indicativo do intermediador".
const INTERMEDIADORES = {
  mercado_livre: { cnpj: '03361252000134', nome: 'Mercado Livre' },
  shopee:        { cnpj: '35635824000112', nome: 'Shopee' },
};

// Descobre se o pedido veio de marketplace e qual.
function intermediadorDoPedido(o) {
  const canal = String((o && o.channel) || '').toLowerCase();
  const id    = String((o && o.id) || '');
  if (canal === 'mercado_livre' || /^ML-/i.test(id)) {
    return {
      chave: 'mercado_livre',
      cnpj: INTERMEDIADORES.mercado_livre.cnpj,
      // identificacao do vendedor no site do intermediador
      idCad: String((o && o.ml_account_nickname) || (o && o.ml_account) || 'TOPFOOD').slice(0, 60),
    };
  }
  if (canal === 'shopee' || /^SP-/i.test(id)) {
    return { chave: 'shopee', cnpj: INTERMEDIADORES.shopee.cnpj, idCad: 'TOPFOOD' };
  }
  return null;   // venda no site proprio: sem intermediador
}

// Data-hora de emissao no formato da NF-e, no fuso de Brasilia.
//
// O relogio da VPS roda em UTC. Fazer toISOString() e trocar o "Z" por
// "-03:00" NAO converte nada: rotula a hora UTC como se fosse horario de
// Brasilia e joga a emissao 3 horas pro futuro — a SEFAZ devolve
// "Data-Hora de Emissao posterior ao horario de recebimento".
//
// O Brasil nao tem mais horario de verao, entao -03:00 e fixo pra SP.
function dhEmiAgora(quando) {
  const base = quando ? new Date(quando) : new Date();
  const brasilia = new Date(base.getTime() - 3 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return brasilia.getUTCFullYear() + '-' + p(brasilia.getUTCMonth() + 1) + '-' + p(brasilia.getUTCDate()) +
         'T' + p(brasilia.getUTCHours()) + ':' + p(brasilia.getUTCMinutes()) + ':' + p(brasilia.getUTCSeconds()) +
         '-03:00';
}

// Campo opcional vazio nao pode ir pro XML: a SEFAZ valida tamanho minimo, e
// <email></email> e rejeitado com "length of 0 underruns minimum of 1". Isso
// vale pra qualquer opcional (xCpl, fone, email...), entao limpamos de uma vez
// em vez de caçar um por um.
//
// So tira undefined, null e string vazia. Zero e "0.00" ficam: sao valores
// legitimos em nota fiscal.
function limparVazios(v) {
  if (Array.isArray(v)) return v.map(limparVazios);
  if (v && typeof v === 'object') {
    const saida = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined || val === null) continue;
      if (typeof val === 'string' && val.trim() === '') continue;
      const limpo = limparVazios(val);
      if (limpo && typeof limpo === 'object' && !Array.isArray(limpo) && !Object.keys(limpo).length) continue;
      saida[k] = limpo;
    }
    return saida;
  }
  return v;
}

function montarNFe(order, opcoes) {
  const emit = getEmitente();
  const fis  = getFiscal();
  const o    = order || {};
  const ship = o.shipping || {};
  const cli  = o.customer || {};

  const inter  = intermediadorDoPedido(o);
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

  // Indicador de IE do destinatario:
  //   1 = contribuinte de ICMS (exige a IE)
  //   9 = nao contribuinte (consumidor final)
  //
  // Quando o destinatario e o proprio CNPJ da TopFood — o caso do teste em
  // homologacao —, dizer "nao contribuinte" contradiz o cadastro da SEFAZ,
  // que sabe que esse CNPJ tem IE ativa. Entao vai como contribuinte, com a
  // IE de verdade.
  const ieCliente = so(cli.ie || cli.inscricao_estadual || '');
  const destEhAEmpresa = doc === emit.cnpj;
  const contribuinte = destEhAEmpresa || !!ieCliente;
  const ieDest = destEhAEmpresa ? emit.inscricao_estadual : ieCliente;

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
        // A ordem aqui e a ordem do XML e o schema e rigido: cEANTrib vem
        // depois de vProd, nao junto do cEAN.
        //
        // Produto sem codigo de barras: o valor aceito e "SEM GTIN", com
        // espaco (NT 2016/003). O antigo "SEM" e recusado pelo padrao
        // 'SEM GTIN|[0-9]{0}|[0-9]{8}|[0-9]{12,14}'.
        cEAN: 'SEM GTIN',
        xProd: limpa(it.name, 120) || 'Embalagem',
        NCM: fis.ncm,
        CFOP: cfop,
        uCom: fis.unidade, qCom: qtd, vUnCom: v4(unit), vProd: v2(total),
        cEANTrib: 'SEM GTIN',
        uTrib: fis.unidade, qTrib: qtd, vUnTrib: v4(unit),
        // Frete e desconto do item: preenchidos no rateio logo abaixo. As
        // chaves nascem aqui, vazias, porque a posicao delas no XML e esta —
        // entre vUnTrib e indTot. Criadas depois, iriam parar no fim do
        // objeto e o schema recusaria. Vazias, o limparVazios tira.
        vFrete: undefined, vDesc: undefined,
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

  // Frete e desconto tambem vao item a item, e a SEFAZ confere centavo a
  // centavo: a soma dos vFrete dos itens tem que dar exatamente o vFrete do
  // total (rejeicao "Total do Frete difere do somatorio dos itens"), e o
  // mesmo vale pro desconto. Rateamos proporcional ao valor de cada item e
  // jogamos a sobra do arredondamento no ultimo — sem isso, um pedido de
  // tres itens fecha com um centavo a mais ou a menos e a nota e recusada.
  const ratear = (valor) => {
    if (!(valor > 0) || !(vProd > 0)) return itens.map(() => 0);
    const partes = itens.map(d =>
      Math.round(valor * (parseFloat(d.prod.vProd) / vProd) * 100) / 100);
    const soma = partes.reduce((a, b) => a + b, 0);
    const ultimo = partes.length - 1;
    partes[ultimo] = Math.round((partes[ultimo] + (valor - soma)) * 100) / 100;
    return partes;
  };
  const fretes = ratear(vFrete);
  const descs  = ratear(vDesc);
  itens.forEach((d, i) => {
    if (fretes[i] > 0) d.prod.vFrete = v2(fretes[i]);
    if (descs[i]  > 0) d.prod.vDesc  = v2(descs[i]);
  });

  // Sem "versao" e sem "Id" aqui: a lib monta infNFe como
  // { $: { versao, Id }, ...este objeto } — mandar versao junto faz virar um
  // elemento <versao> dentro do infNFe, e o schema espera <ide> primeiro.
  //
  // A ordem das chaves abaixo E a ordem do XML, e o schema exige exatamente
  // esta sequencia: ide, emit, dest, det, total, transp, pag, infAdic.
  return limparVazios({
    infNFe: {
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
        // cDV precisa existir AQUI, entre tpEmis e tpAmb, que e a posicao dele
        // no schema. A lib calcula e sobrescreve o valor; se a chave nao
        // existisse antes, ela seria criada no fim do objeto — e no XML o
        // cDV apareceria depois do verProc, fora de ordem.
        cDV: 0,
        tpAmb: opcoes.tpAmb,                       // 1 producao, 2 homologacao
        finNFe: 1,                                 // nota normal
        // Regra 811: destinatario nao contribuinte (indIEDest = 9) obriga
        // indFinal = 1. Contribuinte comprando pra revenda vai com 0.
        indFinal: contribuinte ? 0 : 1,
        indPres: 2,                                // operacao pela internet
        // 0 = sem intermediador (loja propria) · 1 = site de terceiro
        indIntermed: inter ? 1 : 0,
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
          fone: emit.fone || undefined,
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
          // Complemento (apartamento, bloco, sala) vai entre nro e xBairro,
          // que e a posicao dele no schema. Vazio nao vai: o limparVazios tira.
          xCpl: limpa(ship.complement || ship.complemento, 60) || undefined,
          xBairro: limpa(ship.district || ship.bairro, 60) || 'CENTRO',
          // Sem o codigo certo, o municipio nao pertence a UF e a SEFAZ recusa.
          // So cai no municipio do emitente quando nao ha cidade no pedido —
          // e nesse caso a UF tambem e a do emitente, entao fica coerente.
          cMun: parseInt(ship.cod_municipio || opcoes.codMunicipioDest || 0)
                || codMunicipio(ufDest, ship.city || ship.municipio)
                || parseInt(emit.codMunicipio),
          xMun: limpa(ship.city || ship.municipio, 60) || limpa(emit.municipio, 60),
          UF: ufDest, CEP: so(ship.cep) || emit.cep,
          cPais: 1058, xPais: 'BRASIL',
        },
        indIEDest: contribuinte ? 1 : 9,
        IE: contribuinte ? ieDest : undefined,
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
        vol: [{ qVol: 1, esp: 'Volume', pesoL: v3(opcoes.pesoKg || 0.1), pesoB: v3(opcoes.pesoKg || 0.1) }],
      },
      // Regra 822: tPag 99 (outros) exige xPag descrevendo o meio de pagamento.
      // Regra 391: cartao de credito (03), debito (04) e — desde a NT 2025.001,
      // em vigor em 01/09/2025 — PIX (17) exigem o grupo card.
      //   tpIntegra 1 = pagamento integrado ao sistema (exige o CNPJ da
      //                 instituicao de pagamento)
      //   tpIntegra 2 = nao integrado (PIX por chave, maquininha avulsa)
      pag: {
        detPag: [(() => {
          const base = Object.assign({ indPag: 0 }, T_PAG[o.payment_method] || PAG_PADRAO, { vPag: v2(vNF) });
          if (!['03', '04', '17'].includes(String(base.tPag))) return base;
          const tpIntegra = String(fis.tp_integra || '2');
          base.card = tpIntegra === '1'
            ? { tpIntegra: '1', CNPJ: so(fis.cnpj_credenciadora) }
            : { tpIntegra: '2' };
          return base;
        })()],
      },
      // Vem depois de pag e antes de infAdic — essa e a posicao no schema.
      infIntermed: inter ? { CNPJ: inter.cnpj, idCadIntTran: inter.idCad } : undefined,
      infAdic: {
        infCpl: limpa('Pedido ' + (o.id || '') + '. Documento emitido por ME optante pelo Simples Nacional.', 500),
      },
    },
  });
}

// Numeracao das notas.
//
// Homologacao e producao tem numeracao INDEPENDENTE na SEFAZ. Manter um
// contador so faria os testes queimarem numeros de producao — e um numero
// pulado em producao e coisa que o fisco pergunta depois.
function chaveContador(ambiente) {
  return ambiente === 'producao' ? 'ultimo_numero' : 'ultimo_numero_homologacao';
}

function proximoNumero(ambiente) {
  const amb = ambiente || getFiscal().ambiente;
  const s = readData('settings.json') || {};
  const guardado = parseInt((s.fiscal || {})[chaveContador(amb)]) || 0;

  // Em producao, as notas ja registradas nos pedidos tambem contam: e de la
  // que vem o numero 2 emitido pela Focus.
  //
  // Nota de homologacao NAO entra nessa conta. As de teste ja passaram de 900,
  // e contá-las jogaria a primeira nota real de producao pra 909 — um buraco de
  // centenas de numeros que o fisco cobra explicacao (inutilizacao). Nota
  // antiga da Focus nao tem o campo ambiente e e de producao mesmo, entao so
  // excluimos o que esta explicitamente marcado como homologacao.
  let maior = 0;
  if (amb === 'producao') {
    (readData('orders.json') || []).forEach(o => {
      const nf = o && o.nfe;
      if (!nf || nf.ambiente === 'homologacao') return;
      const n = parseInt(nf.numero);
      if (n > maior) maior = n;
    });
  }
  return Math.max(maior, guardado) + 1;
}

// Reserva o numero ANTES de enviar. Se a SEFAZ rejeitar, o numero esta
// queimado de qualquer jeito — reaproveitar da duplicidade. Antes isso ficava
// depois do envio e a excecao da rejeicao pulava a gravacao, fazendo toda
// tentativa repetir o mesmo numero.
function reservarNumero(numero, ambiente) {
  const amb = ambiente || getFiscal().ambiente;
  const s = readData('settings.json') || {};
  const f = Object.assign({}, s.fiscal);
  const atual = parseInt(f[chaveContador(amb)]) || 0;
  if (numero > atual) {
    f[chaveContador(amb)] = numero;
    s.fiscal = f;
    writeData('settings.json', s);
  }
  return numero;
}

// Pergunta pra SEFAZ se um CNPJ e contribuinte de ICMS e qual a IE dele.
//
// Sem isso so restaria adivinhar: chutar "nao contribuinte" pra quem tem IE
// da rejeicao, e chutar "contribuinte" sem ter a IE tambem. A propria SEFAZ
// responde — e a resposta dela e a que vale.
//
// Devolve { contribuinte, ie, nome, situacao } ou null se nao conseguir
// consultar (a nota segue pelo caminho normal, sem travar a venda).
async function consultarCadastro(cnpj, uf) {
  const doc = String(cnpj || '').replace(/\D/g, '');
  if (doc.length !== 14) return null;
  try {
    const w = await getWizard();
    const r = await w.NFE_ConsultaCadastro({ uf: uf || getEmitente().uf, cnpj: doc });
    const txt = JSON.stringify(r || {});
    // cStat 111 = consulta com uma ocorrencia · 112 = com mais de uma
    const ie   = (txt.match(/"IE"\s*:\s*"?(\d{2,14})/) || [])[1] || '';
    const nome = (txt.match(/"xNome"\s*:\s*"([^"]+)/) || [])[1] || '';
    const sit  = (txt.match(/"cSit"\s*:\s*"?(\d)/) || [])[1] || '';
    return { contribuinte: !!ie && sit === '1', ie, nome, situacao: sit, bruto: r };
  } catch (e) {
    return { erro: e.message };
  }
}

// Emite a nota de um pedido e devolve o retorno da SEFAZ.
async function emitirPedido(order, opcoes) {
  const fis = getFiscal();
  const faltam = checarConfig();
  if (faltam.length) throw new Error('Configuração incompleta: ' + faltam.join(', '));

  const numero = (opcoes && opcoes.numero) || proximoNumero(fis.ambiente);
  reservarNumero(numero, fis.ambiente);
  const nota = montarNFe(order, {
    numero,
    dhEmi: dhEmiAgora(),
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

  return { numero, nota, retorno };
}

// Acha o XML autorizado em disco e gera o DANFE dele. O PDF fica com o
// nome da chave, que e como as rotas do painel procuram.
async function gerarDanfeDaNota(chave) {
  const ch = String(chave || '').replace(/\D/g, '');
  if (ch.length !== 44) return null;
  let xmlFile = null;
  for (const sub of ['autorizacao', 'retorno']) {
    const d = path.join(XML_DIR, sub);
    if (!fs.existsSync(d)) continue;
    const f = fs.readdirSync(d).filter(x => x.includes(ch) && x.endsWith('.xml'));
    if (f.length) { xmlFile = path.join(d, f[f.length - 1]); break; }
  }
  if (!xmlFile) return null;
  const dir = path.join(XML_DIR, 'danfe');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, 'DANFE-' + ch + '.pdf');
  const { gerarDanfe } = require('./danfe_topfood');
  await gerarDanfe({ xml: fs.readFileSync(xmlFile, 'utf8'), chave: ch, arquivo });
  return arquivo;
}

// Dados que fazem a nota nascer errada. Em producao isso barra a emissao:
// nota errada so se conserta com cancelamento (24h) ou carta de correcao.
function conferirPedido(order, nota) {
  const c = (order && order.customer) || {};
  const problemas = [];
  if (!String(c.cnpj || c.cpf || '').replace(/\D/g, '')) problemas.push('pedido sem CPF/CNPJ do cliente');
  if (parseFloat(nota.infNFe.total.ICMSTot.vNF) <= 0) problemas.push('valor total zerado');
  if (!((order.shipping || {}).address || (order.shipping || {}).logradouro))
    problemas.push('pedido sem endereco de entrega — a nota sairia com o endereco da propria TopFood no destinatario');
  return problemas;
}

// Caminho unico da emissao: o botao do painel e o nfe_emitir.js passam os dois
// por aqui, pra nao existirem duas regras diferentes pra mesma nota.
// Nunca lanca — devolve sempre um objeto dizendo o que aconteceu.
async function emitirEGravar(pedidoId, opcoes) {
  opcoes = opcoes || {};
  const fis = getFiscal();
  const producao = fis.ambiente === 'producao';
  const base = { ambiente: fis.ambiente, serie: String(fis.serie) };

  const orders = readData('orders.json') || [];
  const idx = orders.findIndex(o => String(o.id || o.order_id) === String(pedidoId));
  if (idx < 0) return Object.assign({ ok: false, erro: 'Pedido ' + pedidoId + ' nao encontrado' }, base);
  const pedido = orders[idx];

  // CPF/CNPJ e IE do cliente informados na hora da emissao: gravam no pedido
  // pra nao precisar redigitar numa segunda tentativa. O caso comum e o
  // pedido do Mercado Livre, que chega sem documento nenhum.
  const ie  = String(opcoes.ie || '').replace(/\D/g, '');
  const doc = String(opcoes.doc || '').replace(/\D/g, '');
  if (doc && doc.length !== 11 && doc.length !== 14) {
    return Object.assign({ ok: false,
      erro: 'O documento informado tem ' + doc.length + ' digito(s). ' +
            'CPF tem 11 e CNPJ tem 14.' }, base);
  }
  if (ie || doc) {
    const novo = Object.assign({}, pedido.customer);
    if (ie) novo.ie = ie;
    if (doc.length === 11) { novo.cpf = doc; delete novo.cnpj; }
    if (doc.length === 14) { novo.cnpj = doc; delete novo.cpf; }
    pedido.customer = novo;
    orders[idx] = pedido;
    writeData('orders.json', orders);
  }

  if (pedido.nfe && pedido.nfe.status === 'autorizado') {
    return Object.assign({ ok: false, jaEmitida: true, nfe: pedido.nfe,
      erro: 'Esse pedido ja tem nota autorizada (n ' + pedido.nfe.numero +
            '). Emitir de novo criaria nota em duplicidade.' }, base);
  }

  const faltam = checarConfig();
  if (faltam.length) {
    return Object.assign({ ok: false, erro: 'Configuracao fiscal incompleta: ' + faltam.join(', ') }, base);
  }

  const numero = parseInt(opcoes.numero) || proximoNumero(fis.ambiente);
  let previa;
  try {
    previa = montarNFe(pedido, {
      numero, dhEmi: dhEmiAgora(), tpAmb: AMBIENTE[fis.ambiente],
      pesoKg: opcoes.pesoKg || 0.1, codMunicipioDest: opcoes.codMunicipioDest,
    });
  } catch (e) {
    return Object.assign({ ok: false, numero, erro: 'Nao consegui montar a nota: ' + e.message }, base);
  }

  const problemas = conferirPedido(pedido, previa);
  if (problemas.length && producao) {
    return Object.assign({ ok: false, numero, problemas,
      erro: 'Dados do pedido impedem a emissao: ' + problemas.join('; ') }, base);
  }

  let out;
  try {
    out = await emitirPedido(pedido, { numero, pesoKg: opcoes.pesoKg, codMunicipioDest: opcoes.codMunicipioDest });
  } catch (e) {
    // Rejeicao 539: ja existe nota com esse numero/serie pra este CNPJ (pode
    // ser de um emissor usado antes). Avanca o contador pra proxima tentativa
    // nao insistir no mesmo numero.
    if (/duplicidade/i.test(e.message)) {
      reservarNumero(numero + 1, fis.ambiente);
      return Object.assign({ ok: false, numero, problemas,
        erro: 'O numero ' + numero + ' ja existe na SEFAZ. Contador avancado — ' +
              'tente de novo que ele usa o ' + (numero + 1) + '.' }, base);
    }
    return Object.assign({ ok: false, numero, problemas, erro: e.message }, base);
  }

  // A lib devolve formatos um pouco diferentes conforme o caminho; procuramos
  // a chave e o status onde quer que venham.
  const txt    = JSON.stringify(out.retorno || {});
  const mChave = txt.match(/"chNFe"\s*:\s*"?(\d{44})/) || txt.match(/(\d{44})/);
  const cStat  = (txt.match(/"cStat"\s*:\s*"?(\d+)/) || [])[1] || '';
  const motivo = (txt.match(/"xMotivo"\s*:\s*"([^"]+)/) || [])[1] || '';
  const chave  = mChave ? mChave[1] : '';

  if (cStat !== '100') {
    return Object.assign({ ok: false, numero: out.numero, cStat, motivo, problemas,
      status: 'erro_autorizacao', retorno: out.retorno,
      erro: 'SEFAZ rejeitou (' + (cStat || 'sem codigo') + '): ' + (motivo || 'motivo nao informado') +
            '. O numero ' + out.numero + ' foi queimado; a proxima tentativa usa o seguinte.' }, base);
  }

  orders[idx].nfe = {
    chave, numero: String(out.numero), serie: String(fis.serie),
    status: 'autorizado', ambiente: fis.ambiente,
    emitida_em: new Date().toISOString(),
  };
  writeData('orders.json', orders);

  // O DANFE sai junto com a autorizacao. Deixar pra gerar depois e o mesmo
  // que nao ter o PDF: quando precisa, precisa agora.
  let danfe = null, avisoDanfe = '';
  try { danfe = await gerarDanfeDaNota(chave); }
  catch (e) { avisoDanfe = 'nota autorizada, mas o DANFE nao foi gerado agora: ' + e.message; }

  return Object.assign({
    ok: true, status: 'autorizado', cStat, motivo, chave,
    numero: String(out.numero), danfe, problemas, retorno: out.retorno,
    avisos: [].concat(problemas, avisoDanfe || []),
    nfe: orders[idx].nfe,
  }, base);
}

module.exports = {
  CERT_FILE, XML_DIR, AMBIENTE,
  getEmitente, getFiscal, checarConfig,
  getWizard, resetWizard, statusServico,
  montarNFe, proximoNumero, reservarNumero, emitirPedido, dhEmiAgora, codMunicipio,
  consultarCadastro, conferirPedido, gerarDanfeDaNota, emitirEGravar,
};
