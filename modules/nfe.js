// ============================================================
// NF-e (M11) — Emissão de Nota Fiscal eletrônica via Focus NFe
// Integra com a API homologada Focus NFe (cuida da SEFAZ por nós).
// Ambiente de homologação (teste, grátis) ou produção (vale fiscal).
// ============================================================

const axios = require('axios');

const ENDPOINTS = {
  homologacao: 'https://homologacao.focusnfe.com.br/v2/nfe',
  producao:    'https://api.focusnfe.com.br/v2/nfe'
};

// Dados fixos da empresa (emitente). Os campos fiscais variáveis
// (IE, regime, NCM, CFOP, CSOSN) vêm da config fiscal (settings → contador).
const EMITENTE_BASE = {
  cnpj: '67038607000131',
  nome: 'TopFood Embalagens Ltda',
  fantasia: 'TopFood Embalagens',
  logradouro: 'R. Reinaldo Teixeira',
  numero: '85',
  bairro: 'Alvarenga',
  municipio: 'São Bernardo do Campo',
  uf: 'SP',
  cep: '09850720'
};

function getFiscalConfig(readData) {
  const s = readData('settings.json') || {};
  const f = s.fiscal || {};
  return {
    // emitente (parte variável — contador)
    inscricao_estadual: f.inscricao_estadual || '',
    regime_tributario:  f.regime_tributario || 1,   // 1 = Simples Nacional
    // classificação fiscal padrão dos produtos (contador)
    ncm:        f.ncm || '',                          // ex: 48191000 (caixas de papel)
    cest:       f.cest || '',
    cfop_dentro: f.cfop_dentro || '5102',             // venda dentro de SP
    cfop_fora:   f.cfop_fora || '6102',               // venda para outro estado
    csosn:      f.csosn || '102',                      // Simples Nacional sem crédito
    origem:     (f.origem != null ? f.origem : 0),    // 0 = nacional
    unidade:    f.unidade || 'UN',
    natureza_operacao: f.natureza_operacao || 'Venda de mercadoria',
    // credenciais Focus NFe
    token_homologacao: f.token_homologacao || '',
    token_producao:    f.token_producao || '',
    ambiente:          f.ambiente || 'homologacao'
  };
}

// valida se há tudo que é preciso pra emitir
function checarConfig(cfg) {
  const faltam = [];
  if (!cfg.inscricao_estadual) faltam.push('Inscrição Estadual da empresa');
  if (!cfg.ncm)                faltam.push('NCM dos produtos');
  const token = cfg.ambiente === 'producao' ? cfg.token_producao : cfg.token_homologacao;
  if (!token) faltam.push('Token Focus NFe (' + cfg.ambiente + ')');
  return faltam;
}

function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

// Extrai os dados do destinatário a partir do cliente do pedido
function montarDestinatario(customer) {
  const doc = soDigitos(customer.cnpj || customer.cpf || customer.documento || customer.doc);
  const ehCNPJ = doc.length === 14;
  const ehCPF  = doc.length === 11;
  const erros = [];
  if (!ehCNPJ && !ehCPF) erros.push('CPF/CNPJ do cliente ausente ou inválido');

  const cep = soDigitos(customer.cep);
  if (cep.length !== 8)        erros.push('CEP do cliente ausente');
  if (!customer.address && !customer.logradouro) erros.push('Endereço do cliente ausente');
  if (!customer.city)          erros.push('Cidade do cliente ausente');
  if (!customer.state)         erros.push('UF do cliente ausente');

  const dest = {
    nome_destinatario: customer.name || customer.razao_social || '',
    logradouro_destinatario: customer.logradouro || customer.address || '',
    numero_destinatario: customer.numero || 'S/N',
    bairro_destinatario: customer.bairro || 'Centro',
    municipio_destinatario: customer.city || '',
    uf_destinatario: (customer.state || '').toUpperCase(),
    cep_destinatario: cep,
    pais_destinatario: 'Brasil',
    telefone_destinatario: soDigitos(customer.phone) || undefined
  };
  if (ehCNPJ) {
    dest.cnpj_destinatario = doc;
    dest.indicador_inscricao_estadual_destinatario = customer.inscricao_estadual ? 1 : 9;
    if (customer.inscricao_estadual) dest.inscricao_estadual_destinatario = soDigitos(customer.inscricao_estadual);
  } else if (ehCPF) {
    dest.cpf_destinatario = doc;
    dest.indicador_inscricao_estadual_destinatario = 9; // não contribuinte
  }
  return { dest, erros, ehCNPJ };
}

