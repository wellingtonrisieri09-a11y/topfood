require('dotenv').config();
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { readData, writeData, readSettings, db, auditLog, blacklistToken, isTokenBlacklisted, releaseExpiredReservations, cleanBlacklist } = require('./db');
const { registerAuthRoutes, requireAuth, requireOwner, requireAdminPlus } = require('./modules/auth');
const { registerFeedRoutes }   = require('./modules/feeds');
const { registerBudgetRoutes } = require('./modules/budget');
const { registerBackupRoutes } = require('./modules/backup');
const { registerAsaasRoutes, createPixCharge } = require('./modules/asaas');
const { registerAtendenteRoutes } = require('./modules/atendente');
const express = require('express');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

const app     = express();
const PORT    = process.env.PORT    || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'topfood2026';
const ADMIN_TOKEN    = process.env.ADMIN_TOKEN    || null; // Defina ADMIN_TOKEN no .env em produção

// Permissões por perfil
const ROLE_PERMISSIONS = {
  owner:      { pages: ['*'], canDelete: true,  canSettings: true },
  admin:      { pages: ['overview','orders','products','customers','abandoned','reports','campaigns','contact','settings','users'], canDelete: true,  canSettings: true },
  socio:      { pages: ['overview','orders','reports','campaigns'],   canDelete: true,  canSettings: false },
  secretaria: { pages: ['orders','customers','abandoned','contact'],  canDelete: false, canSettings: false },
  designer:   { pages: ['orders'],                                    canDelete: false, canSettings: false },
};
function hasPermission(role, resource) {
  const p = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.designer;
  if (resource === 'canDelete')   return p.canDelete;
  if (resource === 'canSettings') return p.canSettings;
  return p.pages.includes(resource) || p.pages.includes('*');
}

// Garante que existe ao menos um admin padrão em users.json
// (chamada depois que DATA_DIR e os helpers estiverem definidos)
function ensureDefaultAdmin() {
  const users = readData('users.json');
  if (!users.length) {
    users.push({
      id: 'U-001', name: 'Wellington', username: 'wellington',
      password_hash: hashAdminPass(ADMIN_PASSWORD),
      role: 'admin', active: true, created_at: new Date().toISOString(), last_login: null,
    });
    writeData('users.json', users);
    console.log('👤 Usuário admin padrão criado: wellington / ' + ADMIN_PASSWORD);
  }
}
// NÃO chama aqui — será chamada após os helpers serem definidos (abaixo)

// ============================================================
// E-MAIL (Nodemailer) — configurado via variáveis de ambiente
// ============================================================
const EMAIL_ENABLED = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

