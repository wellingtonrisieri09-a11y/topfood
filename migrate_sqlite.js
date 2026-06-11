const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DATA_DIR = "/var/www/topfood/data";
const DB_PATH  = "/var/www/topfood/data/topfood.db";

const BACKUP_DIR = "/var/www/topfood/data/backup_pre_sqlite_" + Date.now();
fs.mkdirSync(BACKUP_DIR, { recursive: true });
["products.json","orders.json","customers.json","abandoned.json","coupons.json","users.json","settings.json","contact_messages.json","newsletter_leads.json"].forEach(f => {
  const src = path.join(DATA_DIR, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(BACKUP_DIR, f));
});
console.log("BACKUP salvo em:", BACKUP_DIR);

function readJSON(file, fallback) {
  if (fallback === undefined) fallback = [];
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    const txt = fs.readFileSync(p, "utf8").trim();
    if (!txt || txt === "[]" || txt === "{}") return fallback;
    return JSON.parse(txt);
  } catch(e) { return fallback; }
}

const jP = readJSON("products.json");
const jO = readJSON("orders.json");
const jC = readJSON("customers.json");
const jA = readJSON("abandoned.json");
const jCp = readJSON("coupons.json");
const jU = readJSON("users.json");
const jS = readJSON("settings.json", {});

console.log("JSON: products=" + jP.length + " orders=" + jO.length + " customers=" + jC.length + " users=" + jU.length);

