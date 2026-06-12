// Contador de online real — ping anônimo a cada 30s enquanto a aba está aberta.
// Sem cookies e sem dados pessoais: só um id aleatório que morre ao fechar a aba.
(function () {
  try {
    var id = sessionStorage.getItem('tf_vid');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('tf_vid', id);
    }
    function ping() {
      if (document.hidden) return; // aba em segundo plano não conta
      fetch('/api/ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id }),
        keepalive: true
      }).catch(function () {});
    }
    ping();
    setInterval(ping, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) ping(); });
  } catch (e) {}
})();
