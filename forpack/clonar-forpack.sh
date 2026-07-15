#!/usr/bin/env bash
# ============================================================
# Clona o TopFood → Forpack Embalagens, na mesma VPS,
# SEM tocar no TopFood (ele continua no ar o tempo todo).
#
# 1ª vez  : cria /var/www/forpack completo (código + banco + pm2)
# Depois  : rode de novo p/ puxar as melhorias do TopFood pro Forpack
# Uso     : /var/www/topfood/forpack/clonar-forpack.sh
#           (com --auto, só faz algo se o TopFood tiver código novo)
# ============================================================
set -e

ORIGEM="/var/www/topfood"
DESTINO="/var/www/forpack"
DOMINIO="forpackembalagens.com.br"     # ← ajuste aqui se o domínio for outro
PORTA="3002"

# --auto (p/ cron): se o TopFood não mudou desde a última clonagem, sai quieto
if [ "$1" = "--auto" ] && [ -f "$DESTINO/.topfood-rev" ]; then
  ATUAL=$(git -C "$ORIGEM" rev-parse HEAD)
  [ "$ATUAL" = "$(cat "$DESTINO/.topfood-rev")" ] && exit 0
fi

# rsync é necessário p/ copiar sem apagar o banco do clone
command -v rsync >/dev/null || { echo "instalando rsync..."; sudo apt-get install -y rsync; }

PRIMEIRA_VEZ=false
[ -d "$DESTINO" ] || PRIMEIRA_VEZ=true
mkdir -p "$DESTINO"

echo ">> 1/6 copiando o código do TopFood (sem banco, sem .env — cada site tem o seu)"
rsync -a --delete \
  --exclude 'data/' --exclude '.env' --exclude 'node_modules/' \
  --exclude '.git/' --exclude 'uploads/' --exclude '.topfood-rev' \
  "$ORIGEM/" "$DESTINO/"
# o deploy.sh e o kit forpack/ são do TopFood — não fazem sentido no clone
rm -rf "$DESTINO/deploy.sh" "$DESTINO/forpack"

echo ">> 2/6 trocando a marca: TopFood → Forpack (em todos os textos)"
grep -rlIE 'TopFood|topfood|TOPFOOD|Top Food' "$DESTINO" 2>/dev/null | while read -r f; do
  sed -i \
    -e "s/topfoodembalagens\.com\.br/${DOMINIO}/g" \
    -e "s/Top Food/Forpack/g" \
    -e "s/TopFood/Forpack/g" \
    -e "s/TOPFOOD/FORPACK/g" \
    -e "s/topfood/forpack/g" \
    "$f"
done
# porta própria no pm2 (o sed acima já trocou o nome p/ "forpack" e o cwd p/ /var/www/forpack)
sed -i "s/\"3000\"/\"${PORTA}\"/g" "$DESTINO/ecosystem.config.js"

# personalizações que sobrevivem às atualizações (logo, imagens próprias do Forpack):
# tudo que estiver em /var/www/forpack-personalizacao é copiado por cima no final
if [ -d /var/www/forpack-personalizacao ]; then
  echo ">> aplicando personalizações de /var/www/forpack-personalizacao"
  cp -r /var/www/forpack-personalizacao/. "$DESTINO/"
fi

if $PRIMEIRA_VEZ; then
  echo ">> 3/6 criando o .env do Forpack (base no do TopFood, porta e URL próprias)"
  if [ -f "$ORIGEM/.env" ]; then cp "$ORIGEM/.env" "$DESTINO/.env"; else touch "$DESTINO/.env"; fi
  sed -i '/^PORT=/d;/^BASE_URL=/d' "$DESTINO/.env"
  { echo "PORT=${PORTA}"; echo "BASE_URL=https://${DOMINIO}"; } >> "$DESTINO/.env"
  echo "   ⚠ ATENÇÃO: as chaves de pagamento (Asaas/Mercado Pago) vieram do TopFood."
  echo "     As vendas do Forpack cairão na MESMA conta até você trocar as chaves no .env."

  echo ">> 4/6 copiando o banco (produtos, preços, configurações — tudo do TopFood)"
  mkdir -p "$DESTINO/data"
  ( cd "$ORIGEM" && node -e "
    new (require('better-sqlite3'))('data/topfood.db')
      .backup('$DESTINO/data/forpack.db')
      .then(() => console.log('   banco copiado'));
  " )
  # nome da loja no banco do clone (aparece no site, e-mails, PIX)
  ( cd "$ORIGEM" && node -e "
    const d = new (require('better-sqlite3'))('$DESTINO/data/forpack.db');
    const up = d.prepare(\"INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value\");
    up.run('store_name', JSON.stringify('Forpack Embalagens'));
    up.run('pix_name',   JSON.stringify('Forpack'));
    console.log('   nome da loja no banco: Forpack Embalagens');
  " )
else
  echo ">> 3/6 .env do Forpack preservado (não é tocado nas atualizações)"
  echo ">> 4/6 banco do Forpack preservado (não é tocado nas atualizações)"
fi

echo ">> 5/6 dependências"
cd "$DESTINO"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm install --legacy-peer-deps --no-audit --no-fund
  touch node_modules
fi

echo ">> 6/6 subindo/reiniciando SÓ o processo forpack (TopFood intocado)"
if pm2 describe forpack >/dev/null 2>&1; then
  pm2 restart forpack >/dev/null
else
  pm2 start ecosystem.config.js
fi
pm2 save >/dev/null

git -C "$ORIGEM" rev-parse HEAD > "$DESTINO/.topfood-rev"

echo ""
echo "✅ Forpack no ar na porta ${PORTA} (processo pm2: forpack)"
if $PRIMEIRA_VEZ; then
  echo ""
  echo "Faltam só os passos de domínio (uma vez):"
  echo "  1. DNS: registro A de ${DOMINIO} → IP desta VPS"
  echo "  2. nginx:"
  echo "     sudo cp $ORIGEM/forpack/nginx-forpackembalagens.com.br.conf /etc/nginx/sites-available/${DOMINIO}"
  echo "     sudo ln -sf /etc/nginx/sites-available/${DOMINIO} /etc/nginx/sites-enabled/"
  echo "     sudo nginx -t && sudo systemctl reload nginx"
  echo "  3. HTTPS: sudo certbot --nginx -d ${DOMINIO} -d www.${DOMINIO}"
  echo ""
  echo "Leia o $ORIGEM/forpack/FORPACK.md — tem os avisos importantes (pagamentos, logo, webhooks)."
fi
