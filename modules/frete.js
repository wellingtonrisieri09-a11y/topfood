// ============================================================
// Frete + Orçamento — mesma lógica do site (app.js), no servidor
// Para a IA Atendente montar orçamento (produtos + frete por CEP)
// e gerar link de checkout pré-preenchido.
// ============================================================

const SITE = 'https://topfoodembalagens.com.br';

// Tabela de frete por estado (espelho do app.js)
const FRETE_TABLE = {
  'SP':[{nome:'PAC',dias:'3–5 dias úteis',preco:18.90},{nome:'SEDEX',dias:'1–2 dias úteis',preco:32.90}],
  'RJ':[{nome:'PAC',dias:'4–6 dias úteis',preco:25.90},{nome:'SEDEX',dias:'2–3 dias úteis',preco:42.90}],
  'MG':[{nome:'PAC',dias:'4–7 dias úteis',preco:27.90},{nome:'SEDEX',dias:'2–3 dias úteis',preco:44.90}],
  'ES':[{nome:'PAC',dias:'5–7 dias úteis',preco:29.90},{nome:'SEDEX',dias:'3–4 dias úteis',preco:46.90}],
  'PR':[{nome:'PAC',dias:'4–7 dias úteis',preco:30.90},{nome:'SEDEX',dias:'2–3 dias úteis',preco:48.90}],
  'SC':[{nome:'PAC',dias:'5–8 dias úteis',preco:33.90},{nome:'SEDEX',dias:'3–4 dias úteis',preco:52.90}],
  'RS':[{nome:'PAC',dias:'5–9 dias úteis',preco:36.90},{nome:'SEDEX',dias:'3–5 dias úteis',preco:55.90}],
  'DF':[{nome:'PAC',dias:'4–7 dias úteis',preco:33.90},{nome:'SEDEX',dias:'2–3 dias úteis',preco:50.90}],
  'GO':[{nome:'PAC',dias:'5–8 dias úteis',preco:36.90},{nome:'SEDEX',dias:'3–4 dias úteis',preco:55.90}],
  'MT':[{nome:'PAC',dias:'6–9 dias úteis',preco:40.90},{nome:'SEDEX',dias:'4–5 dias úteis',preco:62.90}],
  'MS':[{nome:'PAC',dias:'5–8 dias úteis',preco:38.90},{nome:'SEDEX',dias:'3–5 dias úteis',preco:58.90}],
  'BA':[{nome:'PAC',dias:'7–10 dias úteis',preco:44.90},{nome:'SEDEX',dias:'4–6 dias úteis',preco:68.90}],
  'SE':[{nome:'PAC',dias:'7–11 dias úteis',preco:46.90},{nome:'SEDEX',dias:'5–6 dias úteis',preco:70.90}],
  'AL':[{nome:'PAC',dias:'8–11 dias úteis',preco:48.90},{nome:'SEDEX',dias:'5–7 dias úteis',preco:72.90}],
  'PE':[{nome:'PAC',dias:'8–12 dias úteis',preco:48.90},{nome:'SEDEX',dias:'5–7 dias úteis',preco:72.90}],
  'PB':[{nome:'PAC',dias:'8–12 dias úteis',preco:50.90},{nome:'SEDEX',dias:'6–8 dias úteis',preco:75.90}],
  'RN':[{nome:'PAC',dias:'9–13 dias úteis',preco:52.90},{nome:'SEDEX',dias:'6–8 dias úteis',preco:76.90}],
  'CE':[{nome:'PAC',dias:'9–13 dias úteis',preco:54.90},{nome:'SEDEX',dias:'6–8 dias úteis',preco:78.90}],
  'PI':[{nome:'PAC',dias:'10–14 dias úteis',preco:57.90},{nome:'SEDEX',dias:'7–9 dias úteis',preco:82.90}],
  'MA':[{nome:'PAC',dias:'10–15 dias úteis',preco:60.90},{nome:'SEDEX',dias:'7–10 dias úteis',preco:86.90}],
  'TO':[{nome:'PAC',dias:'9–13 dias úteis',preco:58.90},{nome:'SEDEX',dias:'6–9 dias úteis',preco:84.90}],
  'PA':[{nome:'PAC',dias:'11–16 dias úteis',preco:65.90},{nome:'SEDEX',dias:'8–11 dias úteis',preco:92.90}],
  'AM':[{nome:'PAC',dias:'14–20 dias úteis',preco:74.90},{nome:'SEDEX',dias:'10–14 dias úteis',preco:105.90}],
  'AP':[{nome:'PAC',dias:'14–20 dias úteis',preco:72.90},{nome:'SEDEX',dias:'10–14 dias úteis',preco:102.90}],
  'RR':[{nome:'PAC',dias:'15–22 dias úteis',preco:80.90},{nome:'SEDEX',dias:'12–16 dias úteis',preco:112.90}],
  'AC':[{nome:'PAC',dias:'15–22 dias úteis',preco:82.90},{nome:'SEDEX',dias:'12–16 dias úteis',preco:115.90}],
  'RO':[{nome:'PAC',dias:'12–18 dias úteis',preco:70.90},{nome:'SEDEX',dias:'9–13 dias úteis',preco:98.90}]
};

