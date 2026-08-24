#!/usr/bin/env bash
# ============================================================
# Cria/atualiza o site da FORPACK EMBALAGENS (embalagens
# metalizadas) a partir do código do TopFood, na mesma VPS,
# SEM tocar no TopFood — ele continua no ar o tempo todo.
#
# O Forpack reaproveita o MOTOR do TopFood (checkout, PIX,
# NF-e, admin, frete) e troca tudo que é de marca: paleta
# metalizada, logo, banners, textos e catálogo próprio.
#
# 1ª vez  : cria /var/www/forpack completo (código + banco + pm2)
# Depois  : rode de novo p/ levar as melhorias do TopFood pro Forpack
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

echo ">> 1/8 copiando o motor do TopFood (sem banco, sem .env — cada site tem o seu)"
rsync -a --delete \
  --exclude 'data/' --exclude '.env' --exclude 'node_modules/' \
  --exclude '.git/' --exclude 'uploads/' --exclude '.topfood-rev' \
  "$ORIGEM/" "$DESTINO/"
# o deploy.sh é do TopFood; o kit forpack/ FICA (o clone precisa dele
# para reaplicar marca e catálogo a cada atualização)
rm -rf "$DESTINO/deploy.sh"

echo ">> 2/8 trocando o nome: TopFood → Forpack (em todos os textos)"
# o kit forpack/ fica de fora: ele já é escrito para a Forpack e cita o
# TopFood de propósito (comentários, nomes de variável) — renomear ali
# só deixaria o código mentindo sobre o que faz.
grep -rlIE 'TopFood|topfood|TOPFOOD|Top Food' "$DESTINO" 2>/dev/null \
  | grep -v "^$DESTINO/forpack/" | while read -r f; do
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

echo ">> 3/8 instalando as artes da Forpack (logo, banners, fotos, tema)"
cp -r "$DESTINO/forpack/site/." "$DESTINO/"

# personalizações que sobrevivem às atualizações (fotos de estúdio das
# embalagens, logo definitivo): tudo que estiver em
# /var/www/forpack-personalizacao é copiado por cima, por último
if [ -d /var/www/forpack-personalizacao ]; then
  echo "   aplicando personalizações de /var/www/forpack-personalizacao"
  cp -r /var/www/forpack-personalizacao/. "$DESTINO/"
fi

if $PRIMEIRA_VEZ; then
  echo ">> 4/8 criando o .env do Forpack (base no do TopFood, porta e URL próprias)"
  if [ -f "$ORIGEM/.env" ]; then cp "$ORIGEM/.env" "$DESTINO/.env"; else touch "$DESTINO/.env"; fi
  sed -i '/^PORT=/d;/^BASE_URL=/d' "$DESTINO/.env"
  # o .env é copiado DEPOIS do passo 2, então o domínio ainda é o do TopFood.
  # Sem isto o ALLOWED_ORIGINS libera o domínio errado e o CORS derruba as
  # chamadas do próprio site (carrinho, frete, ping).
  sed -i "s/topfoodembalagens\.com\.br/${DOMINIO}/g" "$DESTINO/.env"
  { echo "PORT=${PORTA}"; echo "BASE_URL=https://${DOMINIO}";
    echo "# Dados próprios da Forpack — preencha e rode o script de novo:";
    echo "# FORPACK_WHATSAPP=55119XXXXXXXX";
    echo "# FORPACK_EMAIL=contato@${DOMINIO}";
    echo "# FORPACK_INSTAGRAM=https://www.instagram.com/forpackembalagens/";
    echo "# FORPACK_PIX_KEY=";
  } >> "$DESTINO/.env"
  echo "   ⚠ ATENÇÃO: as chaves de pagamento (Asaas/Mercado Pago) vieram do TopFood."
  echo "     As vendas do Forpack cairão na MESMA conta até você trocar as chaves no .env."

  echo ">> 5/8 copiando o banco (estrutura, usuários e configurações do TopFood)"
  mkdir -p "$DESTINO/data"
  ( cd "$ORIGEM" && node -e "
    new (require('better-sqlite3'))('data/topfood.db')
      .backup('$DESTINO/data/forpack.db')
      .then(() => console.log('   banco copiado'));
  " )
else
  echo ">> 4/8 .env do Forpack preservado (não é tocado nas atualizações)"
  echo ">> 5/8 banco do Forpack preservado (pedidos, preços e configurações intactos)"
fi

echo ">> 6/8 dependências"
cd "$DESTINO"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm install --legacy-peer-deps --no-audit --no-fund
  touch node_modules
fi

echo ">> 7/8 aplicando a marca Forpack (paleta metalizada, artes, textos, pixels)"
node forpack/aplicar-marca.js
echo "   catálogo metalizado:"
node forpack/seed-forpack.js

echo ">> 8/8 subindo/reiniciando SÓ o processo forpack (TopFood intocado)"
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
  echo "     sudo cp $DESTINO/forpack/nginx-forpackembalagens.com.br.conf /etc/nginx/sites-available/${DOMINIO}"
  echo "     sudo ln -sf /etc/nginx/sites-available/${DOMINIO} /etc/nginx/sites-enabled/"
  echo "     sudo nginx -t && sudo systemctl reload nginx"
  echo "  3. HTTPS: sudo certbot --nginx -d ${DOMINIO} -d www.${DOMINIO}"
  echo ""
  echo "Leia o $DESTINO/forpack/FORPACK.md — tem o que revisar ANTES de divulgar"
  echo "(preços provisórios, WhatsApp próprio, webhooks e pixels)."
fi
