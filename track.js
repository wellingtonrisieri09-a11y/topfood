// M15 — coleta leve de comportamento para a IA Gestora (sem dados pessoais).
// Registra no servidor: termos buscados, produtos vistos e add ao carrinho.
window.TFInsights = (function () {
  function track(type, ref) {
    if (!ref) return;
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: type, ref: String(ref) }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }
  return { track: track };
})();