const mailer = EMAIL_ENABLED
  ? nodemailer.createTransport({
      host:   process.env.EMAIL_HOST,
      port:   parseInt(process.env.EMAIL_PORT || '587'),
      secure: parseInt(process.env.EMAIL_PORT || '587') === 465,
      auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

const PAYMENT_LABEL = { pix: 'PIX', mercadopago: 'Mercado Pago', whatsapp: 'WhatsApp' };

function buildOrderEmailHtml(order) {
  const fmt = n => 'R$ ' + parseFloat(n || 0).toFixed(2).replace('.', ',');
  const rows = (order.items || []).map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${i.name} (pacote ${i.pack} un)</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(i.total)}</td>
    </tr>`
  ).join('');

  const shipping = order.shipping || {};
  const shippingLine = shipping.method
    ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">Frete (${shipping.method})</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">—</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(shipping.price)}</td></tr>`
    : '';

  const discountLine = order.discount > 0
    ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#16a34a">Desconto${order.coupon_code ? ' (' + order.coupon_code + ')' : ''}</td><td></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#16a34a">- ${fmt(order.discount)}</td></tr>`
    : '';

  const pmLabel = PAYMENT_LABEL[order.payment_method] || order.payment_method || 'Não informado';

  let paymentNote = '';
  if (order.payment_method === 'pix') {
    const s = readSettings();
    paymentNote = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0">
      <p style="font-weight:700;color:#15803d;margin-bottom:6px">🟢 Pagamento via PIX</p>
      <p style="font-size:14px;color:#166534">Chave PIX: <strong>${s.pix_key || 'Consulte nosso WhatsApp'}</strong></p>
      <p style="font-size:13px;color:#4b5563;margin-top:6px">Após o pagamento, envie o comprovante pelo WhatsApp para agilizar a separação do pedido.</p>
    </div>`;
  } else if (order.payment_method === 'whatsapp') {
    paymentNote = `<div style="background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:16px 20px;margin:20px 0">
      <p style="font-weight:700;color:#854d0e;margin-bottom:6px">💬 Pedido via WhatsApp</p>
      <p style="font-size:14px;color:#713f12">Em breve entraremos em contato para confirmar os detalhes e o pagamento.</p>
    </div>`;
  } else if (order.payment_method === 'mercadopago') {
    paymentNote = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:20px 0">
      <p style="font-weight:700;color:#1d4ed8;margin-bottom:6px">💳 Pagamento via Mercado Pago</p>
      <p style="font-size:14px;color:#1e40af">Seu pagamento está sendo processado. Você receberá uma confirmação em breve.</p>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <!-- HEADER -->
        <tr><td style="background:#111;padding:28px 32px;text-align:center">
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">🍔 TopFood Embalagens</p>
          <p style="margin:6px 0 0;font-size:13px;color:#9ca3af">Embalagens que valorizam seu alimento</p>
        </td></tr>
        <!-- TITLE -->
        <tr><td style="background:#cc0000;padding:18px 32px;text-align:center">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff">✅ Pedido Recebido!</p>
        </td></tr>
        <!-- BODY -->
        <tr><td style="padding:28px 32px">
          <p style="font-size:15px;color:#374151;margin-bottom:4px">Olá, <strong>${order.customer?.name || 'cliente'}</strong>!</p>
          <p style="font-size:14px;color:#6b7280;margin-bottom:20px">Recebemos seu pedido e já estamos separando para você.</p>

          <p style="font-size:12px;color:#9ca3af;margin-bottom:4px">NÚMERO DO PEDIDO</p>
          <p style="font-size:22px;font-weight:800;color:#111;margin-bottom:24px;letter-spacing:1px">${order.id}</p>

          <!-- ITEMS TABLE -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px;margin-bottom:4px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600">Produto</th>
                <th style="padding:10px 12px;text-align:center;color:#6b7280;font-weight:600">Qtd</th>
                <th style="padding:10px 12px;text-align:right;color:#6b7280;font-weight:600">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              ${shippingLine}
              ${discountLine}
              <tr style="background:#fef2f2">
                <td colspan="2" style="padding:12px;font-weight:700;color:#111;font-size:15px">Total</td>
                <td style="padding:12px;text-align:right;font-weight:800;color:#cc0000;font-size:16px">${fmt(order.total)}</td>
              </tr>
            </tbody>
          </table>

          <p style="font-size:13px;color:#6b7280;margin-bottom:20px">Forma de pagamento: <strong>${pmLabel}</strong></p>

          ${paymentNote}

          <!-- SHIPPING INFO -->
          ${shipping.method ? `<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-top:8px;font-size:13px;color:#374151">
            <p style="margin:0;font-weight:600">🚚 Entrega: ${shipping.method}</p>
            <p style="margin:4px 0 0;color:#6b7280">${shipping.days || ''} — CEP: ${shipping.cep || 'Não informado'}</p>
          </div>` : ''}

          <p style="margin-top:28px;font-size:13px;color:#6b7280">Dúvidas? Fale conosco pelo WhatsApp:</p>
          <a href="https://wa.me/5511988856367" style="display:inline-block;margin-top:6px;background:#25d366;color:#fff;font-weight:700;font-size:14px;padding:10px 22px;border-radius:8px;text-decoration:none">💬 Falar no WhatsApp</a>
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="font-size:12px;color:#9ca3af;margin:0">TopFood Embalagens — São Paulo, SP</p>
          <p style="font-size:11px;color:#d1d5db;margin:4px 0 0">Este é um e-mail automático, não é necessário responder.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendOrderConfirmationEmail(order) {
  if (!EMAIL_ENABLED || !order.customer?.email) return;
  try {
    const pmLabel = PAYMENT_LABEL[order.payment_method] || order.payment_method;
    await mailer.sendMail({
      from:    process.env.EMAIL_FROM || 'TopFood Embalagens <noreply@topfoodembalagens.com.br>',
      to:      order.customer.email,
      subject: `✅ Pedido ${order.id} recebido — TopFood Embalagens`,
      html:    buildOrderEmailHtml(order),
    });
    console.log(`📧 E-mail enviado para: ${order.customer.email} (pedido ${order.id})`);
  } catch(e) {
    console.error(`📧 Falha ao enviar e-mail (${order.customer.email}):`, e.message);
  }
}

async function sendPixConfirmedEmail(order) {
  if (!EMAIL_ENABLED || !order.customer?.email) return;
  try {
    const fmt = n => 'R$ ' + parseFloat(n || 0).toFixed(2).replace('.', ',');
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:#111;padding:28px 32px;text-align:center">
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff">🍔 TopFood Embalagens</p>
        </td></tr>
        <tr><td style="background:#16a34a;padding:18px 32px;text-align:center">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff">🟢 PIX Confirmado!</p>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <p style="font-size:15px;color:#374151">Olá, <strong>${order.customer?.name || 'cliente'}</strong>!</p>
          <p style="font-size:14px;color:#6b7280">Seu pagamento PIX foi confirmado. Seu pedido está sendo preparado.</p>
          <p style="font-size:22px;font-weight:800;color:#16a34a;margin:20px 0">${order.id} — ${fmt(order.total)}</p>
          <p style="font-size:13px;color:#6b7280">Em breve entraremos em contato para informar o prazo de entrega.</p>
          <a href="https://wa.me/5511988856367" style="display:inline-block;margin-top:16px;background:#25d366;color:#fff;font-weight:700;font-size:14px;padding:10px 22px;border-radius:8px;text-decoration:none">💬 Falar no WhatsApp</a>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="font-size:12px;color:#9ca3af;margin:0">TopFood Embalagens — São Paulo, SP</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    await mailer.sendMail({
      from:    process.env.EMAIL_FROM || 'TopFood Embalagens <noreply@topfoodembalagens.com.br>',
      to:      order.customer.email,
      subject: `🟢 PIX confirmado — Pedido ${order.id} — TopFood Embalagens`,
      html,
    });
    console.log(`📧 E-mail PIX confirmado: ${order.customer.email} (pedido ${order.id})`);
  } catch(e) {
    console.error(`📧 Falha ao enviar e-mail PIX (${order.customer.email}):`, e.message);
  }
}

// ============================================================
// SEGURANÇA — Headers, CORS, bloqueio de arquivos sensíveis
// ============================================================

// 1. Headers de segurança HTTP
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 2. Bloqueia acesso direto a arquivos sensíveis via URL
app.use((req, res, next) => {
  const url = req.path.toLowerCase();
  const blocked = ['/data/', '/server.js', '/.env', '/package.json',
                   '/package-lock.json', '/.gitignore', '/node_modules/'];
  if (blocked.some(b => url.startsWith(b))) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// 3. CORS — aceita apenas o próprio domínio (e localhost em desenvolvimento)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origem não permitida'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '15mb' }));        // Permite imagens em base64 (até ~11 MB real)
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.get('/admin', (req, res) => res.redirect(301, '/admin.html'));
app.get('/product.html', function(req, res, next) { var id = req.query.id; if (id) { return res.redirect(301, '/produto/' + encodeURIComponent(id)); } next(); });
app.use(express.static(path.join(__dirname)));

// ============================================================
// RATE LIMITING — Protege login contra força bruta
// ============================================================

// ============================================================
// HELPERS PERMISSÃO
// ============================================================
function requireRole(resource) {
  return (req, res, next) => {
    const role = req.user?.role || 'designer';
    if (!hasPermission(role, resource)) {
      return res.status(403).json({ error: 'Acesso negado para seu perfil.' });
    }
    next();
  };
}

// ============================================================
// ADMIN — USERS (somente administrador)
// ============================================================
app.get('/api/admin/users', requireAuth, requireRole('users'), (req, res) => {
  const users = readData('users.json').map(({ password_hash, ...u }) => u);
  res.json(users);
});

app.post('/api/admin/users', requireAuth, requireRole('users'), (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
  if (!ROLE_PERMISSIONS[role]) return res.status(400).json({ error: 'Perfil inválido.' });

  const users = readData('users.json');
  if (users.find(u => u.username === username.toLowerCase().trim())) {
    return res.status(409).json({ error: 'Nome de usuário já existe.' });
  }

  const newUser = {
    id: 'U-' + String(users.length + 1).padStart(3, '0'),
    name: name.trim(),
    username: username.toLowerCase().trim(),
    password_hash: require('bcryptjs').hashSync(password, 10),
    role,
    active: true,
    created_at: new Date().toISOString(),
    last_login: null,
  };
  users.push(newUser);
  writeData('users.json', users);
  console.log(`👤 Usuário criado: ${newUser.username} (${newUser.role})`);

  const { password_hash, ...safe } = newUser;
  res.json(safe);
});

app.put('/api/admin/users/:id', requireAuth, requireRole('users'), (req, res) => {
  const users = readData('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const { name, role, active, password } = req.body;
  if (name)               users[idx].name   = name.trim();
  if (role && ROLE_PERMISSIONS[role]) users[idx].role = role;
  if (typeof active === 'boolean') users[idx].active = active;
  if (password && password.length >= 6) users[idx].password_hash = require('bcryptjs').hashSync(password, 10);

  // Não permite desativar o único admin
  if (users[idx].role === 'admin' && users[idx].active === false) {
    const activeAdmins = users.filter(u => u.role === 'admin' && u.active !== false);
    if (activeAdmins.length === 0) return res.status(400).json({ error: 'Deve existir ao menos um administrador ativo.' });
  }

  writeData('users.json', users);
  const { password_hash, ...safe } = users[idx];
  res.json(safe);
});

app.delete('/api/admin/users/:id', requireAuth, requireRole('users'), (req, res) => {
  const users = readData('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });

  // Não permite excluir o próprio usuário ou o último admin
  if (users[idx].id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
  }
  if (users[idx].role === 'admin') {
    const admins = users.filter(u => u.role === 'admin');
    if (admins.length <= 1) return res.status(400).json({ error: 'Deve existir ao menos um administrador.' });
  }

  users.splice(idx, 1);
  writeData('users.json', users);
  res.json({ ok: true });
});

// ============================================================
// PUBLIC — GET /api/products (used by the store)
// ============================================================
app.get('/api/products', (req, res) => {
  res.json(readData('products.json'));
});

app.get('/api/products/:id', (req, res) => {
  const product = readData('products.json').find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(product);
});

// ============================================================
// ADMIN — ORDERS
// ============================================================
app.get('/api/admin/orders', requireAuth, (req, res) => {
  res.json(readData('orders.json'));
});
app.put('/api/admin/orders/:id', requireAuth, (req, res) => {
  const orders  = readData('orders.json');
  const idx     = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
  const wasNotPaid = orders[idx].status !== 'paid';
  orders[idx] = { ...orders[idx], ...req.body };
  writeData('orders.json', orders);
  res.json(orders[idx]);
  // Envia e-mail de PIX confirmado quando admin muda status para 'paid'
  if (wasNotPaid && orders[idx].status === 'paid' && orders[idx].payment_method === 'pix') {
    sendPixConfirmedEmail(orders[idx]);
  }
});
app.delete('/api/admin/orders/:id', requireAuth, requireRole('canDelete'), (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
  const removed = orders.splice(idx, 1)[0];
  writeData('orders.json', orders);
  console.log(`🗑️  Pedido excluído: ${removed.id} | ${removed.customer?.name} (por: ${req.user?.name})`);
  res.json({ ok: true });
});

// ============================================================
// ADMIN — PRODUCTS
// ============================================================
app.get('/api/admin/products', requireAuth, (req, res) => {
  res.json(readData('products.json'));
});
app.post('/api/admin/products', requireAuth, requireRole('products'), (req, res) => {
  const products = readData('products.json');
  const body     = req.body;

  // Gera ID único a partir do nome (slug)
  const slug = (body.name || 'produto')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  let id = slug;
  let suffix = 2;
  while (products.find(p => p.id === id)) { id = slug + '-' + suffix++; }

  const newProduct = {
    id,
    name:             body.name             || 'Novo Produto',
    category:         body.category         || '',
    description:      body.description      || '',
    long_description: body.long_description || '',
    features:         body.features         || [],
    specs:            body.specs            || [],
    images:           body.images           || [],
    image:            body.images?.[0]      || '',
    badge:            body.badge            || '',
    badgeColor:       body.badgeColor       || '',
    stars:            5,
    active:           body.active !== false,
    sold:             0,
    stock:            parseInt(body.stock)          || 0,
    weight_per_unit:  parseFloat(body.weight_per_unit) || 0,
    variants:         body.variants && body.variants.length
                        ? body.variants
                        : [{ units: 50, price: 0 }],
    created_at: new Date().toISOString(),
  };

  products.push(newProduct);
  writeData('products.json', products);
  console.log(`🆕 Produto criado: ${newProduct.id} — ${newProduct.name}`);
  res.json(newProduct);
});
app.put('/api/admin/products/:id', requireAuth, requireRole('products'), (req, res) => {
  const products = readData('products.json');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
  products[idx] = { ...products[idx], ...req.body };
  writeData('products.json', products);
  res.json(products[idx]);
});
app.delete('/api/admin/products/:id', requireAuth, requireRole('products'), (req, res) => {
  const products = readData('products.json');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
  const removed = products.splice(idx, 1)[0];
  writeData('products.json', products);
  console.log(`🗑️  Produto excluído: ${removed.id} — ${removed.name}`);
  res.json({ ok: true });
});

// ============================================================
// ADMIN — SETTINGS
// ============================================================
app.get('/api/admin/settings', requireAuth, (req, res) => {
  res.json(readSettings());
});
app.put('/api/admin/settings', requireAuth, (req, res) => {
  const current = readSettings();
  const updated = { ...current, ...req.body };
  writeData('settings.json', updated);
  res.json(updated);
});

// ============================================================
// ADMIN — ABANDONED CARTS
// ============================================================
app.get('/api/admin/abandoned', requireAuth, (req, res) => {
  res.json(readData('abandoned.json'));
});
app.post('/api/admin/abandoned', (req, res) => {
  // Called by the store when a user abandons a cart
  const list = readData('abandoned.json');
  const entry = {
    id: 'AB-' + String(Date.now()).slice(-6),
    date: new Date().toISOString(),
    ...req.body,
    recovered: false,
  };
  list.unshift(entry);
  writeData('abandoned.json', list.slice(0, 200));
  res.json({ ok: true, id: entry.id });
});

// POST /api/abandoned-recovered — site marca carrinho como recuperado ao concluir compra
app.post('/api/abandoned-recovered', (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false });
    const list = readData('abandoned.json');
    const item = list.find(a => a.id === id);
    if (item) { item.recovered = true; item.recovered_at = new Date().toISOString(); writeData('abandoned.json', list); }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false }); }
});
app.put('/api/admin/abandoned/:id', requireAuth, (req, res) => {
  const list = readData('abandoned.json');
  const idx  = list.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  list[idx] = { ...list[idx], ...req.body };
  writeData('abandoned.json', list);
  res.json(list[idx]);
});

// ============================================================
// CUSTOMER HELPERS
// ============================================================
function hashPass(password) {
  return crypto.createHash('sha256').update(password + 'topfood-salt').digest('hex');
}
function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
function customerAuth(req, res, next) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  const customers = readData('customers.json');
  const customer  = customers.find(c => c.token === token);
  if (!customer)  return res.status(401).json({ error: 'Sessão inválida' });
  req.customer = customer;
  next();
}

// ============================================================
// POST /api/customer/register
// ============================================================
app.post('/api/customer/register', (req, res) => {
  const { name, email, phone, password, cep, state, city, address, marketing_opt_in } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });

  const customers = readData('customers.json');
  if (customers.find(c => c.email === email.toLowerCase())) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });
  }

  const token = genToken();
  const newCustomer = {
    id: 'C-' + String(customers.length + 1).padStart(4, '0'),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone || '',
    password_hash: hashPass(password),
    cep: cep || '', state: state || '', city: city || '', address: address || '',
    marketing_opt_in: !!marketing_opt_in,
    token,
    registered_at: new Date().toISOString(),
  };

  customers.push(newCustomer);
  writeData('customers.json', customers);
  console.log(`👤 Novo cliente: ${newCustomer.name} (${newCustomer.email})`);

  const { password_hash, ...safeCustomer } = newCustomer;
  res.json({ ok: true, token, customer: safeCustomer });
});

// ============================================================
// POST /api/customer/login
// ============================================================
app.post('/api/customer/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.email === email.toLowerCase().trim());
  if (idx === -1 || customers[idx].password_hash !== hashPass(password)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }

  const token = genToken();
  customers[idx].token = token;
  customers[idx].last_login = new Date().toISOString();
  writeData('customers.json', customers);

  const { password_hash, ...safeCustomer } = customers[idx];
  res.json({ ok: true, token, customer: safeCustomer });
});

// ============================================================
// GET /api/customer/me — Dados do cliente logado
// ============================================================
app.get('/api/customer/me', customerAuth, (req, res) => {
  const { password_hash, ...safe } = req.customer;
  res.json(safe);
});

// ============================================================
// PUT /api/customer/me — Atualiza perfil
// ============================================================
app.put('/api/customer/me', customerAuth, (req, res) => {
  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.id === req.customer.id);
  if (idx === -1) return res.status(404).json({ error: 'Cliente não encontrado' });

  const { name, phone, cep, state, city, address, password } = req.body;
  if (name)    customers[idx].name    = name.trim();
  if (phone)   customers[idx].phone   = phone;
  if (cep)     customers[idx].cep     = cep;
  if (state)   customers[idx].state   = state.toUpperCase();
  if (city)    customers[idx].city    = city;
  if (address) customers[idx].address = address;
  if (password && password.length >= 6) customers[idx].password_hash = hashPass(password);

  writeData('customers.json', customers);
  const { password_hash, ...safe } = customers[idx];
  res.json(safe);
});

// ============================================================
// POST /api/customer/forgot-password
// ============================================================
app.post('/api/customer/forgot-password', (req, res) => {
  const { email, phone } = req.body;
  if (!email) return res.status(400).json({ error: 'Informe o e-mail.' });

  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.email === email.toLowerCase().trim());
  if (idx === -1) return res.status(404).json({ error: 'E-mail não encontrado. Verifique e tente novamente.' });

  // Verifica telefone se informado (segurança extra)
  if (phone) {
    const clean = s => s.replace(/\D/g, '');
    if (clean(customers[idx].phone) !== clean(phone)) {
      return res.status(401).json({ error: 'Telefone não confere com o cadastro.' });
    }
  }

  // Gera senha temporária: TF + 6 dígitos
  const tempPass = 'TF' + String(Math.floor(100000 + Math.random() * 900000));
  customers[idx].password_hash = hashPass(tempPass);
  customers[idx].temp_password = true;
  writeData('customers.json', customers);

  console.log(`🔑 Senha redefinida para: ${customers[idx].email} → ${tempPass}`);
  res.json({ ok: true, temp_password: tempPass, name: customers[idx].name });
});

// ============================================================
// POST /api/admin/customers/:id/reset-password — Admin redefine senha
// ============================================================
app.post('/api/admin/customers/:id/reset-password', requireAuth, (req, res) => {
  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Cliente não encontrado' });

  const tempPass = 'TF' + String(Math.floor(100000 + Math.random() * 900000));
  customers[idx].password_hash = hashPass(tempPass);
  customers[idx].temp_password = true;
  writeData('customers.json', customers);

  console.log(`🔑 Admin redefiniu senha de: ${customers[idx].email} → ${tempPass}`);
  res.json({ ok: true, temp_password: tempPass, name: customers[idx].name, email: customers[idx].email });
});

// ============================================================
// GET /api/customer/orders — Pedidos do cliente
// ============================================================
app.get('/api/customer/orders', customerAuth, (req, res) => {
  const orders = readData('orders.json');
  const mine = orders.filter(o => o.customer?.email === req.customer.email);
  res.json(mine);
});

// ============================================================
// GET /api/admin/customers — Lista todos os clientes (admin)
// ============================================================
app.get('/api/admin/customers', requireAuth, (req, res) => {
  const customers = readData('customers.json').map(({ password_hash, token, ...c }) => c);
  res.json(customers);
});

// ============================================================
// POST /api/admin/upload-image — Upload de imagem (base64)
// ============================================================
app.post('/api/admin/upload-image', requireAuth, (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'filename e data são obrigatórios' });

    // Sanitiza o nome do arquivo (permite letras, números, espaços, traço, ponto)
    const ext  = path.extname(filename).toLowerCase().replace(/[^.a-z]/g, '') || '.jpg';
    const base = path.basename(filename, path.extname(filename))
                   .replace(/[^a-zA-Z0-9\s\-_]/g, '')
                   .trim()
                   .slice(0, 60);
    // Adiciona timestamp para evitar colisão de nomes
    const safeName = `${base}-${Date.now()}${ext}`;
    const destPath = path.join(__dirname, 'images', safeName);

    // Decodifica base64 e salva
    const base64 = data.replace(/^data:image\/[a-z+]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    // Limite de 8 MB por imagem
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagem muito grande. Máximo 8 MB.' });
    }

    // Garante que a pasta images existe
    const imgDir = path.join(__dirname, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

    fs.writeFileSync(destPath, buffer);
    console.log(`🖼️  Imagem salva: images/${safeName} (${(buffer.length/1024).toFixed(0)} KB)`);
    res.json({ ok: true, path: `images/${safeName}`, name: safeName });

  } catch(e) {
    console.error('Erro upload imagem:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/admin/upload-video — Upload binário de vídeo (até 80 MB)
// ============================================================
app.post('/api/admin/upload-video', requireAuth,
  express.raw({ type: () => true, limit: '80mb' }),
  (req, res) => {
  try {
    const filename = String(req.query.filename || 'video.mp4');
    const ext = path.extname(filename).toLowerCase();
    if (!['.mp4', '.webm', '.mov', '.m4v'].includes(ext)) {
      return res.status(400).json({ error: 'Formato inválido. Use MP4, WebM ou MOV.' });
    }
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: 'Arquivo vazio.' });
    }
    const base = path.basename(filename, path.extname(filename))
                   .replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().slice(0, 60) || 'video';
    const safeName = `${base}-${Date.now()}${ext}`;
    const vidDir = path.join(__dirname, 'videos');
    if (!fs.existsSync(vidDir)) fs.mkdirSync(vidDir);
    fs.writeFileSync(path.join(vidDir, safeName), req.body);
    console.log(`🎬 Vídeo salvo: videos/${safeName} (${(req.body.length/1024/1024).toFixed(1)} MB)`);
    res.json({ ok: true, path: `videos/${safeName}`, name: safeName });
  } catch(e) {
    console.error('Erro upload vídeo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// DELETE /api/admin/images/:name — Remove imagem da pasta
// ============================================================
app.delete('/api/admin/images/:name', requireAuth, (req, res) => {
  try {
    const safe = path.basename(req.params.name); // prevent path traversal
    const filePath = path.join(__dirname, 'images', safe);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'Arquivo não encontrado' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/settings — Configurações públicas da loja
// ============================================================
app.get('/api/settings', (req, res) => {
  const s = readSettings();
  res.json({
    store_name:        s.store_name        || 'TopFood Embalagens',
    featured_banner:   s.featured_banner   || '',
    free_shipping_above: s.free_shipping_above || 0,
    whatsapp:          s.whatsapp          || '5511988856367',
    instagram:         s.instagram         || '',
    // PIX (chave pública — não é dado sensível)
    pix_key:           String(s.pix_key || ''),
    pix_name:          (s.pix_name  || s.store_name || 'TopFood').slice(0, 25),
    pix_city:          (s.pix_city  || 'SAO PAULO').slice(0, 15).toUpperCase(),
    // Marketing tracking IDs (nunca expõe tokens privados)
    meta_pixel_id:     s.meta_pixel_id     || '',
    gtm_id:            s.gtm_id            || '',
    google_ads_id:     s.google_ads_id     || '',
    google_ads_label:  s.google_ads_label  || '',
    google_analytics_id: s.google_analytics_id || '',
    tiktok_pixel_id:   s.tiktok_pixel_id    || '',
    // OpenPix: só expõe se está configurado (token nunca vai ao cliente)
    openpix_configured: !!( s.openpix_app_id || process.env.OPENPIX_APP_ID ),
  });
});

// ============================================================
// POST /api/contact — Mensagem do formulário de contato
// ============================================================
app.post('/api/contact', (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
    const msgs = readData('contact_messages.json');
    const entry = {
      id: 'MSG-' + String(Date.now()).slice(-8),
      date: new Date().toISOString(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || '',
      subject: subject || 'Outro',
      message: message.trim(),
      read: false,
    };
    msgs.unshift(entry);
    writeData('contact_messages.json', msgs.slice(0, 500));
    console.log(`📬 Contato: ${entry.name} (${entry.email}) — ${entry.subject}`);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/newsletter — Salva lead de newsletter (público)
// ============================================================
app.post('/api/newsletter', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  const leads = readData('newsletter_leads.json');
  const already = leads.find(l => l.email.toLowerCase() === email.toLowerCase());
  if (already) {
    return res.json({ ok: true, duplicate: true, coupon: already.coupon, message: 'E-mail já cadastrado.' });
  }
  const lead = {
    id: 'NL-' + Date.now(),
    email: email.toLowerCase().trim(),
    name: (name || '').trim(),
    coupon: 'BEMVINDO10',
    source: 'home_banner',
    created_at: new Date().toISOString(),
    status: 'active',
    email_sent: false,
  };
  leads.push(lead);
  writeData('newsletter_leads.json', leads);
  console.log('[Newsletter] Novo lead:', email);

  // Garante que o cupom BEMVINDO10 existe no banco
  const coupons = readData('coupons.json');
  if (!coupons.find(c => c.code === 'BEMVINDO10')) {
    coupons.push({
      id: 'CPN-BEMVINDO10', code: 'BEMVINDO10', type: 'percent', value: 10,
      min_order: 0, max_uses: 9999, uses: 0, active: true,
      created_at: new Date().toISOString(),
      description: 'Cupom boas-vindas newsletter — 10% de desconto',
    });
    writeData('coupons.json', coupons);
    console.log('[Newsletter] Cupom BEMVINDO10 criado.');
  }

  // Envia e-mail com o cupom
  if (EMAIL_ENABLED && mailer) {
    const firstName = lead.name ? lead.name.split(' ')[0] : 'cliente';
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
<tr><td style="background:#CC0000;padding:32px 40px;text-align:center">
  <h1 style="color:#fff;margin:0;font-size:28px;font-weight:800">TopFood Embalagens</h1>
  <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">Embalagens que valorizam seu alimento</p>
</td></tr>
<tr><td style="padding:40px">
  <h2 style="color:#111;margin:0 0 12px;font-size:22px">&#127873; Seu cupom de 10% chegou, ${firstName}!</h2>
  <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px">Obrigado por se cadastrar! Use o cupom abaixo na sua <strong>primeira compra</strong> e ganhe <strong>10% de desconto</strong>.</p>
  <div style="background:#FFF7ED;border:2px dashed #F59E0B;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px">
    <p style="margin:0 0 8px;font-size:13px;color:#92400E;text-transform:uppercase;letter-spacing:1px;font-weight:600">Seu cupom exclusivo</p>
    <div style="font-size:36px;font-weight:900;color:#CC0000;letter-spacing:4px">BEMVINDO10</div>
    <p style="margin:8px 0 0;font-size:13px;color:#92400E">10% de desconto na primeira compra</p>
  </div>
  <h3 style="color:#111;font-size:16px;margin:0 0 12px">Como usar:</h3>
  <ol style="color:#555;font-size:14px;line-height:1.8;padding-left:20px;margin:0 0 28px">
    <li>Acesse <a href="https://topfoodembalagens.com.br" style="color:#CC0000;font-weight:600">topfoodembalagens.com.br</a></li>
    <li>Escolha seus produtos e adicione ao carrinho</li>
    <li>No checkout, insira o cupom <strong>BEMVINDO10</strong></li>
    <li>10% de desconto aplicado automaticamente &#9989;</li>
  </ol>
  <div style="text-align:center;margin-bottom:28px">
    <a href="https://topfoodembalagens.com.br" style="background:#CC0000;color:#fff;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none;display:inline-block">Comprar agora &#8594;</a>
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;overflow:hidden">
    <tr><td style="padding:14px 16px;font-size:13px;color:#555;border-bottom:1px solid #eee">&#128666; <strong>Frete para todo o Brasil</strong> com rastreamento</td></tr>
    <tr><td style="padding:14px 16px;font-size:13px;color:#555;border-bottom:1px solid #eee">&#128230; <strong>Pedido mínimo</strong> de apenas 50 unidades</td></tr>
    <tr><td style="padding:14px 16px;font-size:13px;color:#555">&#128179; Parcele em até <strong>12x no cartão</strong> ou pague com PIX</td></tr>
  </table>
</td></tr>
<tr><td style="background:#111;padding:24px 40px;text-align:center">
  <p style="color:#9CA3AF;font-size:12px;margin:0 0 6px">TopFood Embalagens &mdash; (11) 98885-6367</p>
  <p style="color:#6B7280;font-size:11px;margin:0">Você recebeu este e-mail porque se cadastrou em topfoodembalagens.com.br.<br>Para cancelar, responda com "CANCELAR".</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

    mailer.sendMail({
      from:    process.env.EMAIL_FROM || 'TopFood Embalagens <contato@topfoodembalagens.com.br>',
      to:      lead.email,
      subject: '&#127873; Seu cupom de 10% chegou! — TopFood Embalagens',
      html,
    }).then(() => {
      const ls = readData('newsletter_leads.json');
      const idx = ls.findIndex(l => l.id === lead.id);
      if (idx !== -1) { ls[idx].email_sent = true; writeData('newsletter_leads.json', ls); }
      console.log('[Newsletter] E-mail enviado para:', lead.email);
    }).catch(err => console.error('[Newsletter] Erro ao enviar e-mail:', err.message));
  } else {
    console.warn('[Newsletter] SMTP nao configurado no .env — e-mail nao enviado');
  }

  res.json({ ok: true, coupon: lead.coupon });
});

// ============================================================
// GET /api/admin/newsletter — Lista leads (admin)
// ============================================================
app.get('/api/admin/newsletter', requireAuth, (req, res) => {
  const leads = readData('newsletter_leads.json');
  res.json(leads);
});

// ============================================================
// DELETE /api/admin/newsletter/:id — Remove lead (admin)
// ============================================================
app.delete('/api/admin/newsletter/:id', requireAuth, (req, res) => {
  const leads = readData('newsletter_leads.json');
  const filtered = leads.filter(l => l.id !== req.params.id);
  if (filtered.length === leads.length) return res.status(404).json({ error: 'Lead não encontrado.' });
  writeData('newsletter_leads.json', filtered);
  res.json({ ok: true });
});

// ============================================================
// GET /api/admin/contact — Lista mensagens de contato (admin)
// ============================================================
app.get('/api/admin/contact', requireAuth, (req, res) => {
  res.json(readData('contact_messages.json'));
});

// ============================================================
// PUT /api/admin/contact/:id — Marca como lida (admin)
// ============================================================
app.put('/api/admin/contact/:id', requireAuth, (req, res) => {
  const msgs = readData('contact_messages.json');
  const idx  = msgs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Mensagem não encontrada' });
  msgs[idx] = { ...msgs[idx], ...req.body };
  writeData('contact_messages.json', msgs);
  res.json(msgs[idx]);
});

// ============================================================
// GET /api/coupons/:code — Valida cupom (público)
// ============================================================
app.get('/api/coupons/:code', (req, res) => {
  const coupons = readData('coupons.json');
  const code = req.params.code.toUpperCase().trim();
  const coupon = coupons.find(c => c.code === code && c.active);
  if (!coupon) return res.status(404).json({ error: 'Cupom inválido ou não encontrado.' });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Cupom expirado.' });
  }
  if (coupon.max_uses && coupon.uses >= coupon.max_uses) {
    return res.status(410).json({ error: 'Cupom atingiu o limite de uso.' });
  }
  res.json({ ok: true, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value, description: coupon.description });
});

// ============================================================
// ADMIN — COUPONS
// ============================================================
app.get('/api/admin/coupons', requireAuth, (req, res) => {
  res.json(readData('coupons.json'));
});
app.post('/api/admin/coupons', requireAuth, (req, res) => {
  const coupons = readData('coupons.json');
  const { code, discount_type, discount_value, description, max_uses, expires_at } = req.body;
  if (!code || !discount_type || !discount_value) return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
  const upperCode = code.toUpperCase().trim();
  if (coupons.find(c => c.code === upperCode)) return res.status(409).json({ error: 'Código já existe.' });
  const maxCupNum = coupons.reduce((m, c) => {
    const n = c.id && c.id.match(/CUP-([0-9]+)/); return n ? Math.max(m, parseInt(n[1])) : m;
  }, 0);
  const newCoupon = {
    id: 'CUP-' + String(maxCupNum + 1).padStart(3, '0'),
    code: upperCode, discount_type, discount_value: parseFloat(discount_value),
    description: description || '', max_uses: max_uses ? parseInt(max_uses) : null,
    uses: 0, expires_at: expires_at || null, active: true, created_at: new Date().toISOString(),
  };
  coupons.push(newCoupon);
  writeData('coupons.json', coupons);
  console.log(`🏷️  Cupom criado: ${upperCode}`);
  res.json(newCoupon);
});
app.put('/api/admin/coupons/:id', requireAuth, (req, res) => {
  const coupons = readData('coupons.json');
  const idx = coupons.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Cupom não encontrado' });
  coupons[idx] = { ...coupons[idx], ...req.body };
  writeData('coupons.json', coupons);
  res.json(coupons[idx]);
});
app.delete('/api/admin/coupons/:id', requireAuth, (req, res) => {
  const coupons = readData('coupons.json');
  const idx = coupons.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Cupom não encontrado' });
  coupons.splice(idx, 1);
  writeData('coupons.json', coupons);
  res.json({ ok: true });
});

// ============================================================
// ============================================================
// GET /api/orders/:id/status — Polling público de status do pedido
// ============================================================
app.get('/api/orders/:id/status', (req, res) => {
  try {
    const orders = readData('orders.json');
    const order  = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json({ id: order.id, status: order.status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// POST /api/pix-charge — Cria cobrança PIX dinâmica via Asaas
// ============================================================
app.post('/api/pix-charge', async (req, res) => {
  const { orderId, total, customerName, customerEmail, customerPhone, customerCpf } = req.body;
  try {
    const result = await createPixCharge({
      id:    orderId,
      total: parseFloat(total || 0),
      customer: {
        name:  customerName  || 'Cliente',
        email: customerEmail || '',
        phone: customerPhone || '',
        cpf:   customerCpf   || '',
      },
    });
    if (!result.ok) throw new Error(result.error || 'Erro ao criar cobrança PIX');
    res.json({
      type:        'dynamic',
      qrCodeImage: result.qr_code   || '',
      brCode:      result.copy_paste || '',
      payment_id:  result.payment_id,
    });
  } catch(e) {
    console.error('Asaas PIX erro:', e.message);
    const settings = readSettings();
    res.json({
      type:     'static',
      pix_key:  String(settings.pix_key || ''),
      pix_name: (settings.pix_name || settings.store_name || 'TopFood').slice(0, 25),
      pix_city: (settings.pix_city || 'SAO PAULO').slice(0, 15).toUpperCase(),
    });
  }
});

// ============================================================
// POST /api/orders — Salva pedido direto da loja (WhatsApp / MP)
// ============================================================

// Gera ID de pedido unico baseado no maior numero existente (nao no length)
function generateOrderId(orders) {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const o of orders) {
    const m = o.id && o.id.match(/TF-\d{4}-(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return 'TF-' + year + '-' + String(maxNum + 1).padStart(3, '0');
}

app.post('/api/orders', (req, res) => {
  try {
    const orders = readData('orders.json');
    const { customer, items, shipping, subtotal, total, payment_method, notes, mp_preference_id, coupon_code, discount, utm } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

    // Aplica cupom se informado
    if (coupon_code) {
      const coupons = readData('coupons.json');
      const cidx = coupons.findIndex(c => c.code === coupon_code.toUpperCase().trim() && c.active);
      if (cidx !== -1) { coupons[cidx].uses = (coupons[cidx].uses || 0) + 1; writeData('coupons.json', coupons); }
    }

    const newOrder = {
      id: generateOrderId(orders),
      mp_id: mp_preference_id || '',
      date: new Date().toISOString(),
      customer: customer || { name: 'Cliente', email: '', phone: '' },
      items: items,
      shipping: shipping || {},
      subtotal: Math.round((parseFloat(subtotal) || 0) * 100) / 100,
      discount: Math.round((parseFloat(discount) || 0) * 100) / 100,
      coupon_code: coupon_code || '',
      total: Math.round((parseFloat(total) || 0) * 100) / 100,
      status: 'pending',
      payment_method: payment_method || 'whatsapp',
      tracking_code: '',
      notes: notes || '',
      utm: utm || {},
    };

    orders.unshift(newOrder);
    writeData('orders.json', orders.slice(0, 1000));
    console.log(`📦 Pedido: ${newOrder.id} | ${newOrder.customer.name} | R$ ${newOrder.total} | ${newOrder.payment_method}`);
    res.status(201).json({ ok: true, order_id: newOrder.id });
    // E-mail de confirmação (assíncrono — não bloqueia a resposta)
    sendOrderConfirmationEmail(newOrder);
  } catch(e) {
    console.error('Erro ao salvar pedido:', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// POST /api/asaas/credit-card — Cobrança cartão via Asaas
// ============================================================
app.post('/api/asaas/credit-card', async (req, res) => {
  const { orderId, total, customer, card, billingAddress, installments } = req.body;
  if (!orderId || !total || !customer || !card) {
    return res.status(400).json({ ok: false, error: 'Dados incompletos' });
  }
  try {
    const axios = require('axios');
    const asaasApi = axios.create({
      baseURL: 'https://api.asaas.com/v3',
      headers: { 'access_token': process.env.ASAAS_API_KEY, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    const cpfCnpj = (customer.cpf || customer.cnpj || '').replace(/\D/g, '');
    let customerId = null;
    if (cpfCnpj) {
      try {
        const r = await asaasApi.get('/customers?cpfCnpj=' + cpfCnpj);
        if (r.data.data && r.data.data.length > 0) customerId = r.data.data[0].id;
      } catch(e2) {}
    }
    if (!customerId) {
      const r = await asaasApi.post('/customers', {
        name:    customer.name,
        email:   customer.email   || undefined,
        phone:   (customer.phone  || '').replace(/\D/g, '') || undefined,
        cpfCnpj: cpfCnpj          || undefined,
      });
      customerId = r.data.id;
    }

    const dueDate = new Date().toISOString().split('T')[0];
    const payload = {
      customer:    customerId,
      billingType: 'CREDIT_CARD',
      value:       parseFloat(total),
      dueDate,
      description: 'Pedido ' + orderId + ' — TopFood Embalagens',
      externalReference: orderId,
      installmentCount: parseInt(installments || 1),
      creditCard: {
        holderName:  card.holderName,
        number:      card.number.replace(/\s/g, ''),
        expiryMonth: card.expiryMonth,
        expiryYear:  card.expiryYear,
        ccv:         card.ccv,
      },
      creditCardHolderInfo: {
        name:          customer.name,
        email:         customer.email || '',
        cpfCnpj,
        postalCode:    (billingAddress && billingAddress.cep   || '').replace(/\D/g, ''),
        addressNumber: (billingAddress && billingAddress.number || 'S/N'),
        phone:         (customer.phone || '').replace(/\D/g, ''),
      },
    };

    const r = await asaasApi.post('/payments', payload);
    const payment = r.data;

    const orderRow = db.prepare('SELECT raw_data FROM orders WHERE id=?').get(orderId);
    if (orderRow) {
      const raw = JSON.parse(orderRow.raw_data);
      raw.asaas_payment_id = payment.id;
      raw.asaas_status     = payment.status;
      const isPaid = ['CONFIRMED','RECEIVED','AUTHORIZED'].includes(payment.status);
      if (isPaid) {
        raw.payment_status = 'paid';
        raw.paid_at        = new Date().toISOString();
        raw.status         = 'paid';
        db.prepare('UPDATE orders SET raw_data=?, status=\'paid\', updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .run(JSON.stringify(raw), orderId);
      } else {
        db.prepare('UPDATE orders SET raw_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .run(JSON.stringify(raw), orderId);
      }
    }

    console.log('[asaas] Cartão: ' + payment.id + ' status=' + payment.status + ' pedido=' + orderId);
    res.json({ ok: true, payment_id: payment.id, status: payment.status });

  } catch(e) {
    const asaasErr = (e.response && e.response.data && e.response.data.errors && e.response.data.errors[0] && e.response.data.errors[0].description) || e.message;
    console.error('[asaas] credit-card erro:', asaasErr);
    res.status(400).json({ ok: false, error: asaasErr });
  }
});

// ============================================================
// POST /api/checkout — Cria a preferência no Mercado Pago
// ============================================================
app.post('/api/checkout', async (req, res) => {
  try {
    const settings = readSettings();
    const mpToken = settings.mp_access_token || process.env.MP_ACCESS_TOKEN || '';

    if (!mpToken || mpToken === 'SEU_ACCESS_TOKEN_AQUI') {
      return res.status(500).json({ error: 'Access Token do Mercado Pago não configurado.' });
    }

    const mpClient = new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } });
    const { items, shipping } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

    const prefItems = items.map(item => ({
      id: item.id || item.name,
      title: `${item.name} (pacote ${item.pack} un)`,
      quantity: parseInt(item.qty),
      unit_price: parseFloat(item.price),
      currency_id: 'BRL',
      category_id: 'others',
    }));

    if (shipping && shipping.preco > 0) {
      prefItems.push({
        id: 'frete',
        title: `Frete ${shipping.nome} — ${shipping.dias}`,
        quantity: 1,
        unit_price: parseFloat(shipping.preco),
        currency_id: 'BRL',
        category_id: 'others',
      });
    }

    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: prefItems,
        back_urls: {
          success: `${BASE_URL}/?payment=success`,
          failure: `${BASE_URL}/?payment=failure`,
          pending: `${BASE_URL}/?payment=pending`,
        },
        auto_return: 'approved',
        statement_descriptor: 'TOPFOOD EMBALAGENS',
        payment_methods: { installments: 12 },
        notification_url: `${BASE_URL}/api/webhook`,
        expires: false,
      }
    });

    console.log(`✅ Preferência criada: ${result.id}`);
    res.json({ id: result.id, init_point: result.init_point, sandbox_init_point: result.sandbox_init_point });

  } catch (error) {
    console.error('❌ Erro Mercado Pago:', error.message || error);
    res.status(500).json({ error: 'Falha ao processar pagamento. Tente novamente ou entre em contato via WhatsApp.' });
  }
});

// ============================================================
// POST /api/webhook — Notificações do Mercado Pago
// ============================================================
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;
  console.log(`📨 Webhook MP | tipo: ${type} | id: ${data?.id}`);

  if (type === 'payment' && data?.id) {
    try {
      // Salva o pedido a partir dos dados do webhook
      const orders = readData('orders.json');
      const exists = orders.find(o => o.mp_id === String(data.id));
      if (!exists) {
        const newOrder = {
          id: generateOrderId(orders),
          mp_id: String(data.id),
          date: new Date().toISOString(),
          customer: { name: 'Cliente MP', email: '', phone: '' },
          items: [],
          shipping: {},
          subtotal: 0,
          total: 0,
          status: 'paid',
          payment_method: 'mercadopago',
          tracking_code: '',
          notes: 'Pedido recebido via webhook MP — verifique no painel do Mercado Pago',
        };
        orders.unshift(newOrder);
        writeData('orders.json', orders);
        console.log(`✅ Pedido salvo: ${newOrder.id}`);
      }
    } catch(e) { console.error('Erro ao salvar pedido:', e.message); }
  }

  res.status(200).send('OK');
});

// ============================================================
// Inicia o servidor
// ============================================================

// Sitemap dinamico

app.get('/produto/:slug', function(req, res) {
  const slug     = req.params.slug;
  const products = readData('products.json');
  const product  = products.find(p => p.id === slug);

  // Sem produto: serve o HTML estático (JS mostrara "Produto nao encontrado")
  if (!product) return res.sendFile(path.join(__dirname, 'product.html'));

  const baseUrl = process.env.BASE_URL || 'https://topfoodembalagens.com.br';
  const img     = (product.images && product.images[0]) || product.image || '';
  const imgUrl  = img ? (img.startsWith('http') ? img : baseUrl + '/' + img) : '';
  const desc    = (product.description || product.name || '').replace(/"/g, '&quot;').slice(0, 160);
  const title   = (product.name || 'Produto').replace(/"/g, '&quot;');

  try {
    let html = fs.readFileSync(path.join(__dirname, 'product.html'), 'utf8');
    // Titulo
    html = html.replace(
      '<title>Produto — TopFood Embalagens</title>',
      '<title>' + title + ' — TopFood Embalagens</title>'
    );
    // OG title
    html = html.replace(
      'content="TopFood Embalagens - Produtos"',
      'content="' + title + ' — TopFood Embalagens"'
    );
    // OG description
    html = html.replace(
      'content="Embalagens food service para pastel, churros, hamburguer e fritas. Entrega para todo Brasil!"',
      'content="' + desc + '"'
    );
    // OG url
    html = html.replace(
      'content="https://topfoodembalagens.com.br/product.html"',
      'content="' + baseUrl + '/produto/' + slug + '"'
    );
    // OG image (injeta apos og:type)
    if (imgUrl) {
      html = html.replace(
        '<meta property="og:type" content="website" />',
        '<meta property="og:type" content="website" />\n  <meta property="og:image" content="' + imgUrl + '" />\n  <meta property="og:image:width" content="800" />\n  <meta property="og:image:height" content="800" />'
      );
    }
    // Schema.org JSON-LD (injeta antes de </head>)
    const minPrice = product.variants && product.variants.length
      ? Math.min(...product.variants.map(v => v.price))
      : 0;
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.name,
      "description": product.description || product.name,
      "image": imgUrl || undefined,
      "brand": { "@type": "Brand", "name": "TopFood Embalagens" },
      "offers": {
        "@type": "Offer",
        "priceCurrency": "BRL",
        "price": String(minPrice),
        "availability": "https://schema.org/InStock",
        "seller": { "@type": "Organization", "name": "TopFood Embalagens" }
      }
    });
    html = html.replace(
      '</head>',
      '<script type="application/ld+json">' + schema + '</script>\n</head>'
    );
    res.send(html);
  } catch(e) {
    console.error('Erro ao injetar OG tags:', e.message);
    res.sendFile(path.join(__dirname, 'product.html'));
  }
});
// ─────────────────────────────────────────────
//  SITEMAP DINÂMICO — atualiza automaticamente
//  conforme produtos forem adicionados/removidos
// ─────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const products  = readData('products.json').filter(p => p.active !== false);
  const settings  = readData('settings.json') || {};
  const baseUrl   = process.env.BASE_URL || 'https://topfoodembalagens.com.br';
  const now       = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Codifica URL de imagem substituindo espaços por %20
  function encodeImgUrl(url) {
    return url.replace(/ /g, '%20');
  }

  // Monta uma tag <url> completa
  function urlTag({ loc, lastmod, changefreq, priority, images = [] }) {
    const imgTags = images
      .filter(Boolean)
      .map(src => {
        const full = src.startsWith('http') ? src : baseUrl + '/' + src;
        return `<image:image><image:loc>${encodeImgUrl(full)}</image:loc></image:image>`;
      })
      .join('');
    return (
      `<url>` +
      `<loc>${loc}</loc>` +
      `<lastmod>${lastmod || now}</lastmod>` +
      `<changefreq>${changefreq}</changefreq>` +
      `<priority>${priority}</priority>` +
      imgTags +
      `</url>`
    );
  }

  const urls = [];

  // ── Páginas estáticas ──────────────────────
  urls.push(urlTag({ loc: baseUrl + '/',              changefreq: 'weekly',  priority: '1.0' }));
  urls.push(urlTag({ loc: baseUrl + '/sobre.html',    changefreq: 'monthly', priority: '0.5' }));
  urls.push(urlTag({ loc: baseUrl + '/contato.html',  changefreq: 'monthly', priority: '0.5' }));
  urls.push(urlTag({ loc: baseUrl + '/entrega.html',  changefreq: 'monthly', priority: '0.5' }));
  urls.push(urlTag({ loc: baseUrl + '/privacidade.html', changefreq: 'yearly', priority: '0.3' }));
  urls.push(urlTag({ loc: baseUrl + '/termos.html',   changefreq: 'yearly',  priority: '0.3' }));

  // ── Produtos dinâmicos (lidos do products.json em tempo real) ──
  products.forEach(p => {
    const imgs = [];
    // Suporta array de imagens ou imagem única
    if (Array.isArray(p.images) && p.images.length) {
      p.images.forEach(i => imgs.push(i));
    } else if (p.image) {
      imgs.push(p.image);
    }
    // Data de atualização do produto (se existir) ou data atual
    const lastmod = p.updatedAt
      ? new Date(p.updatedAt).toISOString().split('T')[0]
      : now;
    urls.push(urlTag({
      loc:        baseUrl + '/produto/' + encodeURIComponent(p.id),
      lastmod,
      changefreq: 'weekly',
      priority:   '0.8',
      images:     imgs,
    }));
  });

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset\n' +
    '  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    urls.join('\n') + '\n' +
    '</urlset>';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // cache 1h no browser/CDN
  res.send(xml);
});

// ─────────────────────────────────────────────
//  ROBOTS.TXT — orienta os robôs de busca
// ─────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.BASE_URL || 'https://topfoodembalagens.com.br';
  const robots = [
    '# TopFood Embalagens — robots.txt',
    '# Gerado automaticamente pelo servidor',
    '',
    'User-agent: Googlebot',
    'Allow: /',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Bloquear área administrativa e APIs internas',
    'Disallow: /admin.html',
    'Disallow: /api/',
    'Disallow: /data/',
    'Disallow: /failure.html',
    'Disallow: /pending.html',
    'Disallow: /success.html',
    '',
    '# Bloquear parâmetros de sessão/carrinho',
    'Disallow: /*?cart=*',
    'Disallow: /*?token=*',
    'Disallow: /*?session=*',
    '',
    '# Sitemap',
    'Sitemap: ' + baseUrl + '/sitemap.xml',
    '',
    '# Googlebot rastreia sem restrição de velocidade',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h
  res.send(robots);
});

// ─── Registrar módulos ────────────────────────────────────────────────────
registerAuthRoutes(app);
registerFeedRoutes(app);
registerBudgetRoutes(app, requireAuth, requireOwner);
registerBackupRoutes(app, requireOwner);
registerAsaasRoutes(app, requireAuth, requireOwner);
registerAtendenteRoutes(app, requireAuth);

// Limpar blacklist e reservas expiradas a cada 30min
setInterval(() => { try { cleanBlacklist(); releaseExpiredReservations(); } catch(e){} }, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('  🍔 TopFood Embalagens — Servidor');
  console.log('══════════════════════════════════════════════');
  console.log(`  🌐 Loja:       http://localhost:${PORT}`);
  console.log(`  📊 Dashboard:  http://localhost:${PORT}/admin.html`);
  console.log(`  🔑 MP Token:   ${process.env.MP_ACCESS_TOKEN ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
  console.log('══════════════════════════════════════════════\n');
});
