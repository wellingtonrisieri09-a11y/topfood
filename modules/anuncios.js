// modules/anuncios.js — M14: Publicação de Anúncios (tela do painel + motor)
// Guarda os anúncios (rascunho/publicado) e gera o "pacote pronto" por plataforma:
// link rastreável (UTM) + texto formatado, pra colar em cada Ads Manager.
// Quando as APIs de anúncios forem aprovadas, o publish() liga a publicação
// automática (Meta/Google via Windsor) sem mudar a tela.
const { readSettings, writeData, auditLog } = require("../db");
const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const PLATAFORMAS = ["meta", "google", "tiktok"];
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "ads");
const BASE_URL = () => (process.env.BASE_URL || "https://topfoodembalagens.com.br").replace(/\/$/, "");

// ─── Armazenamento (usa a store de settings, sem migração de schema) ─────
function getAds() {
  const s = readSettings();
  return Array.isArray(s.eco_ads) ? s.eco_ads : [];
}
function saveAds(ads) {
  writeData("settings.json", { eco_ads: ads });
}

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40) || "campanha";
}

// Link rastreável por plataforma (UTM) — pra medir o ROI de cada anúncio
function buildTrackedLink(ad, plataforma) {
  const landing = ad.landing || "/";
  const camp = slugify(ad.titulo);
  const params = new URLSearchParams({
    utm_source:   plataforma,
    utm_medium:   "cpc",
    utm_campaign: camp,
    utm_content:  ad.id,
  });
  return `${BASE_URL()}${landing}?${params.toString()}`;
}

// Gera o "pacote pronto" de cada plataforma escolhida
function buildPackage(ad) {
  return (ad.plataformas || []).map(p => ({
    plataforma: p,
    link:       buildTrackedLink(ad, p),
    titulo:     ad.titulo || "",
    texto:      ad.texto || "",
    imagem:     ad.imagem || "",
    orcamento_diario: ad.orcamento_diario || 0,
  }));
}

