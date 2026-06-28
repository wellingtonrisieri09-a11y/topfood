// ============================================================
// Marketing — Métricas REAIS via Windsor.ai (Fase 1: orgânico)
// Puxa Google Search Console + Google Meu Negócio e monta um
// "dossiê de marketing" que alimenta a IA Gestora com DADO REAL
// (não mais só o comportamento interno do site).
//
// Formato confirmado da API Windsor: { "data": [ {...linhas...} ] }
// .env: WINDSOR_API_KEY
// ============================================================

const BASE = 'https://connectors.windsor.ai';

function apiKey()    { return process.env.WINDSOR_API_KEY || ''; }
function configured(){ return !!apiKey(); }

// Chamada genérica a um conector do Windsor (REST)
async function win(connector, fields, datePreset) {
  if (!apiKey()) throw new Error('SEM_WINDSOR_KEY');
  const qs = new URLSearchParams({ api_key: apiKey(), fields: fields.join(',') });
  if (datePreset) qs.set('date_preset', datePreset);
  const r = await fetch(BASE + '/' + connector + '?' + qs.toString(),
    { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('Windsor ' + connector + ' HTTP ' + r.status);
  const j = await r.json();
  return Array.isArray(j.data) ? j.data : (Array.isArray(j.result) ? j.result : []);
}

const num = (r, k) => Number(r && r[k]) || 0;
const r1  = (n) => Math.round(n * 10) / 10;
const r2  = (n) => Math.round(n * 100) / 100;

// Agrega totais de uma lista de linhas de anúncios (Google/Meta)
function sumAds(rows) {
  const gasto   = rows.reduce((a, r) => a + num(r, 'spend'), 0);
  const cliques = rows.reduce((a, r) => a + num(r, 'clicks'), 0);
  const impr    = rows.reduce((a, r) => a + num(r, 'impressions'), 0);
  return {
    gasto: r2(gasto), cliques, impressoes: impr,
    cpc_medio: cliques ? r2(gasto / cliques) : 0,
    ctr: impr ? r1(cliques / impr * 100) + '%' : '0%'
  };
}
// Maiores campanhas por gasto (até 8)
function topCampaigns(rows) {
  return rows.slice().sort((a, b) => num(b, 'spend') - num(a, 'spend')).slice(0, 8)
    .map(r => ({ campanha: r.campaign, gasto: r2(num(r, 'spend')), cliques: num(r, 'clicks'),
      impressoes: num(r, 'impressions'), cpc: r2(num(r, 'cpc')) }));
}

// Cache curto (o dossiê é caro: 2-3 chamadas externas)
let cache = { ts: 0, data: null };
const TTL = 6 * 60 * 60 * 1000; // 6h

async function buildDossie() {
  const d = { gerado_em: new Date().toISOString(), periodo: 'últimos 30 dias', fontes: {} };

  // ── Google Search Console (orgânico) ──
  try {
    const rows = await win('searchconsole', ['query', 'clicks', 'impressions', 'position'], 'last_30d');
    const com  = rows.filter(r => num(r, 'impressions') > 0);
    const tImp = com.reduce((a, r) => a + num(r, 'impressions'), 0);
    const tClk = com.reduce((a, r) => a + num(r, 'clicks'), 0);
    const top  = com.slice().sort((a, b) => num(b, 'impressions') - num(a, 'impressions')).slice(0, 15)
      .map(r => ({ termo: r.query, impressoes: num(r, 'impressions'), cliques: num(r, 'clicks'), posicao: r1(num(r, 'position')) }));
    // Oportunidades: já tem impressão e está na página 2-4 (pos 8-40) → empurrar p/ página 1
    const oport = com.filter(r => num(r, 'position') >= 8 && num(r, 'position') <= 40 && num(r, 'impressions') >= 2)
      .sort((a, b) => num(b, 'impressions') - num(a, 'impressions')).slice(0, 10)
      .map(r => ({ termo: r.query, posicao: r1(num(r, 'position')), impressoes: num(r, 'impressions') }));
    d.fontes.busca_google = {
      total_impressoes: tImp, total_cliques: tClk,
      ctr: tImp ? r1(tClk / tImp * 100) + '%' : '0%',
      top_termos: top, oportunidades_pagina2a4: oport
    };
  } catch (e) { d.fontes.busca_google = { indisponivel: e.message }; }

  // ── Google Meu Negócio (local) ──
  try {
    const perf = await win('google_my_business', ['impressions', 'website_clicks', 'call_clicks', 'direction_requests'], 'last_30d');
    const sum  = k => perf.reduce((a, r) => a + num(r, k), 0);
    let rev = {};
    try { const rr = await win('google_my_business', ['review_total_count', 'review_average_rating_total']); rev = rr[0] || {}; } catch (_) {}
    d.fontes.google_meu_negocio = {
      aparicoes_maps_busca: sum('impressions'),
      cliques_site: sum('website_clicks'),
      pedidos_rota: sum('direction_requests'),
      ligacoes: sum('call_clicks'),
      avaliacoes: num(rev, 'review_total_count'),
      nota_media: num(rev, 'review_average_rating_total')
    };
  } catch (e) { d.fontes.google_meu_negocio = { indisponivel: e.message }; }

  // ── Anúncios pagos (Meta Ads + Google Ads) ──
  const ads = {};
  try {
    const rows = await win('facebook', ['campaign', 'spend', 'clicks', 'impressions', 'cpc', 'ctr'], 'last_30d');
    ads.meta_ads = rows.length ? Object.assign(sumAds(rows), { campanhas: topCampaigns(rows) })
                               : { sem_dados: true };
  } catch (e) { ads.meta_ads = { indisponivel: e.message }; }
  try {
    const rows = await win('google_ads', ['campaign', 'spend', 'clicks', 'impressions', 'conversions', 'cpc', 'cost_per_conversion'], 'last_30d');
    if (rows.length) {
      const g = sumAds(rows);
      g.conversoes = rows.reduce((a, r) => a + num(r, 'conversions'), 0);
      g.custo_por_conversao = g.conversoes ? r2(g.gasto / g.conversoes) : 0;
      ads.google_ads = Object.assign(g, { campanhas: topCampaigns(rows) });
    } else {
      ads.google_ads = { sem_dados: true, nota: 'Google Ads ainda não sincronizou no Windsor (costuma levar ~1 dia após a campanha começar a rodar).' };
    }
  } catch (e) { ads.google_ads = { indisponivel: e.message }; }
  d.fontes.anuncios_pagos = ads;

  return d;
}

// Dossiê de marketing (cacheado). null se a chave não estiver configurada.
async function getMarketingDossie(force) {
  if (!configured()) return null;
  if (!force && cache.data && Date.now() - cache.ts < TTL) return cache.data;
  const data = await buildDossie();
  cache = { ts: Date.now(), data };
  return data;
}

function registerMarketingRoutes(app, requireAuth) {
  // Painel/depuração: ver o dossiê de marketing real (admin)
  app.get('/api/eco/metrics', requireAuth, async (req, res) => {
    try {
      if (!configured()) return res.json({ ok: false, configured: false, msg: 'WINDSOR_API_KEY não configurada no servidor' });
      const data = await getMarketingDossie(req.query.force === '1');
      res.json({ ok: true, configured: true, data });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  console.log('[Marketing] Métricas reais via Windsor registradas: GET /api/eco/metrics (configurado=' + configured() + ')');
}

module.exports = { registerMarketingRoutes, getMarketingDossie, windsorConfigured: configured };