// Monta o payload completo da NF-e no formato Focus NFe (função pura, testável)
function buildNfePayload(order, cfg) {
  const customer = order.customer || {};
  const { dest, erros, ehCNPJ } = montarDestinatario(customer);

  // Regra da SEFAZ: em homologação o nome do destinatário é fixo (nota sem valor fiscal)
  if (cfg.ambiente === 'homologacao') {
    dest.nome_destinatario = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
  }

  const ufDest = dest.uf_destinatario;
  const cfop = (ufDest && ufDest !== EMITENTE_BASE.uf) ? cfop_outroEstado(cfg) : cfg.cfop_dentro;

  let valorProdutos = 0;
  const items = (order.items || []).map((it, i) => {
    const qtd  = Number(it.qty || it.quantity || 1);
    const pack = Number(it.pack || 1);
    const quantidade = qtd * pack; // unidades reais
    const totalItem = Number(it.total != null ? it.total : (it.price || 0) * qtd);
    const valorUnit = quantidade ? totalItem / quantidade : 0;
    valorProdutos += totalItem;
    return {
      numero_item: i + 1,
      codigo_produto: String(it.id || ('PROD' + (i + 1))),
      descricao: it.name || it.title || 'Embalagem food service',
      cfop: cfop,
      codigo_ncm: cfg.ncm,
      cest: cfg.cest || undefined,
      quantidade_comercial: quantidade,
      quantidade_tributavel: quantidade,
      unidade_comercial: cfg.unidade,
      unidade_tributavel: cfg.unidade,
      valor_unitario_comercial: arred(valorUnit, 4),
      valor_unitario_tributavel: arred(valorUnit, 4),
      valor_bruto: arred(totalItem),
      inclui_no_total: 1,
      icms_origem: cfg.origem,
      // Simples Nacional usa CSOSN no campo de situação tributária do ICMS
      icms_situacao_tributaria: cfg.csosn,
      pis_situacao_tributaria: '07',     // 07 = isenta (típico Simples) — contador confirma
      cofins_situacao_tributaria: '07'
    };
  });

  const frete = Number((order.shipping && order.shipping.price) || 0);
  const desconto = Number(order.discount || 0);
  const valorTotal = arred(valorProdutos + frete - desconto);

  const payload = Object.assign({
    natureza_operacao: cfg.natureza_operacao,
    // horário de Brasília (-03:00): subtrai 3h do instante UTC e marca o offset
    data_emissao: new Date(Date.now() - 3 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '-03:00'),
    tipo_documento: 1,           // 1 = saída
    finalidade_emissao: 1,       // 1 = normal
    consumidor_final: ehCNPJ ? 0 : 1,
    presenca_comprador: 2,       // 2 = internet (e-commerce)
    modalidade_frete: frete > 0 ? 0 : 9, // 0 = por conta do emitente; 9 = sem frete

    cnpj_emitente: EMITENTE_BASE.cnpj,
    nome_emitente: EMITENTE_BASE.nome,
    nome_fantasia_emitente: EMITENTE_BASE.fantasia,
    logradouro_emitente: EMITENTE_BASE.logradouro,
    numero_emitente: EMITENTE_BASE.numero,
    bairro_emitente: EMITENTE_BASE.bairro,
    municipio_emitente: EMITENTE_BASE.municipio,
    uf_emitente: EMITENTE_BASE.uf,
    cep_emitente: EMITENTE_BASE.cep,
    inscricao_estadual_emitente: cfg.inscricao_estadual,
    regime_tributario_emitente: cfg.regime_tributario,

    valor_frete: arred(frete),
    valor_seguro: 0,
    valor_desconto: arred(desconto),
    valor_outras_despesas: 0,
    valor_produtos: arred(valorProdutos),
    valor_total: valorTotal,

    items: items
  }, dest);

  return { payload, erros };
}

function cfop_outroEstado(cfg) { return cfg.cfop_fora; }
function arred(v, casas) { const p = Math.pow(10, casas || 2); return Math.round(Number(v || 0) * p) / p; }

