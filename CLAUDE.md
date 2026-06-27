# TopFood Embalagens — Instruções para o Claude

## Contexto do projeto
E-commerce de embalagens food service. Dono: Wellington Risieri Correa.
Stack: **Node.js + Express + HTML/CSS/JS puro** (sem framework de front).
Storage: **SQLite** (`better-sqlite3`) em `data/topfood.db` — WAL mode, índices, audit log.
Domínio de produção: `https://topfoodembalagens.com.br`.

> O `db.js` mantém a **interface antiga** dos helpers JSON (`readData`,
> `writeData`, `readSettings`) por cima do SQLite — por isso rotas escritas na
> época dos arquivos JSON continuam funcionando sem alteração. Não existe mais
> leitura/escrita real de `data/*.json` em runtime (só na migração).

## Como iniciar o servidor
```bash
npm install
node migrate_sqlite.js   # 1ª vez: cria/popula o data/topfood.db a partir dos JSON
node server.js
# Loja:  http://localhost:3000
# Admin: http://localhost:3000/admin.html
```
Login admin: usuário `wellington`, senha = `ADMIN_PASSWORD` do `.env`
(padrão `topfood2026`). Owner tem 2FA (TOTP) opcional.

## Arquivos principais
| Arquivo | Função |
|---------|--------|
| `server.js` | Backend Express — núcleo da API REST, registra os módulos |
| `db.js` | Camada SQLite (schema, helpers compatíveis com JSON, audit log, backup) |
| `migrate_sqlite.js` | Migração one-shot dos JSON antigos → `data/topfood.db` |
| `index.html` + `app.js` | Loja completa (front + JS da loja) |
| `product.html` | Página de produto individual (`product.html?id=pastel`) |
| `admin.html` + `admin.js` | Painel administrativo (pedidos, NF-e, etiquetas, eco) |
| `tracking.js` / `track.js` / `online.js` | Pixels/analytics e ping de visitante online |
| `modules/` | Módulos do ecossistema (ver abaixo) |
| `data/topfood.db` | Banco SQLite (gitignored) |
| `data/backups/` | Backups diários do `.db` (node-cron) |

## Módulos (`modules/`)
| Módulo | Função |
|--------|--------|
| `auth.js` | Autenticação: bcrypt + JWT httpOnly + 2FA TOTP (owner), blacklist, audit log. Roles: `owner` > `socio`/`admin`. |
| `asaas.js` | **PIX automático via Asaas** (cobrança + webhook de confirmação + polling de fallback) |
| `nfe.js` | **NF-e via Focus NFe** (homologação/produção, emissão, status, download DANFE) |
| `atendente.js` | **IA Atendente 24h no WhatsApp** (Baileys + Claude API). IA sugere, Wellington aprova: nunca confirma pagamento, nunca dá desconto, nunca fecha pedido. |
| `frete.js` | Tabela de frete por estado (PAC/SEDEX) — usada pela IA p/ montar orçamento + link de checkout |
| `feeds.js` | Feeds de catálogo: Google Shopping, Meta Catalog, TikTok, GMB |
| `seo.js` | SSR da home (injeta produtos no HTML para o Google ler sem JS) |
| `ml.js` | Mercado Livre: OAuth + radar de concorrência |
| `insights.js` | Memória/inteligência do site (buscas, produtos vistos, carrinho) sem PII |
| `online.js` | Contador de visitantes online real (ping anônimo, janela de 5 min) |
| `budget.js` | Gerenciador de verbas de anúncios (por plataforma) + alertas |
| `backup.js` | Backup diário do SQLite (node-cron) |

## API Endpoints (principais)
**Público / loja**
```
GET  /api/settings              ← config pública (PIX, WhatsApp, tracking)
GET  /api/products              ← catálogo público
POST /api/orders                ← salvar pedido → retorna {ok, order_id}
GET  /api/orders/:id/status     ← polling de status (público)
POST /api/pix-charge            ← criar cobrança PIX (Asaas / OpenPix / estático)
POST /api/asaas/credit-card     ← pagamento com cartão (Asaas)
POST /api/checkout              ← preferência Mercado Pago
POST /api/webhook               ← webhook Mercado Pago
POST /api/asaas/webhook         ← webhook Asaas (confirmação PIX automática)
POST /api/contact /api/newsletter
POST /api/ping /api/track       ← visitante online + insights
GET  /produto/:slug · /sitemap.xml · /robots.xml · /feed*.xml
```
**Admin (requer login)**
```
POST /api/admin/login · /logout   GET /api/admin/me
GET  /api/admin/2fa/setup  POST /api/admin/2fa/confirm
PUT  /api/admin/orders/:id        POST /api/admin/orders/:id/pix
PUT  /api/admin/settings          CRUD products/coupons/users/customers
GET  /api/admin/abandoned · newsletter · contact · feeds/status
```
**Ecossistema (`/api/eco/*`, admin/owner)**
```
/api/eco/nfe/*        config · emitir/:orderId · status · danfe
/api/eco/atendente/*  status · start · stop · qr · conversas · config
/api/eco/budget/*     verbas + alerts
/api/eco/ml/*         status · radar
/api/eco/insights     · /api/eco/online · /api/eco/backup/*
```

