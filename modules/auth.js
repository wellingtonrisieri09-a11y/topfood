// modules/auth.js — Módulo 9: Autenticação segura
// bcrypt, JWT httpOnly, 2FA TOTP (owner), blacklist, audit log
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const QRCode    = require("qrcode");
const { db, auditLog, blacklistToken, isTokenBlacklisted } = require("../db");

const JWT_SECRET  = process.env.JWT_SECRET  || "TROQUE_NO_DOT_ENV";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "12h";
const COOKIE_NAME = "tf_sess";

// ─── helpers ───────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 12 * 60 * 60 * 1000, // 12h em ms
  });
}

// Decodifica o usuário do request SEM exigir auth (retorna null se não logado).
// Usado por middlewares que precisam saber o papel antes das rotas (ex.: lockdown do vendedor).
function decodeUser(req) {
  const bearerHeader = req.headers["authorization"] || "";
  const bearerToken  = bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7).trim() : "";
  // Bearer (sessão explícita da aba) tem prioridade sobre o cookie (navegador
  // inteiro) — senão logar no portal numa aba derruba o admin nas outras.
  const token = bearerToken || req.cookies?.[COOKIE_NAME] || req.headers["x-session-token"];
  if (!token || isTokenBlacklisted(token)) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ─── middleware requireAuth ─────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const bearerHeader = req.headers["authorization"] || "";
  const bearerToken  = bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7).trim() : "";
  // Mesma prioridade do decodeUser: Bearer da aba > cookie do navegador
  const token = bearerToken || req.cookies?.[COOKIE_NAME] || req.headers["x-session-token"];
  if (!token) return res.status(401).json({ ok: false, error: "Não autenticado" });
  if (isTokenBlacklisted(token))
    return res.status(401).json({ ok: false, error: "Sessão encerrada" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    req._sessionToken = token;
    next();
  } catch(e) {
    res.status(401).json({ ok: false, error: "Sessão inválida ou expirada" });
  }
}

// ─── middleware requireOwner ────────────────────────────────────────────────
function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "owner")
      return res.status(403).json({ ok: false, error: "Acesso restrito ao proprietário" });
    next();
  });
}

// ─── middleware requireAdminPlus (admin, socio, owner) ─────────────────────
function requireAdminPlus(req, res, next) {
  requireAuth(req, res, () => {
    if (!["admin","socio","owner"].includes(req.user.role))
      return res.status(403).json({ ok: false, error: "Sem permissão" });
    next();
  });
}

