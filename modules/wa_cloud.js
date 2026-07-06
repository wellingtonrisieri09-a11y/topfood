// modules/wa_cloud.js — WhatsApp oficial (Meta Cloud API)
// Substitui o Baileys (não oficial) pelo canal oficial da Meta: estável, feito
// para rodar em servidor, sem QR e sem bloqueio. Recebe mensagens por webhook,
// responde com o mesmo "cérebro" do atendente (askClaude) e guarda as conversas
// para a caixa de entrada no painel (mobile).
const { readSettings, writeData, auditLog } = require("../db");
const { askClaude } = require("./atendente");

const GRAPH = "https://graph.facebook.com/v21.0";

// ─── Config (env tem prioridade; senão vem das settings do painel) ──────────
function cfg() {
  const s = readSettings();
  return {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || s.wa_phone_number_id || "",
    token:         process.env.WA_TOKEN            || s.wa_token           || "",
    verifyToken:   process.env.WA_VERIFY_TOKEN     || s.wa_verify_token    || "topfood-verify",
    enabled:       s.wa_cloud_enabled !== false, // liga/desliga a resposta automática
    ownerNumber:   s.atendente_notify || "",
  };
}
function configured() { const c = cfg(); return !!(c.phoneNumberId && c.token); }

// ─── Conversas (guardadas nas settings, sem migração de schema) ─────────────
function getConversas() {
  const s = readSettings();
  return (s.wa_cloud_conversas && typeof s.wa_cloud_conversas === "object") ? s.wa_cloud_conversas : {};
}
function saveConversas(c) { writeData("settings.json", { wa_cloud_conversas: c }); }

function addMsg(phone, dir, text, name) {
  const conv = getConversas();
  if (!conv[phone]) conv[phone] = { phone, name: name || phone, messages: [], updated: 0, unread: 0 };
  if (name) conv[phone].name = name;
  conv[phone].messages.push({ dir, text, ts: Date.now() });
  if (conv[phone].messages.length > 60) conv[phone].messages = conv[phone].messages.slice(-60);
  conv[phone].updated = Date.now();
  if (dir === "in") conv[phone].unread = (conv[phone].unread || 0) + 1;
  // não deixa crescer sem limite: guarda as 150 conversas mais recentes
  const keys = Object.keys(conv);
  if (keys.length > 150) {
    keys.sort((a, b) => (conv[a].updated || 0) - (conv[b].updated || 0));
    for (const k of keys.slice(0, keys.length - 150)) delete conv[k];
  }
  saveConversas(conv);
}

