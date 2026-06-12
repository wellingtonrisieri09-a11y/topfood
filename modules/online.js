// ============================================================
// Contador de visitantes online REAL
// O site manda ping anônimo a cada 30s (online.js no front);
// aqui contamos visitantes únicos vistos nos últimos 5 minutos.
// Sem cookies, sem dados pessoais — só um id aleatório de sessão.
// ============================================================

const WINDOW_MS = 5 * 60 * 1000;
const visitors = new Map(); // id -> último ping

function registerOnlineRoutes(app, requireAuth) {
  // público — chamado pelo site
  app.post('/api/ping', (req, res) => {
    const id = String((req.body && req.body.id) || '').slice(0, 40);
    if (/^[a-z0-9]{8,40}$/i.test(id)) visitors.set(id, Date.now());
    res.json({ ok: true });
  });

  // painel admin — visitantes únicos nos últimos 5 min
  app.get('/api/eco/online', requireAuth, (req, res) => {
    const now = Date.now();
    let n = 0;
    for (const [id, ts] of visitors) {
      if (now - ts > WINDOW_MS) visitors.delete(id);
      else n++;
    }
    res.json({ online: n });
  });

  console.log('[Online] Contador real registrado: POST /api/ping + GET /api/eco/online');
}

module.exports = { registerOnlineRoutes };