if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, DB_PATH + ".bak_" + Date.now());

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT,
  packs TEXT NOT NULL DEFAULT '[]', images TEXT NOT NULL DEFAULT '[]',
  active INTEGER DEFAULT 1, stock INTEGER DEFAULT 70000,
  stock_min INTEGER DEFAULT 50000, stock_reorder INTEGER DEFAULT 100000,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, customer_name TEXT, customer_email TEXT,
  customer_phone TEXT, customer_cpf TEXT, items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, shipping_price REAL DEFAULT 0,
  shipping_method TEXT, shipping_cep TEXT, total REAL NOT NULL DEFAULT 0,
  payment_method TEXT, payment_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'novo', coupon_code TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT, cpf TEXT,
  cep TEXT, address TEXT, city TEXT, state TEXT,
  total_orders INTEGER DEFAULT 0, total_spent REAL DEFAULT 0,
  last_order_at TEXT, rfm_score TEXT DEFAULT 'novo', churn_score INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id TEXT PRIMARY KEY, customer_name TEXT, customer_email TEXT,
  customer_phone TEXT, items TEXT DEFAULT '[]', total REAL DEFAULT 0,
  recovery_sent INTEGER DEFAULT 0, recovered INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT DEFAULT 'percent',
  value REAL DEFAULT 0, min_order REAL DEFAULT 0, max_uses INTEGER DEFAULT 0,
  uses INTEGER DEFAULT 0, active INTEGER DEFAULT 1, expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT DEFAULT 'admin', active INTEGER DEFAULT 1,
  totp_secret TEXT, totp_enabled INTEGER DEFAULT 0,
  last_login TEXT, last_login_ip TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS contact_messages (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, message TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS newsletter_leads (id TEXT PRIMARY KEY, email TEXT UNIQUE, source TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, user_name TEXT, action TEXT NOT NULL, resource TEXT, resource_id TEXT, detail TEXT, ip TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS stock_reservations (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, variant_pack TEXT NOT NULL, qty INTEGER NOT NULL, order_id TEXT, status TEXT DEFAULT 'reserved', expires_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS budget_config (platform TEXT PRIMARY KEY, monthly_budget REAL DEFAULT 0, current_spend REAL DEFAULT 0, currency TEXT DEFAULT 'BRL', updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE TABLE IF NOT EXISTS session_blacklist (token TEXT PRIMARY KEY, blacklisted_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_email    ON orders(customer_email)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at)`);
console.log("Schema criado com CURRENT_TIMESTAMP");

const insP  = db.prepare("INSERT OR REPLACE INTO products (id,name,description,category,packs,images,active,stock,stock_min,stock_reorder,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
const insO  = db.prepare("INSERT OR REPLACE INTO orders (id,customer_name,customer_email,customer_phone,customer_cpf,items,subtotal,discount,shipping_price,shipping_method,shipping_cep,total,payment_method,payment_status,status,coupon_code,utm_source,utm_medium,utm_campaign,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
const insC  = db.prepare("INSERT OR REPLACE INTO customers (id,name,email,phone,cpf,total_orders,total_spent,last_order_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
const insA  = db.prepare("INSERT OR REPLACE INTO abandoned_carts (id,customer_name,customer_email,customer_phone,items,total,recovery_sent,created_at) VALUES (?,?,?,?,?,?,?,?)");
const insCp = db.prepare("INSERT OR REPLACE INTO coupons (id,code,type,value,min_order,max_uses,uses,active,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
const insU  = db.prepare("INSERT OR REPLACE INTO users (id,name,username,password_hash,role,active,last_login,created_at) VALUES (?,?,?,?,?,?,?,?)");
const insSt = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");

db.transaction(() => { jP.forEach(p => { insP.run(p.id||("P-"+Date.now()),p.name||"Produto",p.description||"",p.category||"embalagem",JSON.stringify(p.packs||[]),JSON.stringify(p.images||[]),p.active===false?0:1,70000,50000,100000,p.sort_order||0,p.created_at||new Date().toISOString(),p.updated_at||new Date().toISOString()); }); })();
db.transaction(() => { jO.forEach(o => { const c=o.customer||{}; const s=o.shipping||{}; const u=o.utm||{}; insO.run(o.id,c.name||null,c.email||null,c.phone||null,c.cpf||null,JSON.stringify(o.items||[]),parseFloat(o.subtotal||0),parseFloat(o.discount||0),parseFloat(s.price||0),s.method||null,s.cep||null,parseFloat(o.total||0),o.payment_method||null,o.payment_status||"pending",o.status||"novo",o.coupon_code||null,u.utm_source||null,u.utm_medium||null,u.utm_campaign||null,o.notes||null,o.created_at||new Date().toISOString(),o.updated_at||new Date().toISOString()); }); })();
db.transaction(() => { jC.forEach(c => { insC.run(c.id||("C-"+Date.now()),c.name||null,c.email||null,c.phone||null,c.cpf||null,c.total_orders||0,c.total_spent||0,c.last_order_at||null,c.created_at||new Date().toISOString()); }); })();
db.transaction(() => { jA.forEach(a => { insA.run(a.id||("AB-"+Date.now()),a.name||null,a.email||null,a.phone||null,JSON.stringify(a.items||[]),parseFloat(a.total||0),a.recovery_sent?1:0,a.created_at||new Date().toISOString()); }); })();
db.transaction(() => { jCp.forEach(c => { insCp.run(c.id||("CPN-"+Date.now()),c.code,c.type||"percent",parseFloat(c.value||0),parseFloat(c.min_order||0),parseInt(c.max_uses||0),parseInt(c.uses||0),c.active===false?0:1,c.expires_at||null,c.created_at||new Date().toISOString()); }); })();

db.transaction(() => {
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "topfood2026";
  if (jU.length === 0) {
    const hash = bcrypt.hashSync(ADMIN_PASS, 12);
    insU.run("U-001","Wellington","wellington",hash,"owner",1,null,new Date().toISOString());
    console.log("Owner Wellington criado com bcrypt");
  } else {
    jU.forEach(u => {
      let hash = u.password_hash || "";
      if (hash.length === 64 && /^[a-f0-9]+$/i.test(hash)) {
        hash = bcrypt.hashSync(ADMIN_PASS, 12);
        console.log("Hash SHA-256 do usuario " + u.username + " convertido para bcrypt");
      }
      const role = (u.username === "wellington" || u.role === "admin") ? "owner" : (u.role||"admin");
      insU.run(u.id||"U-001",u.name||"Admin",u.username||"wellington",hash,role,u.active===false?0:1,u.last_login||null,u.created_at||new Date().toISOString());
    });
  }
})();

db.transaction(() => {
  if (jS && typeof jS === "object") {
    Object.entries(jS).forEach(([k,v]) => { insSt.run(k, typeof v === "string" ? v : JSON.stringify(v)); });
  }
})();

db.transaction(() => {
  ["google","meta","tiktok"].forEach(p => {
    db.prepare("INSERT OR IGNORE INTO budget_config (platform,monthly_budget) VALUES (?,?)").run(p, p==="tiktok"?0:1000);
  });
})();

console.log("\nVALIDACAO:");
[["products",jP.length],["orders",jO.length],["customers",jC.length],["coupons",jCp.length]].forEach(([n,exp]) => {
  const got = db.prepare("SELECT COUNT(*) as c FROM " + n).get().c;
  console.log("  " + (exp===got?"OK":"DIVERGENCIA") + " " + n + ": esperado=" + exp + " obtido=" + got);
});
const owner = db.prepare("SELECT username,role,totp_enabled FROM users WHERE role=?").get("owner");
if (owner) console.log("  OK owner: " + owner.username + " role=" + owner.role);
const budgets = db.prepare("SELECT * FROM budget_config").all();
budgets.forEach(b => console.log("  OK budget: " + b.platform + " R$" + b.monthly_budget));
db.close();
console.log("\nMIGRACAO COMPLETA - banco em /var/www/topfood/data/topfood.db");