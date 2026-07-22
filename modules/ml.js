// ============================================================
// Mercado Livre — OAuth MULTI-CONTA + Radar de Concorrência (M12) + base M10
// TopFood Embalagens — Ecossistema v3.0
//
// .env: ML_APP_ID, ML_CLIENT_SECRET  (uma única aplicação serve p/ várias contas)
// Contas: data/ml_accounts.json  -> { [user_id]: { user_id, nickname, label,
//         access_token, refresh_token, expires_at } }
// (access 6h; refresh é de uso único e o ML devolve um novo a cada renovação — sempre salvar)
// Legado: data/ml_tokens.json (conta única) é migrado automaticamente no boot.
//
// Cada variante (pacote) guarda um anúncio POR CONTA:
//   variant.ml_items = { [account_id]: ml_item_id }
// (o campo antigo variant.ml_item_id continua sendo lido p/ compatibilidade)
// ============================================================

const fs = require('fs');
const path = require('path');
const { readData, writeData, auditLog } = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCT_FILE = path.join(DATA_DIR, 'ml_accounts.json');
const TOK_FILE = path.join(DATA_DIR, 'ml_tokens.json'); // legado (conta única)
const RADAR_FILE = path.join(DATA_DIR, 'ml_radar.json');

const APP_ID = process.env.ML_APP_ID;
const SECRET = process.env.ML_CLIENT_SECRET;
const REDIRECT_URI = 'https://topfoodembalagens.com.br/api/ml/callback';
const API = 'https://api.mercadolibre.com';

// Buscas do radar de concorrência (M12)
const RADAR_QUERIES = [
  { id: 'burger',  q: 'embalagem hamburguer delivery papel' },
  { id: 'pastel',  q: 'embalagem pastel delivery' },
  { id: 'churros', q: 'caixa churros embalagem' },
  { id: 'fritas',  q: 'embalagem batata frita delivery' }
];

function loadJSON(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function saveJSON(f, o) { fs.writeFileSync(f, JSON.stringify(o, null, 2)); }

// ------------------------------------------------------------
// Contas (multi-conta) — carregamento + migração do formato antigo
// ------------------------------------------------------------
function loadAccounts() {
  const acc = loadJSON(ACCT_FILE, null);
  if (acc && typeof acc === 'object' && !Array.isArray(acc)) return acc;
  // Migra a conta única antiga (ml_tokens.json) para o formato multi-conta
  const old = loadJSON(TOK_FILE, null);
  if (old && old.access_token) {
    const key = String(old.user_id || 'conta');
    const migrado = {
      [key]: {
        user_id: old.user_id || null,
        nickname: old.nickname || key,
        label: old.nickname || 'Conta principal',
        access_token: old.access_token,
        refresh_token: old.refresh_token,
        expires_at: old.expires_at || 0
      }
    };
    saveJSON(ACCT_FILE, migrado);
    console.log('[ML] Conta única antiga migrada para ml_accounts.json:', key);
    return migrado;
  }
  return {};
}

let accounts = loadAccounts();
function saveAccounts() { saveJSON(ACCT_FILE, accounts); }
function accountIds() { return Object.keys(accounts); }
function anyAccountId() { return accountIds()[0] || null; }
function accountLabel(id) { const a = accounts[id]; return a ? (a.label || a.nickname || id) : id; }

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------
async function oauthExchange(body) {
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body).toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`ML oauth ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data; // { access_token, refresh_token, expires_in, user_id }
}

async function fetchMe(token) {
  const r = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`users/me ${r.status}`);
  return r.json();
}

// Adiciona/atualiza uma conta a partir de um authorization_code (fluxo de "conectar conta")
async function connectAccount(code) {
  const data = await oauthExchange({
    grant_type: 'authorization_code',
    client_id: APP_ID,
    client_secret: SECRET,
    code,
    redirect_uri: REDIRECT_URI
  });
  let me = {};
  try { me = await fetchMe(data.access_token); } catch (e) { console.error('[ML] users/me:', e.message); }
  const uid = String(me.id || data.user_id || Date.now());
  const prev = accounts[uid] || {};
  accounts[uid] = {
    user_id: me.id || data.user_id || prev.user_id || null,
    nickname: me.nickname || prev.nickname || uid,
    label: prev.label || me.nickname || 'Conta',
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 300) * 1000 // 5min de folga
  };
  saveAccounts();
  console.log('[ML] Conta conectada:', uid, accounts[uid].nickname);
  return accounts[uid];
}

// Token válido de uma conta específica (renova via refresh_token se preciso)
async function getToken(accountId) {
  const a = accounts[accountId];
  if (!a) throw new Error('Conta Mercado Livre não conectada: ' + accountId);
  if (Date.now() < a.expires_at) return a.access_token;
  const data = await oauthExchange({
    grant_type: 'refresh_token',
    client_id: APP_ID,
    client_secret: SECRET,
    refresh_token: a.refresh_token
  });
  a.access_token = data.access_token;
  a.refresh_token = data.refresh_token || a.refresh_token;
  a.expires_at = Date.now() + (data.expires_in - 300) * 1000;
  saveAccounts();
  return a.access_token;
}

async function mlGet(pathUrl, accountId) {
  const t = await getToken(accountId);
  const r = await fetch(`${API}${pathUrl}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`ML GET ${pathUrl} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function mlWrite(method, pathUrl, body, accountId) {
  const t = await getToken(accountId);
  const r = await fetch(`${API}${pathUrl}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`ML ${method} ${pathUrl} → ${r.status}: ${JSON.stringify(data).slice(0, 1200)}`);
    err.mlData = data;
    throw err;
  }
  return data;
}
const mlPost = (p, b, acc) => mlWrite('POST', p, b, acc);
const mlPut  = (p, b, acc) => mlWrite('PUT', p, b, acc);

