#!/usr/bin/env bash
# ============================================================
# Auto-deploy do TopFood — roda na VPS, chamado pelo cron.
# A cada poucos minutos checa se há push novo na main do GitHub.
# Se houver, atualiza o site e reinicia SÓ o app topfood.
# Sem secrets, sem GitHub Actions — usa a chave SSH que a VPS
# já tem pra falar com o GitHub.
# ============================================================
set -e
cd /var/www/topfood

BEFORE=$(git rev-parse HEAD)
git fetch origin main --quiet
AFTER=$(git rev-parse origin/main)

# Nada novo? sai sem fazer nada (não reinicia o site à toa)
[ "$BEFORE" = "$AFTER" ] && exit 0

echo "$(date '+%F %T') >> deploy $BEFORE -> $AFTER"
git reset --hard origin/main            # data/ é gitignored, o banco fica intacto

# Só instala dependências se o package-lock mudou
if ! git diff --quiet "$BEFORE" "$AFTER" -- package-lock.json; then
  echo "  package-lock mudou — npm install"
  npm install --legacy-peer-deps --no-audit --no-fund
fi

pm2 restart topfood >/dev/null && pm2 save >/dev/null
echo "$(date '+%F %T') >> ok, no ar"
