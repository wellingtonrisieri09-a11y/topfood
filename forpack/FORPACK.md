# Forpack Embalagens — site de embalagens **metalizadas**

O Forpack roda na mesma VPS do TopFood, **sem encostar nele**: outro processo,
outra porta, outro banco, outro domínio. Mexer num não derruba o outro.

Ele **reaproveita o motor** do TopFood (checkout, PIX/Asaas, cartão, NF-e,
frete, painel admin, feeds, IA atendente) e **troca tudo que é de marca**:
paleta metalizada, logo, banners, textos de venda, SEO e catálogo próprio.

| | TopFood | Forpack |
|---|---------|---------|
| Domínio | topfoodembalagens.com.br | forpackembalagens.com.br |
| Nicho | embalagens food service | **embalagens metalizadas** |
| Porta | 3000 | **3002** |
| Processo pm2 | `topfood` | `forpack` |
| Pasta | `/var/www/topfood` | `/var/www/forpack` |
| Banco | `data/topfood.db` | `data/forpack.db` (independente) |
| Identidade | vermelho + preto | **grafite + prata escovada + aço polido** |

## Subir o site (uma vez, na VPS)

```bash
chmod +x /var/www/topfood/forpack/clonar-forpack.sh
/var/www/topfood/forpack/clonar-forpack.sh
```

O script faz tudo em 8 passos: copia o motor, troca o nome, instala as artes
da Forpack, cria o `.env` próprio (porta 3002 + domínio), copia o banco,
instala dependências, **aplica a marca** (paleta, textos, SEO, pixels),
**carrega o catálogo metalizado** e sobe o processo `forpack` no pm2.
No fim ele mostra os 3 passos de domínio (DNS, nginx, HTTPS).

## Atualizar o Forpack com melhorias do TopFood

Rode o mesmo script de novo. Ele re-copia o motor e **reaplica a marca e o
catálogo por cima** — o banco, os pedidos, os preços que você corrigiu e o
`.env` do Forpack ficam intactos.

Para acompanhar o TopFood automaticamente (em até 10 min), no `crontab -e`:

```
*/10 * * * * /var/www/topfood/forpack/clonar-forpack.sh --auto >> /var/log/forpack-clone.log 2>&1
```

## ⚠️ REVISAR ANTES DE DIVULGAR

Estes quatro pontos são os que fazem diferença em dinheiro e em dado:

1. **Preços e medidas são PROVISÓRIOS.**
   O catálogo (`produtos-forpack.json`) nasce com preços de partida e **sem as
   medidas em mm** — elas não vieram da ficha técnica da gráfica parceira.
   Confira produto por produto em `/admin.html` → Produtos **antes de anunciar**.
   Depois que você editar no painel, o script de atualização **não** sobrescreve
   mais (só com `node forpack/seed-forpack.js --forcar`).

2. **Fotos das embalagens.** As imagens de produto e os banners são
   ilustrações vetoriais da marca — bonitas e coerentes, mas não são as fotos
   reais. Quando as fotos da linha metalizada chegarem, suba em
   `/admin.html` → Produtos, ou coloque em
   `/var/www/forpack-personalizacao/images/produtos/` (esse diretório é copiado
   por cima a cada atualização, então a sua personalização nunca se perde).

3. **Pagamento.** O `.env` nasce com as MESMAS chaves do TopFood (Asaas,
   Mercado Pago): **as vendas do Forpack caem na conta do TopFood** até você
   trocar. Para separar o caixa, crie contas próprias, troque as chaves em
   `/var/www/forpack/.env` e `pm2 restart forpack`.
   **Webhook**: cadastre no painel de cada provedor TAMBÉM a URL do Forpack
   (`https://forpackembalagens.com.br/api/asaas/webhook`, `/api/pix-webhook`,
   `/api/webhook`) — senão a confirmação automática de PIX só chega no TopFood.

