// db.js — camada SQLite com interface compatível com os helpers JSON originais
// Usa WAL mode, transações e índices. Todas as rotas existentes funcionam sem mudança.
require("dotenv").config();
const Database = require("better-sqlite3");
const path = require("path");
const fs   = require("fs");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "data", "topfood.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// Schema de documento (raw_data) + colunas indexadas para queries
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  active INTEGER DEFAULT 1,
  stock INTEGER DEFAULT 70000,
  raw_data TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'novo',
  payment_status TEXT DEFAULT 'pending',
  customer_email TEXT,
  total REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  raw_data TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  active INTEGER DEFAULT 1,
  raw_data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  active INTEGER DEFAULT 1,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  last_login TEXT,
  last_login_ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_leads (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT, user_name TEXT, action TEXT NOT NULL,
  resource TEXT, resource_id TEXT, detail TEXT, ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stock_reservations (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, variant_units INTEGER,
  qty INTEGER NOT NULL, order_id TEXT, status TEXT DEFAULT 'reserved',
  expires_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS budget_config (
  platform TEXT PRIMARY KEY, monthly_budget REAL DEFAULT 0,
  current_spend REAL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS session_blacklist (
  token TEXT PRIMARY KEY, blacklisted_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  raw_data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email    ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at);
`);

// ─── Mapeamento arquivo→tabela ───────────────────────────────
const TABLE_MAP = {
  "products.json":         "products",
  "orders.json":           "orders",
  "customers.json":        "customers",
  "abandoned.json":        "abandoned_carts",
  "coupons.json":          "coupons",
  "users.json":            "users",
  "contact_messages.json": "contact_messages",
  "empresas.json":         "empresas",
  "newsletter_leads.json": null,
};

function readData(file) {
  if (file === "newsletter_leads.json") {
    return db.prepare("SELECT email,source,created_at FROM newsletter_leads").all();
  }
  if (file === "settings.json") return readSettings();
  const table = TABLE_MAP[file];
  if (!table) return [];
  if (table === "users") {
    return db.prepare("SELECT * FROM users WHERE active=1 ORDER BY rowid").all().map(r => {
      const base = JSON.parse(r.raw_data || "{}");
      return { ...base, id:r.id, username:r.username, password_hash:r.password_hash,
               role:r.role, active:!!r.active, totp_secret:r.totp_secret,
               totp_enabled:!!r.totp_enabled, last_login:r.last_login,
               last_login_ip:r.last_login_ip, created_at:r.created_at };
    });
  }
  return db.prepare("SELECT raw_data FROM " + table + " ORDER BY rowid").all()
    .map(r => { try { return JSON.parse(r.raw_data); } catch { return null; } })
    .filter(Boolean);
}

function writeData(file, data) {
  if (file === "settings.json") {
    if (Array.isArray(data) || typeof data !== "object") return;
    db.transaction(() => {
      Object.entries(data).forEach(([k,v]) => {
        db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(k, typeof v==="string"?v:JSON.stringify(v));
      });
    })();
    return;
  }
  const table = TABLE_MAP[file];
  if (!table) return;
  if (!Array.isArray(data)) return;

  if (table === "users") {
    db.transaction(() => {
      db.prepare("DELETE FROM users").run();
      const ins = db.prepare("INSERT OR REPLACE INTO users (id,username,password_hash,role,active,totp_secret,totp_enabled,last_login,last_login_ip,created_at,raw_data) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
      data.forEach(u => {
        const raw = JSON.stringify(u);
        ins.run(u.id,u.username,u.password_hash,u.role||"admin",u.active===false?0:1,
                u.totp_secret||null,u.totp_enabled?1:0,u.last_login||null,
                u.last_login_ip||null,u.created_at||new Date().toISOString(),raw);
      });
    })();
    return;
  }

  if (table === "products") {
    db.transaction(() => {
      db.prepare("DELETE FROM products").run();
      const ins = db.prepare("INSERT OR REPLACE INTO products (id,active,stock,sort_order,raw_data) VALUES (?,?,?,?,?)");
      data.forEach(p => {
        ins.run(p.id,p.active===false?0:1,parseInt(p.stock)||70000,p.sort_order||0,JSON.stringify(p));
      });
    })();
    return;
  }

  if (table === "orders") {
    db.transaction(() => {
      db.prepare("DELETE FROM orders").run();
      const ins = db.prepare("INSERT OR REPLACE INTO orders (id,status,payment_status,customer_email,total,created_at,raw_data) VALUES (?,?,?,?,?,?,?)");
      data.forEach(o => {
        const email = (o.customer&&o.customer.email) || o.customer_email || null;
        ins.run(o.id,o.status||"novo",o.payment_status||"pending",email,
                parseFloat(o.total||0),o.created_at||new Date().toISOString(),JSON.stringify(o));
      });
    })();
    return;
  }

  if (table === "customers") {
    db.transaction(() => {
      db.prepare("DELETE FROM customers").run();
      const ins = db.prepare("INSERT OR REPLACE INTO customers (id,email,raw_data,updated_at) VALUES (?,?,?,?)");
      data.forEach(c => {
        ins.run(c.id,c.email||null,JSON.stringify(c),new Date().toISOString());
      });
    })();
    return;
  }

  // Generic fallback (abandoned_carts, coupons, contact_messages)
  db.transaction(() => {
    db.prepare("DELETE FROM " + table).run();
    const cols = table === "abandoned_carts" ? "(id,created_at,raw_data)" :
                 table === "coupons" ? "(id,code,active,raw_data)" :
                 table === "contact_messages" ? "(id,read,created_at,raw_data)" : "(id,raw_data)";
    const vals = table === "abandoned_carts" ? "VALUES (?,?,?)" :
                 table === "coupons" ? "VALUES (?,?,?,?)" :
                 table === "contact_messages" ? "VALUES (?,?,?,?)" : "VALUES (?,?)";
    const ins = db.prepare("INSERT OR REPLACE INTO " + table + " " + cols + " " + vals);
    data.forEach(item => {
      if (table === "abandoned_carts")
        ins.run(item.id,item.created_at||new Date().toISOString(),JSON.stringify(item));
      else if (table === "coupons")
        ins.run(item.id,item.code,item.active===false?0:1,JSON.stringify(item));
      else if (table === "contact_messages")
        ins.run(item.id,item.read?1:0,item.created_at||new Date().toISOString(),JSON.stringify(item));
      else
        ins.run(item.id,JSON.stringify(item));
    });
  })();
}

function readSettings() {
  const rows = db.prepare("SELECT key,value FROM settings").all();
  const obj = {};
  rows.forEach(r => {
    try { obj[r.key] = JSON.parse(r.value); }
    catch { obj[r.key] = r.value; }
  });
  return obj;
}

function auditLog(userId, userName, action, resource, resourceId, detail, ip) {
  try {
    db.prepare("INSERT INTO audit_log (user_id,user_name,action,resource,resource_id,detail,ip) VALUES (?,?,?,?,?,?,?)")
      .run(userId||null, userName||null, action, resource||null, resourceId||null, detail||null, ip||null);
  } catch {}
}

// Reserva de estoque anti-oversell
function reserveStock(productId, variantUnits, qty, orderId, ttlMinutes=30) {
  const expiresAt = new Date(Date.now() + ttlMinutes*60*1000).toISOString();
  const id = "RES-" + crypto.randomBytes(6).toString("hex");
  db.prepare("INSERT INTO stock_reservations (id,product_id,variant_units,qty,order_id,status,expires_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, productId, variantUnits, qty, orderId||null, "reserved", expiresAt);
  return id;
}
function releaseExpiredReservations() {
  db.prepare("DELETE FROM stock_reservations WHERE status='reserved' AND expires_at < datetime('now')").run();
}
function confirmReservation(reservationId, orderId) {
  db.prepare("UPDATE stock_reservations SET status='confirmed', order_id=? WHERE id=?").run(orderId, reservationId);
}

// Sessão blacklist
function blacklistToken(token) {
  try { db.prepare("INSERT OR IGNORE INTO session_blacklist (token) VALUES (?)").run(token); } catch {}
}
function isTokenBlacklisted(token) {
  return !!db.prepare("SELECT 1 FROM session_blacklist WHERE token=?").get(token);
}
function cleanBlacklist() {
  db.prepare("DELETE FROM session_blacklist WHERE blacklisted_at < datetime('now', '-1 day')").run();
}

// Budget helpers
function getBudgets() {
  const rows = db.prepare("SELECT * FROM budget_config").all();
  if (!rows.length) {
    ["google","meta","tiktok"].forEach(p => {
      db.prepare("INSERT OR IGNORE INTO budget_config (platform,monthly_budget) VALUES (?,?)").run(p, p==="tiktok"?0:1000);
    });
    return db.prepare("SELECT * FROM budget_config").all();
  }
  return rows;
}
function updateBudgetSpend(platform, amount) {
  db.prepare("UPDATE budget_config SET current_spend=current_spend+?, updated_at=CURRENT_TIMESTAMP WHERE platform=?").run(amount, platform);
}
function setBudget(platform, monthlyBudget) {
  db.prepare("INSERT OR REPLACE INTO budget_config (platform,monthly_budget,current_spend) VALUES (?,?,0)").run(platform, monthlyBudget);
}

// Migrar produtos existentes do JSON backup para o novo schema se banco estiver vazio
function migrateFromJSON() {
  const count = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
  if (count > 0) return;
  const backupDirs = require("fs").readdirSync(path.join(__dirname,"data")).filter(d => d.startsWith("backup_pre_sqlite_"));
  if (!backupDirs.length) return;
  const latest = backupDirs.sort().pop();
  const jsonPath = path.join(__dirname,"data",latest,"products.json");
  if (!require("fs").existsSync(jsonPath)) return;
  try {
    const products = JSON.parse(require("fs").readFileSync(jsonPath,"utf8"));
    writeData("products.json", products);
    console.log("Auto-migrated", products.length, "products from backup");
  } catch {}
}
migrateFromJSON();

module.exports = { db, readData, writeData, readSettings, auditLog, reserveStock, releaseExpiredReservations, confirmReservation, blacklistToken, isTokenBlacklisted, cleanBlacklist, getBudgets, updateBudgetSpend, setBudget };