function multPeso(g) {
  if (g <= 500)   return 1;
  if (g <= 2000)  return 1.15;
  if (g <= 5000)  return 1.35;
  if (g <= 10000) return 1.60;
  return 1.90;
}

// Descobre UF/cidade pelo CEP (via ViaCEP)
async function buscarCEP(cep) {
  const c = String(cep || '').replace(/\D/g, '');
  if (c.length !== 8) return null;
  try {
    const r = await fetch('https://viacep.com.br/ws/' + c + '/json/');
    const d = await r.json();
    if (d.erro) return null;
    return { uf: d.uf, cidade: d.localidade, bairro: d.bairro || '', cep: c };
  } catch { return null; }
}

function opcoesFrete(uf, weightGrams) {
  const base = FRETE_TABLE[uf] || [{ nome: 'PAC', dias: 'a consultar', preco: 69.90 }, { nome: 'SEDEX', dias: 'a consultar', preco: 99.90 }];
  const m = multPeso(weightGrams);
  return base.map(o => ({ nome: o.nome, dias: o.dias, preco: Math.round(o.preco * m * 100) / 100 }));
}

// Monta orçamento completo. itens = [{produto_id, pacote, quantidade}]
// pacote = unidades do pacote (50/100/250) · quantidade = nº de pacotes
async function montarOrcamento(cep, itens, produtos) {
  const loc = await buscarCEP(cep);
  if (!loc) return { ok: false, erro: 'CEP inválido ou não encontrado.' };
  if (!Array.isArray(itens) || !itens.length) return { ok: false, erro: 'Nenhum item informado.' };

  let subtotal = 0, pesoG = 0;
  const linhas = [];
  for (const it of itens) {
    const p = produtos.find(x => x.id === it.produto_id);
    if (!p) return { ok: false, erro: 'Produto não encontrado: ' + it.produto_id };
    const v = (p.variants || []).find(x => Number(x.units) === Number(it.pacote)) || (p.variants || [])[0];
    if (!v) return { ok: false, erro: 'Pacote indisponível para ' + p.name };
    const qtd = Math.max(1, parseInt(it.quantidade) || 1);
    const wUnit = p.weight_per_unit || 15;
    subtotal += v.price * qtd;
    pesoG += v.units * qtd * wUnit;
    linhas.push({ produto_id: p.id, nome: p.name, pacote: v.units, quantidade: qtd, preco_unit: v.price, subtotal: v.price * qtd });
  }

  const frete = opcoesFrete(loc.uf, pesoG);
  // link de checkout pré-preenchido (app.js lê o parâmetro ?orcar=)
  const orcarParam = linhas.map(l => l.produto_id + ':' + l.pacote + ':' + l.quantidade).join(',');
  const link = SITE + '/?orcar=' + encodeURIComponent(orcarParam) + '&cep=' + loc.cep;

  return {
    ok: true,
    regiao: { cidade: loc.cidade, uf: loc.uf, cep: loc.cep },
    itens: linhas,
    subtotal: Math.round(subtotal * 100) / 100,
    peso_kg: Math.round(pesoG / 10) / 100,
    frete: frete,
    total_com_pac: Math.round((subtotal + frete[0].preco) * 100) / 100,
    total_com_sedex: frete[1] ? Math.round((subtotal + frete[1].preco) * 100) / 100 : null,
    link_checkout: link
  };
}

module.exports = { buscarCEP, opcoesFrete, montarOrcamento };