// ─── Envio de mensagem de texto pela Cloud API ──────────────────────────────
async function sendText(to, text) {
  const c = cfg();
  if (!c.phoneNumberId || !c.token) throw new Error("WhatsApp oficial não configurado");
  const res = await fetch(`${GRAPH}/${c.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Authorization": "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text, preview_url: true } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("WA send " + res.status + ": " + JSON.stringify(data).slice(0, 200));
  return data;
}

// Pausa a IA por 6h quando o dono responde na mão (evita a IA atropelar)
function isPaused(phone)  { const s = readSettings(); const p = (s.wa_cloud_pausados || {})[phone]; return p && Date.now() < p; }
function pausar(phone, ms = 6 * 60 * 60 * 1000) {
  const s = readSettings(); const p = s.wa_cloud_pausados || {}; p[phone] = Date.now() + ms;
  writeData("settings.json", { wa_cloud_pausados: p });
}

// ─── Rotas ──────────────────────────────────────────────────────────────────
function registerWaCloudRoutes(app, requireAuth, requireOwner) {
  // Verificação do webhook (a Meta chama isto uma vez ao configurar)
  app.get("/api/wa/webhook", (req, res) => {
    const c = cfg();
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === c.verifyToken) {
      return res.status(200).send(req.query["hub.challenge"]);
    }
    return res.sendStatus(403);
  });

  // Recebe mensagens dos clientes (a Meta chama isto a cada mensagem)
  app.post("/api/wa/webhook", async (req, res) => {
    res.sendStatus(200); // responde rápido; processa depois
    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      if (!value || !Array.isArray(value.messages)) return;
      const name = value.contacts?.[0]?.profile?.name;
      for (const m of value.messages) {
        const from = m.from;
        const text = m.type === "text" ? (m.text?.body || "")
                   : `[${m.type || "mídia"} recebido — responder pelo painel]`;
        addMsg(from, "in", text, name);

        const c = cfg();
        console.log(`[wa_cloud] msg de ${from}: "${text}" | enabled=${c.enabled} pausado=${isPaused(from)} configurado=${configured()}`);
        if (!c.enabled || isPaused(from) || m.type !== "text") { console.log("[wa_cloud] não respondeu (desligado/pausado/não-texto)"); continue; }

        try {
          const reply = await askClaude(from, text);
          const escalou = /^\[HUMANO\]/.test(reply || "");
          const clean = (reply || "").replace(/^\[HUMANO\]\s*/, "").trim() || "Só um instante que já te respondo. 🙂";
          await sendText(from, clean);
          addMsg(from, "out", clean, name);
          console.log(`[wa_cloud] resposta enviada para ${from}`);
          if (escalou) pausar(from); // IA pediu humano → pausa pra você assumir
        } catch (e) { console.error("[wa_cloud] IA/envio erro:", e.message); }
      }
    } catch (e) { console.error("[wa_cloud] webhook erro:", e.message); }
  });

  // ── Painel (caixa de entrada) ──
  app.get("/api/eco/wa/status", requireAuth, (req, res) => {
    const c = cfg();
    res.json({ ok: true, configurado: configured(), enabled: c.enabled,
      phone_number_id: c.phoneNumberId ? "•••" + c.phoneNumberId.slice(-4) : "",
      webhook_url: (process.env.BASE_URL || "https://topfoodembalagens.com.br").replace(/\/$/, "") + "/api/wa/webhook",
      verify_token: c.verifyToken });
  });

  app.get("/api/eco/wa/conversas", requireAuth, (req, res) => {
    const conv = getConversas();
    const lista = Object.values(conv)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .map(c => ({ phone: c.phone, name: c.name, unread: c.unread || 0, updated: c.updated,
        last: c.messages?.length ? c.messages[c.messages.length - 1].text.slice(0, 80) : "" }));
    res.json({ ok: true, conversas: lista });
  });

  app.get("/api/eco/wa/conversas/:phone", requireAuth, (req, res) => {
    const conv = getConversas();
    const c = conv[req.params.phone];
    if (c) { c.unread = 0; saveConversas(conv); } // marca como lida ao abrir
    res.json({ ok: true, conversa: c || { phone: req.params.phone, name: req.params.phone, messages: [] } });
  });

  // Resposta manual do dono pelo painel (pausa a IA nesse chat)
  app.post("/api/eco/wa/send", requireAuth, async (req, res) => {
    try {
      const { phone, text } = req.body || {};
      if (!phone || !text || !text.trim()) return res.status(400).json({ ok: false, error: "Informe telefone e mensagem." });
      await sendText(phone, text.trim());
      addMsg(phone, "out", text.trim());
      pausar(phone); // dono assumiu → IA pausa 6h nesse chat
      auditLog(req.user?.id, req.user?.username, "wa-send-manual", "wa_cloud", phone, "", req.ip);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Liga/desliga a resposta automática da IA
  app.put("/api/eco/wa/toggle", requireAuth, (req, res) => {
    writeData("settings.json", { wa_cloud_enabled: !!req.body?.enabled });
    res.json({ ok: true, enabled: !!req.body?.enabled });
  });

  // Salvar credenciais (owner) — phone_number_id e verify_token pelo painel;
  // o token de acesso fica no .env por segurança (não trafega pro cliente).
  app.put("/api/eco/wa/config", requireOwner || requireAuth, (req, res) => {
    const patch = {};
    if (req.body?.phone_number_id) patch.wa_phone_number_id = String(req.body.phone_number_id).trim();
    if (req.body?.verify_token)    patch.wa_verify_token    = String(req.body.verify_token).trim();
    if (req.body?.token)           patch.wa_token           = String(req.body.token).trim();
    writeData("settings.json", patch);
    res.json({ ok: true });
  });

  console.log("✅ WhatsApp oficial (Cloud API) registrado: /api/wa/webhook + caixa de entrada");
}

module.exports = { registerWaCloudRoutes, sendText };
