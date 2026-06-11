// modules/backup.js — Backup diário SQLite com node-cron
const path   = require("path");
const fs     = require("fs");
const cron   = require("node-cron");

const DB_PATH     = path.join(__dirname, "../data/topfood.db");
const BACKUP_DIR  = path.join(__dirname, "../data/backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function runBackup() {
  try {
    ensureBackupDir();
    const ts     = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest   = path.join(BACKUP_DIR, `topfood-${ts}.db`);
    fs.copyFileSync(DB_PATH, dest);

    // Manter apenas os 7 backups mais recentes
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("topfood-") && f.endsWith(".db"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    files.slice(7).forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch(e){}
    });

    console.log(`[backup] OK: ${dest} (${files.length} backup(s) após limpeza)`);
    return { ok: true, file: dest };
  } catch(e) {
    console.error("[backup] ERRO:", e.message);
    return { ok: false, error: e.message };
  }
}

function registerBackupRoutes(app, requireOwner) {
  // Backup manual — owner only
  app.post("/api/eco/backup/run", requireOwner, (req, res) => {
    const result = runBackup();
    res.json(result);
  });

  // Listar backups disponíveis
  app.get("/api/eco/backup/list", requireOwner, (req, res) => {
    try {
      ensureBackupDir();
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith("topfood-") && f.endsWith(".db"))
        .map(f => {
          const stat = fs.statSync(path.join(BACKUP_DIR, f));
          return { name: f, size_kb: Math.round(stat.size / 1024), created_at: stat.mtime.toISOString() };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.json({ ok: true, backups: files });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Cron: backup diário às 03:00 (horário do servidor)
  cron.schedule("0 3 * * *", () => {
    console.log("[backup] Iniciando backup automático 03:00...");
    runBackup();
  });

  console.log("✅ Backup registrado: cron 03:00 + /api/eco/backup/*");
}

module.exports = { registerBackupRoutes, runBackup };