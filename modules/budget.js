// modules/budget.js — Módulo 3: Gerenciador de Verbas
const { getBudgets, setBudget, updateBudgetSpend, db } = require("../db");

function registerBudgetRoutes(app, requireAuth, requireOwner) {
  // GET verbas atuais (admin+)
  app.get("/api/eco/budget", requireAuth, (req, res) => {
    try {
      const budgets = getBudgets();
      res.json({ ok: true, budgets });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PUT definir verba (owner only)
  app.put("/api/eco/budget/:platform", requireOwner, (req, res) => {
    try {
      const { platform } = req.params;
      const { monthly_budget } = req.body;
      if (!["google","meta","tiktok"].includes(platform))
        return res.status(400).json({ ok: false, error: "Plataforma inválida" });
      const budget = parseFloat(monthly_budget);
      if (isNaN(budget) || budget < 0)
        return res.status(400).json({ ok: false, error: "Valor inválido" });
      setBudget(platform, budget);
      res.json({ ok: true, platform, monthly_budget: budget });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST registrar gasto (owner/sistema)
  app.post("/api/eco/budget/:platform/spend", requireOwner, (req, res) => {
    try {
      const { platform } = req.params;
      const { amount } = req.body;
      const val = parseFloat(amount);
      if (isNaN(val) || val <= 0)
        return res.status(400).json({ ok: false, error: "Valor inválido" });
      updateBudgetSpend(platform, val);
      res.json({ ok: true, platform, registered: val });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET alerta de verba — retorna plataformas com >80% consumido
  app.get("/api/eco/budget/alerts", requireAuth, (req, res) => {
    try {
      const budgets = getBudgets();
      const alerts = budgets
        .filter(b => b.monthly_budget > 0 && (b.current_spend / b.monthly_budget) >= 0.80)
        .map(b => ({
          platform: b.platform,
          monthly_budget: b.monthly_budget,
          current_spend: b.current_spend,
          pct: Math.round((b.current_spend / b.monthly_budget) * 100),
        }));
      res.json({ ok: true, alerts, has_alerts: alerts.length > 0 });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log("✅ M3 Budget registrado: /api/eco/budget/*");
}

module.exports = { registerBudgetRoutes };