## Checkout (index.html / app.js)
Modal multi-step: Step1=Itens → Step2=Entrega → Step3=Pagamento → Step4=Concluído.
- `openCheckout()` abre o checkout ANTES de fechar o carrinho (evita flash)
- `closeCart()` não reseta `body.overflow` se checkout estiver aberto
- `saveOrderToServer()` SEMPRE retorna o `order_id` (usado para polling)
- `startPixPolling(orderId)` verifica status a cada 5s por até 30 min
- `showPixConfirmed()` mostra tela de sucesso quando status = 'paid'

## Pagamentos
- **PIX automático (Asaas)** — `ASAAS_API_KEY`: cobrança + confirmação por webhook (preferencial)
- **PIX dinâmico (OpenPix)** — `OPENPIX_APP_ID`: confirmação via webhook (alternativo)
- **PIX estático** — chave em `settings.pix_key`, QR via `api.qrserver.com` (fallback)
- **Cartão (Asaas)** e **Mercado Pago** (`MP_ACCESS_TOKEN`)
- Admin pode confirmar PIX manualmente em pedidos `payment_method==='pix'` e `status==='pending'`

## Variáveis de ambiente (`.env`)
`PORT`, `BASE_URL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`, `JWT_SECRET`, `JWT_EXPIRES`,
`NODE_ENV`, `ALLOWED_ORIGINS`, `EMAIL_HOST/PORT/USER/PASS/FROM`,
`MP_ACCESS_TOKEN`, `ASAAS_API_KEY`, `OPENPIX_APP_ID`,
`ANTHROPIC_API_KEY` (IA atendente + insights), `ML_APP_ID`, `ML_CLIENT_SECRET`.
NF-e: tokens da Focus NFe ficam em `settings` (config fiscal), não no `.env`.

## Produtos (4 itens)
Pastel (pillow box), Churros (caixa tubular), Hamburguer/Lanche, Fritas (cone/balde).
Pacotes: 50, 100 e 250 unidades. Preços: R$30–R$220.

## Decisões técnicas a preservar
1. QR Code via `api.qrserver.com` (não usar biblioteca JS — falha silenciosamente)
2. Checkout abre ANTES de fechar carrinho em `openCheckout()`
3. Tokens/segredos (OpenPix, Asaas, Focus, Anthropic) NUNCA vão ao cliente — só flags `*_configured: bool`
4. `saveOrderToServer()` deve sempre retornar o `order_id`
5. IA Atendente: sugere, mas Wellington aprova — nunca confirma pagamento/desconto/pedido sozinha
6. `db.js` preserva a interface JSON antiga — não trocar por queries diretas sem necessidade

## Concluído
- Migração de storage JSON → SQLite (`db.js` + `migrate_sqlite.js`) com backup diário
- Autenticação segura (bcrypt + JWT httpOnly + 2FA TOTP) substituindo senha em texto
- Emissão de NF-e (Focus NFe) end-to-end + DANFE + etiqueta de envio no painel
- PIX automático via Asaas (webhook) + cartão; Mercado Pago
- IA Atendente 24h no WhatsApp (Baileys + Claude API)
- Feeds de catálogo (Google/Meta/TikTok/GMB), SSR de SEO, sitemap/robots
- E-mail de confirmação ao cliente (nodemailer)
- Página de produto individual, páginas institucionais (sobre, contato, faq, entrega, privacidade, termos)
- Radar de concorrência Mercado Livre, gestor de verbas, insights do site

## Pendente
- Hospedagem em servidor público com o domínio `topfoodembalagens.com.br`
- Após hospedar: apontar os webhooks (Asaas / OpenPix / Mercado Pago) para a URL pública
- Configurar variáveis sensíveis no `.env` do servidor de produção