// Rotas de LEITURA pública (busca/ranking/detalhe de item) devolvem 403 pra
// apps sem o escopo específico — tenta autenticado e, se barrar, repete como
// visitante (sem credencial), que é como o site aberto do ML responde.
async function mlGetLeitura(pathUrl, accountId) {
  try { return await mlGet(pathUrl, accountId); }
  catch (e) {
    if (!/40[13]/.test(String(e.message))) throw e;
    const r = await fetch(`${API}${pathUrl}`);
    if (!r.ok) throw new Error(`ML GET público ${pathUrl} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

// ------------------------------------------------------------
// Publicar produto (M10) — cada pacote (variante) vira um anúncio, por conta
// ------------------------------------------------------------
// Atributos exigidos variam por categoria; resolve com um valor padrão
// seguro quando possível, senão devolve pro painel decidir.
async function resolveAttributes(categoryId, accountId) {
  const attrs = await mlGet(`/categories/${categoryId}/attributes`, accountId);
  const out = [];
  for (const a of attrs || []) {
    const obrigatorio = a.tags && (a.tags.required || a.tags.catalog_required);
    if (!obrigatorio) continue;
    if (a.id === 'GTIN') { out.push({ id: 'GTIN', values: [{ name: 'Não especificado' }] }); continue; }
    if (a.id === 'BRAND') { out.push({ id: 'BRAND', values: [{ name: 'TopFood Embalagens' }] }); continue; }
    if (a.id === 'MODEL') { out.push({ id: 'MODEL', values: [{ name: 'Padrão' }] }); continue; }
    if (a.id === 'ITEM_CONDITION') { out.push({ id: 'ITEM_CONDITION', values: [{ name: 'Novo' }] }); continue; }
    if (Array.isArray(a.values) && a.values.length) {
      // "Formato de venda": nunca pegar "Unidade" no automático — cada anúncio
      // nosso é um PACOTE fechado (kit) de N unidades, não venda unitária.
      // Se pegasse "Unidade", o ML passa a exigir Unidades por kit = 1 (errado).
      let escolhido = a.values[0];
      const nome = String(a.name || '').toLowerCase();
      if (nome.includes('formato') && nome.includes('venda')) {
        const kit = a.values.find(v => /kit|pacote|pack/i.test(v.name || ''));
        if (kit) escolhido = kit;
      }
      out.push({ id: a.id, values: [{ id: escolhido.id, name: escolhido.name }] });
      continue;
    }
    // Não deu pra resolver sozinho — sinaliza pro painel (usuário preenche depois no próprio ML)
  }
  return out;
}

function findProducts() { return readData('products.json') || []; }
function saveProducts(list) { writeData('products.json', list); }

// ------------------------------------------------------------
// Ficha técnica automática via IA (Claude) — lê o produto e preenche
// as características que a categoria do ML pede, sem trabalho manual.
// ------------------------------------------------------------
const fichaCache = new Map(); // productId+categoryId -> attributes (evita repetir chamadas de IA)

async function iaFichaTecnica(product, categoryId, accId, jaPreenchidos) {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const cacheKey = product.id + '|' + categoryId;
  if (fichaCache.has(cacheKey)) return fichaCache.get(cacheKey);

  const attrs = await mlGet(`/categories/${categoryId}/attributes`, accId);
  const ja = new Set((jaPreenchidos || []).map(a => a.id));
  const candidatos = (attrs || [])
    .filter(a => !ja.has(a.id) && a.tags && !a.tags.hidden && !a.tags.read_only && !a.tags.fixed && !a.tags.variation_attribute)
    .slice(0, 35)
    .map(a => ({
      id: a.id, nome: a.name, tipo: a.value_type,
      unidades: (a.allowed_units || []).slice(0, 8).map(u => u.id),
      opcoes: (a.values || []).slice(0, 15).map(v => v.name),
    }));
  if (!candidatos.length) return [];

  const info = {
    nome: product.name,
    descricao: (product.long_description || product.description || '').slice(0, 1200),
    especificacoes: product.specs || [],
    caracteristicas: product.features || [],
    peso_unitario_g: product.weight_per_unit ? product.weight_per_unit * 1000 : undefined,
  };

  const prompt = `Você preenche ficha técnica de anúncios do Mercado Livre para a TopFood Embalagens (embalagens food service de papel/kraft para delivery).

PRODUTO:
${JSON.stringify(info, null, 1)}

CARACTERÍSTICAS QUE A CATEGORIA ACEITA (id, nome, tipo, unidades permitidas, opções de lista quando houver):
${JSON.stringify(candidatos, null, 1)}

Responda SÓ com um array JSON de objetos {"id":"...","value_name":"..."} para as características que você consegue afirmar com confiança a partir do produto (material, cor, formato, uso, quantidade por pacote, medidas SE estiverem no texto etc.).
Regras: se a característica tem "opcoes", value_name DEVE ser uma delas (a mais adequada); para tipo number_unit use "número unidade" (ex.: "50 un", "13 cm"); NÃO invente medidas que não estão no texto; na dúvida, omita a característica. Máximo 20 itens. SEM texto fora do JSON.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) { console.error('[ML] IA ficha HTTP', r.status); return []; }
  const j = await r.json();
  const texto = (j.content && j.content[0] && j.content[0].text) || '[]';
  let lista = [];
  try { lista = JSON.parse((texto.match(/\[[\s\S]*\]/) || ['[]'])[0]); } catch (_) {}
  const idsValidos = new Set(candidatos.map(c => c.id));
  const out = (Array.isArray(lista) ? lista : [])
    .filter(x => x && idsValidos.has(x.id) && x.value_name && String(x.value_name).trim())
    .slice(0, 20)
    .map(x => ({ id: x.id, value_name: String(x.value_name).slice(0, 120) }));
  fichaCache.set(cacheKey, out);
  console.log(`[ML] IA ficha ${product.id}: ${out.length} características preenchidas`);
  return out;
}

// Compat: devolve o mapa { accountId: itemId } de uma variante, aceitando o formato antigo
function variantItems(variant) {
  if (variant.ml_items && typeof variant.ml_items === 'object') return variant.ml_items;
  if (variant.ml_item_id) { const a = anyAccountId(); return a ? { [a]: variant.ml_item_id } : {}; }
  return {};
}

async function suggestCategory(title) {
  const acc = anyAccountId();
  if (!acc) throw new Error('Nenhuma conta Mercado Livre conectada');
  const d = await mlGet(`/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(title)}`, acc);
  const top = Array.isArray(d) ? d[0] : null;
  return top ? { category_id: top.category_id, category_name: top.category_name } : null;
}

// Todas as fotos do produto como URLs absolutas (ML aceita até 12)
function productPictures(product) {
  const baseUrl = process.env.BASE_URL || 'https://topfoodembalagens.com.br';
  const lista = (product.images && product.images.length ? product.images : (product.image ? [product.image] : []))
    .slice(0, 12)
    .map(img => ({ source: img.startsWith('http') ? img : baseUrl + '/' + encodeURI(String(img).replace(/^\//, '')) }));
  return lista.length ? lista : undefined;
}

function productDescription(product) {
  const txt = (product.long_description || product.description || product.name || '').slice(0, 5000);
  return { plain_text: txt };
}

function buildItemPayload(product, variant, categoryId, attributes, opts) {
  opts = opts || {};
  const stock = parseInt(product.stock, 10) || 0;
  const available = variant.units ? Math.max(0, Math.floor(stock / variant.units)) : 0;
  // Essa categoria não tem opção "Kit/Pacote" em "Formato de venda" — só
  // "Unidade" existe. Quando é "Unidade", o ML EXIGE Unidades por kit = 1
  // (confirmado pelo erro real da API, 2 tentativas). A quantidade de fato
  // (50/100/250 un) já fica clara no título, descrição e preço do anúncio.
  const attrs = (attributes || []).filter(a => a.id !== 'UNITS_PER_PACK');
  attrs.push({ id: 'UNITS_PER_PACK', values: [{ name: '1' }] });
  const payload = {
    category_id: categoryId,
    price: variant.price || 0,
    currency_id: 'BRL',
    available_quantity: available,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    description: productDescription(product),
    pictures: productPictures(product),
    attributes: attrs,
  };
  // Algumas categorias exigem family_name (agrupador do produto) e, quando presente,
  // rejeitam um "title" próprio — o ML deriva o título da família nesse caso.
  if (opts.useFamilyName) payload.family_name = product.name.slice(0, 60);
  else payload.title = `${product.name} - pacote ${variant.units} un`.slice(0, 60);
  return payload;
}

// Mensagem de erro da API do ML cita esse campo entre colchetes? (ex: "[family_name]")
function errorMentionsField(err, field) {
  const raw = err && (JSON.stringify(err.mlData || {}) || err.message || '');
  return raw.includes(field);
}

// Publica (cria ou atualiza) todas as variantes de um produto NAS CONTAS ESCOLHIDAS.
// Retorna um resultado por conta, e dentro dela um resultado por variante.
async function publicarProduto(productId, targetAccounts) {
  const products = findProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return { ok: false, error: 'Produto não encontrado' };
  if (!product.ml_category_id) return { ok: false, error: 'Defina a categoria do Mercado Livre antes de publicar' };

  const targets = (Array.isArray(targetAccounts) ? targetAccounts : [])
    .map(String).filter(id => accounts[id]);
  if (!targets.length) return { ok: false, error: 'Selecione ao menos uma conta conectada para publicar' };

  const contas = [];
  for (const accId of targets) {
    let attributes = [];
    try { attributes = await resolveAttributes(product.ml_category_id, accId); }
    catch (e) {
      contas.push({ account: accId, nickname: accountLabel(accId), ok: false, error: 'Categoria inválida ou erro ao buscar atributos: ' + e.message, resultados: [] });
      continue;
    }
    // Ficha técnica automática via IA (não bloqueia a publicação se falhar)
    try {
      const extras = await iaFichaTecnica(product, product.ml_category_id, accId, attributes);
      attributes = attributes.concat(extras);
    } catch (e) { console.error('[ML] IA ficha falhou:', e.message); }

    const resultados = [];
    for (const variant of product.variants || []) {
      variant.ml_items = variant.ml_items || {};
      // Migra vínculo antigo (conta única) p/ o novo formato, atribuindo à 1ª conta conhecida
      if (variant.ml_item_id && !variant.ml_items[accId] && accId === anyAccountId()) {
        variant.ml_items[accId] = variant.ml_item_id;
      }
      try {
        let data;
        const existing = variant.ml_items[accId];
        if (existing) {
          const payload = buildItemPayload(product, variant, product.ml_category_id, attributes);
          // Atualiza (preço/estoque/fotos — ML ignora o que não muda)
          data = await mlPut(`/items/${existing}`, { price: payload.price, available_quantity: payload.available_quantity, pictures: payload.pictures }, accId);
        } else {
          try {
            data = await mlPost('/items', buildItemPayload(product, variant, product.ml_category_id, attributes, { useFamilyName: false }), accId);
          } catch (e1) {
            if (!errorMentionsField(e1, 'family_name')) throw e1;
            // Categoria exige family_name (e rejeita title junto) — tenta de novo já no formato certo
            data = await mlPost('/items', buildItemPayload(product, variant, product.ml_category_id, attributes, { useFamilyName: true }), accId);
          }
          variant.ml_items[accId] = data.id;
          // O ML capa available_quantity em 1 na CRIAÇÃO de anúncios novos — reenvia a
          // quantidade correta logo em seguida (aceito via update).
          const qtd = variant.units ? Math.max(0, Math.floor((parseInt(product.stock, 10) || 0) / variant.units)) : 0;
          if (qtd > 1 && (data.available_quantity || 0) !== qtd) {
            try { const upd = await mlPut(`/items/${data.id}`, { available_quantity: qtd }, accId); data.available_quantity = upd.available_quantity; }
            catch (e) { console.error('[ML] ajuste de quantidade em', data.id, ':', e.message); }
          }
        }
        resultados.push({ units: variant.units, ok: true, ml_item_id: variant.ml_items[accId], permalink: data.permalink || null });
      } catch (e) {
        resultados.push({ units: variant.units, ok: false, error: e.message });
      }
    }
    contas.push({ account: accId, nickname: accountLabel(accId), ok: resultados.some(r => r.ok), resultados });
  }
  saveProducts(products);
  return { ok: contas.some(c => c.ok), contas };
}

// Sincroniza o estoque disponível (site → ML) de todas as variantes publicadas, em todas as contas
async function syncStockToML(product) {
  const stock = parseInt(product.stock, 10) || 0;
  for (const variant of product.variants || []) {
    const items = variantItems(variant);
    for (const [accId, itemId] of Object.entries(items)) {
      if (!accounts[accId]) continue;
      const available = variant.units ? Math.max(0, Math.floor(stock / variant.units)) : 0;
      try { await mlPut(`/items/${itemId}`, { available_quantity: available }, accId); }
      catch (e) { console.error('[ML] erro ao sincronizar estoque de', itemId, '(conta', accId + '):', e.message); }
    }
  }
}

// Encontra a variante dona de um ml_item_id (em qualquer conta). Item id é único no ML.
function findVariantByMlItem(itemId) {
  const products = findProducts();
  for (const p of products) {
    for (const v of p.variants || []) {
      const items = variantItems(v);
      for (const [accId, id] of Object.entries(items)) {
        if (id === itemId) return { product: p, variant: v, accId, products };
      }
    }
  }
  return null;
}

// Gera ID de pedido vindo do Mercado Livre (prefixo ML- pra não colidir/confundir com TF- do site)
function generateMlOrderId(orders) {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const o of orders) {
    const m = o.id && o.id.match(/ML-\d{4}-(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return 'ML-' + year + '-' + String(maxNum + 1).padStart(3, '0');
}

// Busca o pedido completo no ML (na conta que recebeu) e cria o pedido local (idempotente)
async function processarPedidoML(mlOrderId, accountId) {
  const orders = readData('orders.json') || [];
  if (orders.some(o => o.ml_order_id === mlOrderId)) return; // webhook duplicado

  const accId = accounts[accountId] ? String(accountId) : anyAccountId();
  if (!accId) { console.error('[ML] pedido', mlOrderId, 'sem conta conectada para consultar'); return; }

  const mlOrder = await mlGet(`/orders/${mlOrderId}`, accId);
  const items = [];
  for (const oi of mlOrder.order_items || []) {
    const found = findVariantByMlItem(oi.item.id);
    items.push({
      name: oi.item.title,
      qty: oi.quantity,
      unit_price: oi.unit_price,
      total: oi.quantity * oi.unit_price,
      _product_id: found ? found.product.id : null,
      _units: found ? found.variant.units : null,
    });
  }

  const buyer = mlOrder.buyer || {};
  const newOrder = {
    id: generateMlOrderId(orders),
    ml_order_id: mlOrderId,
    ml_shipment_id: (mlOrder.shipping && mlOrder.shipping.id) || null,
    ml_account: accId,
    ml_account_nickname: accountLabel(accId),
    channel: 'mercado_livre',
    date: new Date().toISOString(),
    customer: {
      name: [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || 'Comprador Mercado Livre',
      email: buyer.email || '',
      phone: (buyer.phone && buyer.phone.number) || '',
    },
    items: items.map(({ _product_id, _units, ...rest }) => rest),
    shipping: { method: 'Mercado Envios', price: (mlOrder.shipping && mlOrder.shipping.cost) || 0 },
    subtotal: mlOrder.total_amount || 0,
    discount: 0,
    coupon_code: '',
    total: mlOrder.total_amount || 0,
    status: mlOrder.status === 'paid' ? 'paid' : 'pending',
    payment_method: 'mercado_livre',
    tracking_code: '',
    notes: '',
    utm: {},
  };
  orders.unshift(newOrder);
  writeData('orders.json', orders.slice(0, 1000));
  console.log(`🛒 [ML] Pedido importado: ${newOrder.id} (ML #${mlOrderId}, conta ${accountLabel(accId)}) | R$ ${newOrder.total}`);

  // Baixa de estoque + sincroniza disponibilidade de volta pro ML (todas as contas)
  const products = findProducts();
  const afetados = new Set();
  for (const it of items) {
    if (!it._product_id) continue;
    const p = products.find(pp => pp.id === it._product_id);
    if (!p) continue;
    p.stock = Math.max(0, (parseInt(p.stock, 10) || 0) - it.qty * (it._units || 0));
    afetados.add(p.id);
  }
  if (afetados.size) {
    saveProducts(products);
    for (const pid of afetados) { const p = products.find(pp => pp.id === pid); if (p) await syncStockToML(p); }
  }
}

// ------------------------------------------------------------
// Importação de vendas recentes (todas as contas) — usada pelo botão
// do painel E pela varredura automática de 10 em 10 minutos
// ------------------------------------------------------------
async function importarPedidosRecentes() {
  const resultado = [];
  for (const accId of accountIds()) {
    try {
      const uid = accounts[accId].user_id;
      const d = await mlGet(`/orders/search?seller=${uid}&sort=date_desc&limit=20`, accId);
      const vistos = (d.results || []).map(o => String(o.id));
      let importados = 0;
      const antes = (readData('orders.json') || []).filter(o => o.ml_order_id).map(o => String(o.ml_order_id));
      for (const mlId of vistos) {
        if (antes.includes(mlId)) continue;
        await processarPedidoML(mlId, accId);
        importados++;
      }
      resultado.push({ conta: accountLabel(accId), encontrados: vistos.length, importados });
    } catch (e) {
      resultado.push({ conta: accountLabel(accId), erro: e.message });
    }
  }
  return resultado;
}

// Varredura automática: enquanto o webhook do DevCenter não estiver salvo,
// o próprio servidor confere vendas novas a cada 10 min (mesma idempotência
// do botão — pedido já importado é pulado; sem conta conectada, não faz nada)
setInterval(() => {
  if (!accountIds().length) return;
  importarPedidosRecentes()
    .then(r => { const tot = r.reduce((s, x) => s + (x.importados || 0), 0); if (tot) console.log(`🛒 [ML] varredura automática: ${tot} pedido(s) novo(s) importado(s)`); })
    .catch(e => console.error('[ML] varredura automática:', e.message));
}, 10 * 60 * 1000);

// ------------------------------------------------------------
// Radar de concorrência (M12) — cache 12h
// ------------------------------------------------------------
async function buildRadar() {
  const acc = anyAccountId();
  if (!acc) throw new Error('Nenhuma conta Mercado Livre conectada');
  const radar = { v: 3, ts: Date.now(), buscas: [], tendencias: [], mais_vendidos: [] };

  // 1) Concorrência por segmento — segue o CATÁLOGO: uma busca por categoria
  // de produto ativo (cadastrou embalagem nova → entra no radar sozinha)
  const fixas = {
    burger: 'embalagem hamburguer delivery papel', hamburger: 'embalagem hamburguer delivery papel',
    hamburguer: 'embalagem hamburguer delivery papel',
    pastel: 'embalagem pastel delivery', churros: 'caixa churros embalagem',
    fritas: 'embalagem batata frita delivery', batata: 'embalagem batata frita delivery',
  };
  const catsProdutos = [...new Set(findProducts()
    .filter(p => p.active !== false)
    .map(p => String(p.category || '').toLowerCase().trim()).filter(Boolean))];
  const consultas = catsProdutos.slice(0, 8).map(c => ({
    id: c,
    q: fixas[c] || ('embalagem ' + c + ' delivery'),
  }));
  if (!consultas.length) consultas.push(...RADAR_QUERIES);

  // Lê a quantidade de unidades no título do anúncio ("100 un", "c/ 50", "kit 200 unidades"...)
  const qtdDoTitulo = (t) => {
    const m = String(t || '').match(/(?:c\/\s*|com\s+|kit\s+)?(\d{2,4})\s*(?:un\b|und\b|unid|unidades|p(?:e|ê)?c(?:a|as)?\b|p[cç]s?\b)/i);
    const n = m ? parseInt(m[1], 10) : 0;
    return (n >= 10 && n <= 5000) ? n : 0;
  };

  const produtosAtivos = findProducts().filter(p => p.active !== false);
  for (const item of consultas) {
    try {
      // Busca no CATÁLOGO do ML (/products/search com q=). O /sites/MLB/search é
      // bloqueado para apps não certificados, mas o catálogo responde — e traz os
      // preços de todos os vendedores que disputam cada produto.
      const d = await mlGetLeitura(`/products/search?site_id=MLB&status=active&q=${encodeURIComponent(item.q)}&limit=12`, acc);
      const candidatos = (d.results || []).filter(r => r && r.id && r.name);

      // Para cada produto do catálogo: menor preço entre os vendedores + quantidade do título
      const comQtd = [];
      for (const r of candidatos.slice(0, 8)) {
        const unidades = qtdDoTitulo(r.name);
        if (!unidades) continue;
        let precos = [], vendedores = 0;
        try {
          const itens = await mlGetLeitura(`/products/${r.id}/items`, acc);
          precos = (itens.results || []).map(x => Number(x.price)).filter(n => n > 1).sort((a, b) => a - b);
          vendedores = (itens.paging && itens.paging.total) || precos.length;
        } catch (_) { continue; }
        if (!precos.length) continue;
        comQtd.push({
          titulo: String(r.name).slice(0, 90),
          preco: precos[0],
          unidades,
          preco_un: precos[0] / unidades,
          vendedores,
          link: `https://www.mercadolivre.com.br/p/${r.id}`,
        });
      }

      const media_un = comQtd.length
        ? Math.round((comQtd.reduce((s, x) => s + x.preco_un, 0) / comQtd.length) * 100) / 100 : 0;

      const ofertas = comQtd
        .sort((a, b) => a.preco_un - b.preco_un)
        .slice(0, 5)
        .map(x => ({
          titulo: x.titulo,
          preco: x.preco,
          unidades: x.unidades,
          preco_un: Math.round(x.preco_un * 100) / 100,
          vendedores: x.vendedores,
          vendedor: x.vendedores ? x.vendedores + ' vendedor(es)' : '',
          vendidos: 0,
          frete_gratis: false,
          link: x.link,
        }));

      // Nossos pacotes desse segmento, com preço por unidade (pra comparar com a média)
      const nossos = [];
      produtosAtivos
        .filter(p => String(p.category || '').toLowerCase().trim() === item.id)
        .forEach(p => (p.variants || []).forEach(v => {
          if (v.units && v.price) nossos.push({ produto: p.name, units: v.units, preco: v.price,
            preco_un: Math.round((v.price / v.units) * 100) / 100 });
        }));

      radar.buscas.push({ id: item.id, busca: item.q, total: d.paging ? d.paging.total : 0,
        media_un, amostra: comQtd.length, ofertas, nossos });
    } catch (e) {
      radar.buscas.push({ id: item.id, busca: item.q, erro: e.message, ofertas: [] });
    }
  }

  // Categoria dos nossos produtos (todas caem em "Caixas para Alimentos" hoje)
  const cats = [...new Set(findProducts().map(p => p.ml_category_id).filter(Boolean))];
  if (!cats.length) cats.push('MLB277903');

  // 2) Tendências de busca da categoria — o que os compradores estão digitando
  for (const cat of cats.slice(0, 2)) {
    try {
      const t = await mlGet(`/trends/MLB/${cat}`, acc);
      (Array.isArray(t) ? t : []).slice(0, 15).forEach(x => {
        if (x && x.keyword && !radar.tendencias.some(k => k.termo === x.keyword))
          radar.tendencias.push({ termo: x.keyword, link: x.url || '' });
      });
    } catch (e) { console.error('[ML] trends', cat, ':', e.message); }
  }

  // 3) Mais vendidos da categoria — ranking oficial (highlights) pelo CATÁLOGO.
  // O ML bloqueia /items e /sites/search para apps não certificados, mas /products/*
  // responde normalmente: nome do produto + preços de TODOS os vendedores que o disputam.
  try {
    const h = await mlGetLeitura(`/highlights/MLB/category/${cats[0]}`, acc);
    const destaques = (h.content || []).filter(c => c.type === 'PRODUCT' && c.id).slice(0, 10);
    const lista = [];
    for (const c of destaques) {
      try {
        const [prod, itens] = await Promise.all([
          mlGetLeitura(`/products/${c.id}`, acc),
          mlGetLeitura(`/products/${c.id}/items`, acc).catch(() => ({ results: [], paging: {} })),
        ]);
        const precos = (itens.results || []).map(r => Number(r.price)).filter(n => n > 0).sort((a, b) => a - b);
        const titulo = String(prod.name || '').slice(0, 90);
        const unidades = qtdDoTitulo(titulo);
        lista.push({
          posicao: c.position || lista.length + 1,
          titulo,
          preco: precos[0] || 0,
          preco_un: (unidades && precos[0]) ? Math.round((precos[0] / unidades) * 100) / 100 : 0,
          unidades,
          vendedores: (itens.paging && itens.paging.total) || precos.length,
          link: `https://www.mercadolivre.com.br/p/${c.id}`,
        });
      } catch (e) { /* produto sem catálogo acessível — segue o baile */ }
    }
    // Só entra no ranking quem tem preço real de vendedor ativo
    radar.mais_vendidos = lista.filter(x => x.preco > 0 && x.vendedores > 0);
    if (!radar.mais_vendidos.length) radar.mais_vendidos_erro = 'nenhum produto de catálogo com vendedor ativo';
  } catch (e) { console.error('[ML] highlights:', e.message); radar.mais_vendidos_erro = e.message; }

  saveJSON(RADAR_FILE, radar);
  return radar;
}

// ------------------------------------------------------------
// Rotas
// ------------------------------------------------------------
function registerMlRoutes(app, requireAuth) {
  // URL p/ autorizar/conectar uma conta (1 clique). Para adicionar OUTRA conta,
  // esteja logado nela no navegador (ou troque a conta na tela do próprio ML).
  app.get('/api/ml/auth-url', requireAuth, (req, res) => {
    if (!APP_ID || !SECRET) return res.status(500).json({ error: 'ML_APP_ID/ML_CLIENT_SECRET ausentes no .env' });
    const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.json({ url });
  });

  // Volta do Mercado Livre com o ?code= (público — é o ML que chama). Adiciona/atualiza a conta.
  app.get('/api/ml/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      if (!code) return res.redirect('/admin.html?ml=erro');
      await connectAccount(code);
      res.redirect('/admin.html?ml=ok');
    } catch (e) {
      console.error('[ML] callback:', e.message);
      res.redirect('/admin.html?ml=erro');
    }
  });

  // Webhook de notificações (configurado no DevCenter) — responde rápido, processa depois.
  // O payload traz user_id = a conta que recebeu a notificação.
  app.post('/api/ml/webhook', (req, res) => {
    res.sendStatus(200);
    const topic = (req.body && (req.body.topic || req.body.type)) || '?';
    const resource = (req.body && req.body.resource) || '';
    const userId = req.body && req.body.user_id != null ? String(req.body.user_id) : '';
    console.log('[ML] notificação:', topic, resource, 'conta:', userId || '?');
    if (topic === 'orders_v2' || topic === 'orders') {
      const m = resource.match(/\/orders\/(\d+)/);
      if (m) processarPedidoML(m[1], userId).catch(e => console.error('[ML] erro ao processar pedido', m[1], ':', e.message));
    }
  });

  // Lista das contas conectadas (sem expor tokens)
  function contasResumo() {
    return accountIds().map(id => ({
      id,
      user_id: accounts[id].user_id,
      nickname: accounts[id].nickname,
      label: accounts[id].label || accounts[id].nickname || id,
      tokenValido: Date.now() < accounts[id].expires_at
    }));
  }

  app.get('/api/eco/ml/status', requireAuth, (req, res) => {
    res.json({
      configurado: !!(APP_ID && SECRET),
      conectado: accountIds().length > 0,
      total: accountIds().length,
      contas: contasResumo()
    });
  });

  app.get('/api/eco/ml/accounts', requireAuth, (req, res) => {
    res.json({ ok: true, contas: contasResumo() });
  });

  // Renomeia o rótulo de uma conta (só cosmético, ajuda a distinguir no painel)
  app.put('/api/eco/ml/accounts/:id', requireAuth, (req, res) => {
    const a = accounts[req.params.id];
    if (!a) return res.status(404).json({ ok: false, error: 'Conta não encontrada' });
    a.label = String(req.body?.label || '').trim() || a.nickname || req.params.id;
    saveAccounts();
    res.json({ ok: true, label: a.label });
  });

  // Desconecta uma conta do painel (NÃO apaga os anúncios já publicados no ML)
  app.delete('/api/eco/ml/accounts/:id', requireAuth, (req, res) => {
    if (!accounts[req.params.id]) return res.status(404).json({ ok: false, error: 'Conta não encontrada' });
    const nick = accounts[req.params.id].nickname;
    delete accounts[req.params.id];
    saveAccounts();
    auditLog(req.user?.id, req.user?.username, 'ml-desconectar', 'ml_accounts', req.params.id, nick, req.ip);
    res.json({ ok: true });
  });

  // Sugere a categoria do ML a partir do nome do produto (não aplica sozinho)
  app.get('/api/eco/ml/sugerir-categoria', requireAuth, async (req, res) => {
    try {
      const titulo = String(req.query.titulo || '');
      if (!titulo) return res.status(400).json({ ok: false, error: 'Informe o título' });
      const sugestao = await suggestCategory(titulo);
      res.json({ ok: true, sugestao });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Salva a categoria do ML no produto (sem publicar ainda)
  app.put('/api/eco/ml/produto/:id', requireAuth, (req, res) => {
    const products = findProducts();
    const p = products.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: 'Produto não encontrado' });
    p.ml_category_id = String(req.body?.ml_category_id || '').trim();
    saveProducts(products);
    res.json({ ok: true });
  });

  // Enriquece anúncios JÁ PUBLICADOS de um produto: ficha técnica via IA + todas as fotos + descrição completa
  app.post('/api/eco/ml/enriquecer/:id', requireAuth, async (req, res) => {
    try {
      const products = findProducts();
      const product = products.find(p => p.id === req.params.id);
      if (!product) return res.status(404).json({ ok: false, error: 'Produto não encontrado' });
      if (!product.ml_category_id) return res.status(400).json({ ok: false, error: 'Produto sem categoria ML' });

      const resultados = [];
      for (const variant of product.variants || []) {
        const items = variant.ml_items || (variant.ml_item_id ? { [anyAccountId()]: variant.ml_item_id } : {});
        for (const [accId, itemId] of Object.entries(items)) {
          if (!accounts[accId]) continue;
          try {
            const base = await resolveAttributes(product.ml_category_id, accId);
            const extras = await iaFichaTecnica(product, product.ml_category_id, accId, base);
            const attributes = base.concat(extras);
            await mlPut(`/items/${itemId}`, { attributes, pictures: productPictures(product) }, accId);
            try { await mlPut(`/items/${itemId}/description`, productDescription(product), accId); } catch (eDesc) {
              // descrição pode estar travada em itens sob revisão — não derruba o resto
              console.error('[ML] descrição', itemId, ':', eDesc.message.slice(0, 120));
            }
            resultados.push({ units: variant.units, item: itemId, ok: true, ficha: attributes.length, fotos: (productPictures(product) || []).length });
          } catch (e) {
            resultados.push({ units: variant.units, item: itemId, ok: false, error: e.message.slice(0, 200) });
          }
        }
      }
      auditLog(req.user?.id, req.user?.username, 'ml-enriquecer', 'products', req.params.id, JSON.stringify(resultados).slice(0, 500), req.ip);
      res.json({ ok: resultados.some(r => r.ok), resultados });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Publica (cria/atualiza) os anúncios do produto NAS CONTAS ESCOLHIDAS — body: { accounts: [ids] }
  app.post('/api/eco/ml/publicar/:id', requireAuth, async (req, res) => {
    try {
      let targets = req.body && req.body.accounts;
      if (!Array.isArray(targets) || !targets.length) targets = accountIds(); // sem seleção → todas
      const out = await publicarProduto(req.params.id, targets);
      auditLog(req.user?.id, req.user?.username, 'ml-publicar', 'products', req.params.id, JSON.stringify(out.contas || out.error), req.ip);
      res.json(out);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Radar M12 — cache 12h; ?force=1 atualiza na hora
  app.get('/api/eco/ml/radar', requireAuth, async (req, res) => {
    try {
      let radar = loadJSON(RADAR_FILE, null);
      if (!radar || radar.v !== 3 || req.query.force === '1' || Date.now() - radar.ts > 12 * 60 * 60 * 1000) {
        radar = await buildRadar();
      }
      res.json(radar);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Importa vendas recentes manualmente (plano B enquanto o webhook não está
  // configurado no DevCenter) — idempotente: pedido já importado é pulado
  app.post('/api/eco/ml/importar', requireAuth, async (req, res) => {
    try {
      const resultado = await importarPedidosRecentes();
      auditLog(req.user?.id, req.user?.username, 'ml-importar', 'orders', '', JSON.stringify(resultado), req.ip);
      res.json({ ok: true, resultado });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Etiqueta do Mercado Envios (PDF) — pro pedido importado do ML, direto no painel
  app.get('/api/eco/ml/etiqueta/:orderId', requireAuth, async (req, res) => {
    try {
      const orders = readData('orders.json') || [];
      const order = orders.find(o => o.id === req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });
      if (!order.ml_order_id) return res.status(400).json({ ok: false, error: 'Este pedido não veio do Mercado Livre' });

      const accId = accounts[order.ml_account] ? String(order.ml_account) : anyAccountId();
      if (!accId) return res.status(400).json({ ok: false, error: 'Nenhuma conta Mercado Livre conectada' });

      // Pedido importado antes desta função pode não ter o shipment salvo — busca no ML
      let shipmentId = order.ml_shipment_id;
      if (!shipmentId) {
        const mlOrder = await mlGet(`/orders/${order.ml_order_id}`, accId);
        shipmentId = mlOrder.shipping && mlOrder.shipping.id;
        if (shipmentId) {
          order.ml_shipment_id = shipmentId;
          writeData('orders.json', orders);
        }
      }
      if (!shipmentId) return res.status(400).json({ ok: false, error: 'Pedido ainda sem envio no Mercado Livre (etiqueta não gerada lá)' });

      const t = await getToken(accId);
      const r = await fetch(`${API}/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (!r.ok) {
        const txt = (await r.text().catch(() => '')).slice(0, 500);
        if (txt.includes('NOT_PRINTABLE_STATUS') || txt.includes('dropped_off'))
          return res.status(409).json({ ok: false, error: 'Este pacote já foi postado — o Mercado Livre não permite reimprimir etiqueta de envio que já está em trânsito.' });
        return res.status(502).json({ ok: false, error: 'Mercado Livre não liberou a etiqueta (' + r.status + '): ' + txt.slice(0, 300) });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="etiqueta-${order.id}.pdf"`);
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[ML] Rotas registradas: callback + webhook + radar + contas + etiqueta (contas conectadas=' + accountIds().length + ')');
}

module.exports = { registerMlRoutes };