4. **WhatsApp e redes.** Sem `FORPACK_WHATSAPP` no `.env`, o site inteiro usa o
   número do TopFood. Preencha no `.env` e rode o script de novo:

   ```
   FORPACK_WHATSAPP=5511XXXXXXXXX
   FORPACK_EMAIL=contato@forpackembalagens.com.br
   FORPACK_INSTAGRAM=https://www.instagram.com/forpackembalagens/
   FORPACK_PIX_KEY=
   ```

## O que o kit já resolve sozinho

- **Pixels separados.** O GTM, GA4, Meta Pixel e TikTok do TopFood são
  **removidos** do HTML e limpos do banco. Sem isso, os dois sites mediriam e
  fariam remarketing na mesma conta, sujando o ROAS dos dois. Cadastre os IDs
  próprios da Forpack em `/admin.html` → Configurações.
- **Depoimentos ocultos.** O bloco "mais de 500 restaurantes confiam" é do
  TopFood; num site novo seria propaganda enganosa. A seção sai do ar até
  existir avaliação real de cliente Forpack — para reativar, remova o
  `display:none` da seção `#depoimentos` no `index.html`.
- **CORS.** O `ALLOWED_ORIGINS` herdado é reescrito para o domínio do Forpack
  (sem isso, o próprio site levaria erro no carrinho e no cálculo de frete).
- **SEO próprio.** Título, descrição, palavras-chave, Open Graph e o bloco de
  texto que o Google lê sem JS foram reescritos para "embalagem metalizada".
  Cadastre o domínio no Google Search Console quando estiver no ar.

## Peças do kit

| Arquivo | Função |
|---------|--------|
| `clonar-forpack.sh` | Orquestra tudo (criar / atualizar o site na VPS) |
| `aplicar-marca.js` | Paleta metalizada, artes, textos, SEO e remoção de pixels. **Idempotente** |
| `seed-forpack.js` | Carrega o catálogo e a identidade da loja no banco (não sobrescreve o que você editou) |
| `produtos-forpack.json` | Os 8 produtos da linha metalizada |
| `gerar-artes.js` | Regenera logo, banners, fotos-ilustração e OG (`node forpack/gerar-artes.js`) |
| `site/` | Tudo que é copiado por cima do motor: tema CSS + imagens da marca |
| `nginx-forpackembalagens.com.br.conf` | Virtual host do domínio |

### Mexer no visual
A identidade inteira está em `site/forpack-theme.css` (tokens no `:root`) e no
mapa de cores `PALETA` do `aplicar-marca.js`. O CSS herdado do TopFood tem muito
estilo inline — por isso as **cores chapadas** são trocadas no arquivo pelo
`aplicar-marca.js`, e os **brilhos** (gradientes, reflexos) ficam no tema.

### Quando o TopFood mudar de HTML
O `aplicar-marca.js` lista no fim toda regra que **não encontrou** o texto
esperado (marcada com `!`). Se aparecer `!`, é sinal de que uma melhoria do
TopFood mexeu naquele trecho e a regra precisa de ajuste. Rode
`node forpack/aplicar-marca.js --dry` para simular sem gravar.

## Catálogo metalizado (8 produtos)

Pastel · Churros · Hambúrguer artesanal · Batata frita 200 g (delivery) ·
Batata de balcão · Espetinho · Hot dog · Porções e frango frito.
Todos em pacotes de 50, 100 e 250 unidades.

## Avisos que continuam valendo

- **Senha do admin** nasce igual à do TopFood (o banco é uma cópia). Troque em
  `ADMIN_PASSWORD` no `.env` do Forpack.
- **IA Atendente (WhatsApp)**: não conecte o MESMO número nos dois sites — um
  derruba a sessão do outro. Use um número próprio ou deixe desligado.
- **Pedidos antigos**: o banco é cópia, então o Forpack nasce com o histórico
  do TopFood. Não atrapalha; se quiser começar zerado, limpe no painel.