// Chama a Focus NFe para emitir (precisa de token configurado)
async function emitirNFe(order, readData, writeData) {
  const cfg = getFiscalConfig(readData);
  const faltam = checarConfig(cfg);
  if (faltam.length) return { ok: false, erro: 'Configuração fiscal incompleta: ' + faltam.join('; ') };

  const { payload, erros } = buildNfePayload(order, cfg);
  if (erros.length) return { ok: false, erro: 'Dados do cliente incompletos: ' + erros.join('; ') };

  const token = cfg.ambiente === 'producao' ? cfg.token_producao : cfg.token_homologacao;
  const ref = 'topfood-' + (order.id || order.order_id || Date.now());
  const url = ENDPOINTS[cfg.ambiente] + '?ref=' + encodeURIComponent(ref);

  let r;
  try {
    r = await axios.post(url, payload, {
      headers: { 'content-type': 'application/json' },
      auth: { username: token, password: '' },
      timeout: 25000, maxRedirects: 0, validateStatus: () => true
    });
  } catch (e) { return { ok: false, erro: 'Falha de conexão com a Focus NFe: ' + e.message }; }
  const data = r.data || {};

  if (r.status === 201 || r.status === 202) {
    // grava a referência no pedido para consulta posterior
    if (writeData && (order.id || order.order_id)) {
      const orders = readData('orders.json') || [];
      const idx = orders.findIndex(o => (o.id || o.order_id) === (order.id || order.order_id));
      if (idx >= 0) {
        orders[idx].nfe = { ref, ambiente: cfg.ambiente, status: data.status || 'processando', criada_em: new Date().toISOString() };
        writeData('orders.json', orders);
      }
    }
    return { ok: true, ref, status: data.status || 'processando', retorno: data };
  }
  return { ok: false, erro: (data.mensagem || data.erros || 'Erro ' + r.status), status: r.status, retorno: data };
}

// Consulta o status de uma NF-e já enviada
async function consultarNFe(ref, cfg) {
  const token = cfg.ambiente === 'producao' ? cfg.token_producao : cfg.token_homologacao;
  const url = ENDPOINTS[cfg.ambiente] + '/' + encodeURIComponent(ref);
  try {
    const r = await axios.get(url, {
      auth: { username: token, password: '' },
      timeout: 20000, maxRedirects: 0, validateStatus: () => true
    });
    return r.data || {};
  } catch (e) { return { erro: e.message }; }
}

function registerNfeRoutes(app, readData, writeData, requireAuth) {
  // status da configuração fiscal (admin)
  app.get('/api/eco/nfe/config', requireAuth, (req, res) => {
    const cfg = getFiscalConfig(readData);
    const faltam = checarConfig(cfg);
    res.json({
      ambiente: cfg.ambiente,
      configurado: faltam.length === 0,
      faltam,
      // nunca devolve os tokens — só se estão preenchidos
      tem_token_homologacao: !!cfg.token_homologacao,
      tem_token_producao: !!cfg.token_producao,
      ncm: cfg.ncm, cfop_dentro: cfg.cfop_dentro, cfop_fora: cfg.cfop_fora,
      csosn: cfg.csosn, inscricao_estadual: cfg.inscricao_estadual ? '***' : ''
    });
  });

  // salvar configuração fiscal (admin) — token Focus + dados do contador
  app.post('/api/eco/nfe/config', requireAuth, (req, res) => {
    try {
      const b = req.body || {};
      const s = readData('settings.json') || {};
      const f = s.fiscal || {};
      const campos = ['inscricao_estadual', 'regime_tributario', 'ncm', 'cest',
        'cfop_dentro', 'cfop_fora', 'csosn', 'origem', 'unidade', 'natureza_operacao',
        'token_homologacao', 'token_producao', 'ambiente'];
      campos.forEach(k => { if (b[k] !== undefined && b[k] !== null && b[k] !== '') f[k] = b[k]; });
      s.fiscal = f;
      writeData('settings.json', s);
      const cfg = getFiscalConfig(readData);
      res.json({ ok: true, configurado: checarConfig(cfg).length === 0, faltam: checarConfig(cfg) });
    } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
  });

  // emitir NF-e de um pedido (admin)
  app.post('/api/eco/nfe/emitir/:orderId', requireAuth, async (req, res) => {
    try {
      const orders = readData('orders.json') || [];
      const order = orders.find(o => (o.id || o.order_id) === req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, erro: 'Pedido não encontrado' });
      const out = await emitirNFe(order, readData, writeData);
      res.json(out);
    } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
  });

  // consultar status da nota de um pedido (admin)
  app.get('/api/eco/nfe/status/:orderId', requireAuth, async (req, res) => {
    try {
      const orders = readData('orders.json') || [];
      const order = orders.find(o => (o.id || o.order_id) === req.params.orderId);
      if (!order || !order.nfe) return res.status(404).json({ ok: false, erro: 'Pedido sem NF-e emitida' });
      const data = await consultarNFe(order.nfe.ref, getFiscalConfig(readData));
      res.json({ ok: true, nfe: data });
    } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
  });

  console.log('[M11] Rotas de NF-e (Focus NFe) registradas');
}

module.exports = { getFiscalConfig, buildNfePayload, emitirNFe, consultarNFe, registerNfeRoutes };