function registerAnunciosRoutes(app, requireAuth) {
  // Lista todos os anúncios
  app.get("/api/eco/anuncios", requireAuth, (req, res) => {
    try {
      res.json({ ok: true, ads: getAds() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Cria ou atualiza um anúncio (rascunho)
  app.post("/api/eco/anuncios", requireAuth, (req, res) => {
    try {
      const b = req.body || {};
      const plataformas = (Array.isArray(b.plataformas) ? b.plataformas : [])
        .filter(p => PLATAFORMAS.includes(p));
      if (!b.titulo || !b.titulo.trim())
        return res.status(400).json({ ok: false, error: "Informe o título do anúncio." });
      if (!plataformas.length)
        return res.status(400).json({ ok: false, error: "Escolha ao menos uma plataforma." });

      const ads = getAds();
      const now = new Date().toISOString();
      let ad;
      if (b.id) {
        ad = ads.find(a => a.id === b.id);
        if (!ad) return res.status(404).json({ ok: false, error: "Anúncio não encontrado." });
      } else {
        ad = { id: "AD-" + Date.now(), status: "rascunho", created_at: now };
        ads.unshift(ad);
      }
      Object.assign(ad, {
        produto:          b.produto || "",
        produto_nome:     b.produto_nome || "",
        plataformas,
        titulo:           String(b.titulo).trim(),
        texto:            String(b.texto || "").trim(),
        imagem:           String(b.imagem || "").trim(),
        artes:            Array.isArray(b.artes) ? b.artes.filter(a => a && a.url).slice(0, 6) : (ad.artes || []),
        landing:          String(b.landing || "/").trim() || "/",
        orcamento_diario: parseFloat(b.orcamento_diario) || 0,
        publico:          String(b.publico || "").trim(),
        updated_at:       now,
      });
      saveAds(ads);
      auditLog(req.user?.id, req.user?.username, b.id ? "ad-update" : "ad-create",
        "eco_ads", ad.id, ad.titulo, req.ip);
      res.json({ ok: true, ad });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Publica: gera o pacote pronto e marca como publicado
  // (quando as APIs forem aprovadas, dispara a publicação automática aqui)
  app.post("/api/eco/anuncios/:id/publish", requireAuth, (req, res) => {
    try {
      const ads = getAds();
      const ad = ads.find(a => a.id === req.params.id);
      if (!ad) return res.status(404).json({ ok: false, error: "Anúncio não encontrado." });

      ad.pacote = buildPackage(ad);
      ad.status = "publicado";
      ad.published_at = new Date().toISOString();
      saveAds(ads);
      auditLog(req.user?.id, req.user?.username, "ad-publish", "eco_ads", ad.id, ad.titulo, req.ip);
      res.json({
        ok: true,
        ad,
        // sinaliza pra tela o que já é automático vs. o que ainda é manual
        auto_publish: false,
        aviso: "Pacote gerado (link rastreável + texto). Publicação automática nas plataformas ativa após aprovação das APIs.",
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Remove um anúncio
  app.delete("/api/eco/anuncios/:id", requireAuth, (req, res) => {
    try {
      const ads = getAds().filter(a => a.id !== req.params.id);
      saveAds(ads);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Upload de arte (recebe base64 data URL, salva em /uploads/ads e devolve a URL pública)
  app.post("/api/eco/anuncios/upload", requireAuth, (req, res) => {
    try {
      const { dataUrl, nome } = req.body || {};
      const m = /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
      if (!m) return res.status(400).json({ ok: false, error: "Envie uma imagem válida (PNG, JPG, WEBP)." });
      const ext = m[2] === "jpeg" ? "jpg" : m[2];
      const buf = Buffer.from(m[3], "base64");
      if (buf.length > 12 * 1024 * 1024) return res.status(400).json({ ok: false, error: "Imagem muito grande (máx. 12 MB)." });
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const fname = "AD-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex") + "." + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
      const url = "/uploads/ads/" + fname;
      auditLog(req.user?.id, req.user?.username, "ad-upload", "eco_ads", fname, nome || "", req.ip);
      res.json({ ok: true, url, nome: nome || fname });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  seedPastelCampaign();
  console.log("✅ M14 Anúncios registrado: /api/eco/anuncios/* (+ upload)");
}

// Semeia a 1ª campanha (Pastel) só se nunca houve anúncios — roda no boot do servidor
function seedPastelCampaign() {
  try {
    if (readSettings().eco_ads !== undefined) return; // já inicializado, não mexe
    const now = new Date().toISOString();
    saveAds([{
      id: "AD-PASTEL-001",
      status: "rascunho",
      created_at: now,
      produto: "pastel",
      produto_nome: "Embalagem de Pastel — Pillow Box",
      plataformas: ["meta", "google", "tiktok"],
      titulo: "A embalagem que destaca o seu pastel!",
      texto: "Mais proteção, higiene e destaque para o seu produto. Crocante por fora, irresistível por dentro! Pacotes de 50, 100 e 250 un.",
      imagem: "/assets/ads/pastel-quadrado.png",
      artes: [
        { url: "/assets/ads/pastel-quadrado.png",  nome: "Feed quadrado (1:1)" },
        { url: "/assets/ads/pastel-vertical.png",   nome: "Stories/Reels/TikTok (9:16)" },
        { url: "/assets/ads/pastel-horizontal.png", nome: "Horizontal (16:9)" },
      ],
      landing: "/#pastel",
      orcamento_diario: 20,
      publico: "Donos de lanchonete, pastelaria, food truck e delivery — 25 a 55 anos",
      updated_at: now,
    }]);
    console.log("🌱 Campanha do Pastel semeada (1ª campanha).");
  } catch (e) { console.error("[anuncios] seed erro:", e.message); }
}

module.exports = { registerAnunciosRoutes, buildPackage, buildTrackedLink };