// ─── rota: POST /api/admin/login ───────────────────────────────────────────
async function loginRoute(req, res) {
  const ip = req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?";
  const { username, password, totp_code } = req.body || {};

  if (!username || !password)
    return res.status(400).json({ ok: false, error: "Usuário e senha obrigatórios" });

  try {
    const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(username.toLowerCase().trim());
    if (!user) {
      await new Promise(r => setTimeout(r, 300)); // constant-time dummy delay
      return res.status(401).json({ ok: false, error: "Credenciais inválidas" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      auditLog(user.id, username, "login_fail", "users", user.id, "Senha incorreta", ip);
      return res.status(401).json({ ok: false, error: "Credenciais inválidas" });
    }

    // 2FA obrigatório para owner
    if (user.role === "owner") {
      const raw = JSON.parse(user.raw_data || "{}");
      if (raw.totp_secret) {
        if (!totp_code)
          return res.status(200).json({ ok: false, require_2fa: true });
        const valid = speakeasy.totp.verify({
          secret: raw.totp_secret,
          encoding: "base32",
          token: totp_code,
          window: 1,
        });
        if (!valid) {
          auditLog(user.id, username, "2fa_fail", "users", user.id, "TOTP inválido", ip);
          return res.status(401).json({ ok: false, error: "Código 2FA inválido" });
        }
      }
    }

    const rawData = JSON.parse(user.raw_data || "{}");
    const displayName = rawData.name || user.username;
    const payload = { id: user.id, username: user.username, role: user.role, name: displayName };
    const token   = signToken(payload);
    setSessionCookie(res, token);

    auditLog(user.id, username, "login", "users", user.id, "Login bem-sucedido", ip);
    // Retorna token no body para compatibilidade com admin.html
    res.json({ ok: true, token, role: user.role, name: displayName, user: payload });
  } catch(e) {
    console.error("Login erro:", e.message);
    res.status(500).json({ ok: false, error: "Erro interno" });
  }
}

// ─── rota: POST /api/admin/logout ──────────────────────────────────────────
function logoutRoute(req, res) {
  const token = req.cookies?.[COOKIE_NAME] || req.headers["x-session-token"];
  if (token) blacklistToken(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

// ─── rota: GET /api/admin/me ───────────────────────────────────────────────
function meRoute(req, res) {
  res.json({ ok: true, user: req.user });
}

// ─── rotas 2FA (owner) ─────────────────────────────────────────────────────
async function setup2faRoute(req, res) {
  if (req.user.role !== "owner")
    return res.status(403).json({ ok: false, error: "Apenas o proprietário pode configurar 2FA" });

  const secret = speakeasy.generateSecret({ name: "TopFood Admin (" + req.user.username + ")" });
  // Salvar secret provisório no DB (não confirmado ainda)
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  const raw  = JSON.parse(user.raw_data || "{}");
  raw.totp_secret_pending = secret.base32;
  db.prepare("UPDATE users SET raw_data=? WHERE id=?").run(JSON.stringify(raw), req.user.id);

  const qr = await QRCode.toDataURL(secret.otpauth_url);
  res.json({ ok: true, secret: secret.base32, qr });
}

function confirm2faRoute(req, res) {
  if (req.user.role !== "owner")
    return res.status(403).json({ ok: false, error: "Apenas o proprietário pode confirmar 2FA" });

  const { totp_code } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  const raw  = JSON.parse(user.raw_data || "{}");

  if (!raw.totp_secret_pending)
    return res.status(400).json({ ok: false, error: "Nenhuma configuração 2FA pendente" });

  const valid = speakeasy.totp.verify({
    secret: raw.totp_secret_pending,
    encoding: "base32",
    token: totp_code,
    window: 1,
  });
  if (!valid)
    return res.status(400).json({ ok: false, error: "Código inválido — tente novamente" });

  raw.totp_secret   = raw.totp_secret_pending;
  delete raw.totp_secret_pending;
  db.prepare("UPDATE users SET raw_data=? WHERE id=?").run(JSON.stringify(raw), req.user.id);

  const ip = req.headers["x-real-ip"] || req.socket.remoteAddress || "?";
  auditLog(req.user.id, req.user.username, "2fa_enabled", "users", req.user.id, "2FA ativado", ip);
  res.json({ ok: true, message: "2FA ativado com sucesso" });
}

// ─── rota: troca de senha ──────────────────────────────────────────────────
async function changePasswordRoute(req, res) {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password)
    return res.status(400).json({ ok: false, error: "Senhas obrigatórias" });
  if (new_password.length < 10)
    return res.status(400).json({ ok: false, error: "Nova senha deve ter mínimo 10 caracteres" });

  try {
    const user  = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match)
      return res.status(401).json({ ok: false, error: "Senha atual incorreta" });

    const hash = await bcrypt.hash(new_password, 12);
    const raw  = JSON.parse(user.raw_data || "{}");
    delete raw.force_password_change;
    db.prepare("UPDATE users SET password_hash=?, raw_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(hash, JSON.stringify(raw), req.user.id);

    const ip = req.headers["x-real-ip"] || req.socket.remoteAddress || "?";
    auditLog(req.user.id, req.user.username, "password_changed", "users", req.user.id, "Senha alterada", ip);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

// ─── registrar todas as rotas auth ─────────────────────────────────────────
function registerAuthRoutes(app) {
  const cookieParser = require("cookie-parser");
  app.use(cookieParser());

  app.post("/api/admin/login",                         loginRoute);
  app.post("/api/admin/logout",  requireAuth,          logoutRoute);
  app.get ("/api/admin/me",      requireAuth,          meRoute);
  app.get ("/api/admin/2fa/setup",   requireAuth,      setup2faRoute);
  app.post("/api/admin/2fa/confirm", requireAuth,      confirm2faRoute);
  app.post("/api/admin/change-password", requireAuth,  changePasswordRoute);

  console.log("✅ M9 Auth registrado: login/logout/me/2fa/change-password");
}

module.exports = {
  registerAuthRoutes,
  requireAuth,
  requireOwner,
  requireAdminPlus,
  decodeUser,
};