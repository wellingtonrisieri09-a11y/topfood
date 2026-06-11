#!/bin/bash
# smoke_test.sh — Teste rápido dos fluxos críticos do TopFood
# Uso: bash /var/www/topfood/smoke_test.sh
# Rodar SEMPRE após qualquer alteração no site.

BASE="https://topfoodembalagens.com.br"
PASS=0; FAIL=0

check() {
  local desc="$1" url="$2" expect="$3" extra="$4"
  local code
  code=$(curl -s -o /tmp/smoke_body -w '%{http_code}' --max-time 10 $extra "$url")
  if [ "$code" = "$expect" ]; then
    echo "✅ $desc ($code)"
    PASS=$((PASS+1))
  else
    echo "❌ $desc — esperado $expect, recebeu $code"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local desc="$1" url="$2" needle="$3"
  if curl -s --max-time 10 "$url" | grep -q "$needle"; then
    echo "✅ $desc"
    PASS=$((PASS+1))
  else
    echo "❌ $desc — '$needle' não encontrado"
    FAIL=$((FAIL+1))
  fi
}

echo "═══ SMOKE TEST TopFood — $(date '+%Y-%m-%d %H:%M') ═══"

# Páginas públicas
check "Home carrega"                "$BASE/"            200
check "Admin redireciona"           "$BASE/admin"       301
check "Admin.html carrega"          "$BASE/admin.html"  200
check "Produto carrega"             "$BASE/product.html" 200

# Conteúdo crítico
check_contains "Meta Pixel presente"     "$BASE/"  "1202105157078230"
check_contains "Google Tag presente"     "$BASE/"  "G-DBS2ZZCBPF"
check_contains "Checkout JS presente"    "$BASE/"  "ckGoStep3"
check_contains "Validação CPF presente"  "$BASE/"  "validarCPF"

# APIs públicas
check "API settings responde"       "$BASE/api/settings"  200
check_contains "PIX key configurada" "$BASE/api/settings" "pix_key"
check "API products responde"       "$BASE/api/products"  200

# APIs protegidas devem recusar sem login
check "API admin/orders protegida"  "$BASE/api/admin/orders"  401
check "API budget protegida"        "$BASE/api/eco/budget"    401

# Segurança
check "server.js bloqueado"         "$BASE/server.js"      404
check ".env bloqueado"              "$BASE/.env"           404
check "data/ bloqueado"             "$BASE/data/topfood.db" 404
check ".bak bloqueado"              "$BASE/index.html.bak" 404

echo "═══════════════════════════════════"
echo "RESULTADO: $PASS passou, $FAIL falhou"
[ $FAIL -eq 0 ] && echo "🟢 TUDO OK — site saudável" || echo "🔴 ATENÇÃO — investigar falhas acima"
exit $FAIL
