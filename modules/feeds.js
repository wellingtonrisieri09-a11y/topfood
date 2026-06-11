// modules/feeds.js — Módulo 1: Feeds Google Shopping, Meta Catalog, TikTok, GMB
const { readData, readSettings } = require("../db");

function buildGoogleFeed(req, res) {
  try {
    const products = readData("products.json").filter(p => p.active !== false);
    const settings = readSettings();
    const baseUrl  = process.env.BASE_URL || "https://topfoodembalagens.com.br";
    const storeName = settings.store_name || "TopFood Embalagens";

    let items = "";
    products.forEach(p => {
      const variants = p.variants || p.packs || [];
      const imageUrl  = (p.images && p.images[0]) ? (p.images[0].startsWith("http") ? p.images[0] : baseUrl + "/images/" + p.images[0]) : "";
      const productUrl = baseUrl + "/produto/" + encodeURIComponent(p.id);
      variants.forEach((v, vi) => {
        const price = parseFloat(v.price || v.valor || 0).toFixed(2);
        const units = parseInt(v.units || v.quantidade || 0);
        if (!price || !units) return;
        const itemId = p.id + "-" + units;
        const title  = p.name + " — Pacote com " + units + " unidades";
        const weight = parseFloat((p.weight_per_unit || 0.05) * units).toFixed(3);
        items += `
    <item>
      <g:id>${itemId}</g:id>
      <g:title><![CDATA[${title}]]></g:title>
      <g:description><![CDATA[${(p.description||p.name).replace(/[<>]/g,"")}]]></g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>in_stock</g:availability>
      <g:price>${price} BRL</g:price>
      <g:brand><![CDATA[TopFood Embalagens]]></g:brand>
      <g:product_type><![CDATA[Embalagens > Food Service]]></g:product_type>
      <g:custom_label_0>${p.category || "embalagem"}</g:custom_label_0>
      <g:identifier_exists>no</g:identifier_exists>
      ${weight>0 ? "<g:shipping_weight>" + weight + " kg</g:shipping_weight>" : ""}
    </item>`;
      });
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title><![CDATA[${storeName} — Google Shopping]]></title>
    <link>${baseUrl}</link>
    <description><![CDATA[Catálogo de embalagens food service TopFood]]></description>
    <language>pt-BR</language>${items}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=21600");
    res.send(xml);
  } catch(e) {
    console.error("Feed Google erro:", e.message);
    res.status(500).send("Feed temporariamente indisponível");
  }
}

function buildMetaFeed(req, res) {
  try {
    const products = readData("products.json").filter(p => p.active !== false);
    const baseUrl  = process.env.BASE_URL || "https://topfoodembalagens.com.br";

    const items = [];
    products.forEach(p => {
      const variants = p.variants || p.packs || [];
      const imageUrl  = (p.images && p.images[0]) ? (p.images[0].startsWith("http") ? p.images[0] : baseUrl + "/images/" + p.images[0]) : "";
      const productUrl = baseUrl + "/produto/" + encodeURIComponent(p.id);
      variants.forEach(v => {
        const price = parseFloat(v.price || v.valor || 0);
        const units = parseInt(v.units || v.quantidade || 0);
        if (!price || !units) return;
        items.push({
          id: p.id + "-" + units,
          title: p.name + " (Pacote " + units + " un)",
          description: (p.description || p.name).substring(0, 200),
          availability: "in stock",
          condition: "new",
          price: price.toFixed(2) + " BRL",
          link: productUrl,
          image_link: imageUrl,
          brand: "TopFood Embalagens",
          google_product_category: "2",
          product_type: "Embalagens > Food Service",
        });
      });
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=21600");
    res.json({ data: items });
  } catch(e) {
    console.error("Feed Meta erro:", e.message);
    res.status(500).json({ error: "Feed temporariamente indisponível" });
  }
}

function buildTikTokFeed(req, res) {
  try {
    const products = readData("products.json").filter(p => p.active !== false);
    const baseUrl  = process.env.BASE_URL || "https://topfoodembalagens.com.br";

    const items = [];
    products.forEach(p => {
      const variants = p.variants || p.packs || [];
      const imageUrl  = (p.images && p.images[0]) ? (p.images[0].startsWith("http") ? p.images[0] : baseUrl + "/images/" + p.images[0]) : "";
      const productUrl = baseUrl + "/produto/" + encodeURIComponent(p.id);
      variants.forEach(v => {
        const price = parseFloat(v.price || v.valor || 0);
        const units = parseInt(v.units || v.quantidade || 0);
        if (!price || !units) return;
        items.push({
          sku_id: p.id + "-" + units,
          title: p.name + " (Pacote " + units + " un)",
          price: price.toFixed(2),
          currency: "BRL",
          link: productUrl,
          image_link: imageUrl,
          availability: "in stock",
          brand: "TopFood Embalagens",
          description: (p.description || p.name).substring(0, 200),
        });
      });
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=21600");
    res.json({ catalog: items, total: items.length, updated_at: new Date().toISOString() });
  } catch(e) {
    console.error("Feed TikTok erro:", e.message);
    res.status(500).json({ error: "Feed temporariamente indisponível" });
  }
}

function registerFeedRoutes(app) {
  // Google Shopping XML
  app.get("/feed.xml",       buildGoogleFeed);
  app.get("/feed-google.xml",buildGoogleFeed);
  // Meta Catalog JSON
  app.get("/feed-meta.json", buildMetaFeed);
  // TikTok Catalog JSON
  app.get("/feed-tiktok.json", buildTikTokFeed);
  // Status de todos os feeds
  app.get("/api/admin/feeds/status", (req, res) => {
    const products = readData("products.json").filter(p => p.active !== false);
    let googleItems = 0, metaItems = 0, tiktokItems = 0;
    products.forEach(p => {
      const v = p.variants || p.packs || [];
      const validV = v.filter(x => parseFloat(x.price||x.valor||0)>0);
      googleItems += validV.length;
      metaItems   += validV.length;
      tiktokItems += validV.length;
    });
    res.json({
      google: { url: "/feed.xml",          items: googleItems, status: googleItems>0?"ok":"empty" },
      meta:   { url: "/feed-meta.json",    items: metaItems,   status: metaItems>0?"ok":"empty" },
      tiktok: { url: "/feed-tiktok.json",  items: tiktokItems, status: tiktokItems>0?"ok":"empty" },
      products_active: products.length,
      updated_at: new Date().toISOString(),
    });
  });
  console.log("✅ M1 Feeds registrado: /feed.xml /feed-meta.json /feed-tiktok.json");
}

module.exports = { registerFeedRoutes };