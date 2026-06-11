# TopFood Embalagens — Instruções para o Claude

## Contexto do projeto
E-commerce de embalagens food service. Dono: Wellington Risieri Correa.
Stack: Node.js + Express + HTML/CSS/JS puro. Storage: arquivos JSON em `data/`.

## Como iniciar o servidor
```bash
node server.js
# Loja:  http://localhost:3000
# Admin: http://localhost:3000/admin.html  (senha: topfood2026)
```

## Arquivos principais
| Arquivo | Função |
|---------|--------|
| `index.html` | Loja completa (frontend + JS) |
| `admin.html` | Painel administrativo |
| `server.js` | Backend Express (API REST) |
| `data/settings.json` | Config da loja (PIX, WhatsApp, senhas) |
| `data/orders.json` | Pedidos salvos |
| `data/products.json` | Catálogo de produtos |

## API Endpoints
```
GET  /api/settings              ← config pública (PIX, WhatsApp, tracking)
POST /api/orders                ← salvar pedido → retorna {ok, order_id}
GET  /api/orders/:id/status     ← polling de status (público)
POST /api/pix-charge            ← criar cobrança PIX (OpenPix ou estático)
POST /api/pix-webhook           ← webhook OpenPix (confirmação automática)
POST /api/checkout              ← preferência Mercado Pago
PUT  /api/admin/orders/:id      ← atualizar pedido (admin)
PUT  /api/admin/settings        ← salvar config (admin)
```

## Checkout (index.html)
Modal multi-step: Step1=Itens → Step2=Entrega → Step3=Pagamento → Step4=Concluído.
Variáveis globais: `checkoutStep`, `checkoutData`, `selectedShipping`, `_pixPollTimer`.
- `openCheckout()` abre o checkout ANTES de fechar o carrinho (evita flash)
- `closeCart()` não reseta `body.overflow` se checkout estiver aberto
- `saveOrderToServer()` retorna `order_id` (usado para polling)
- `startPixPolling(orderId)` verifica status a cada 5s por até 30 min
- `showPixConfirmed()` mostra tela de sucesso quando status = 'paid'

## PIX
- **Estático** (padrão): chave em `settings.pix_key`, QR via `api.qrserver.com`
- **Dinâmico** (OpenPix): token em `settings.openpix_app_id`, confirmação automática via webhook
- Admin pode confirmar manualmente: botão "Confirmar PIX" aparece em pedidos com `payment_method==='pix'` e `status==='pending'`

## Produtos (4 itens)
Pastel (pillow box), Churros (caixa tubular), Hamburguer/Lanche, Fritas (cone/balde).
Pacotes: 50, 100 e 250 unidades. Preços: R$30–R$220.

## Decisões técnicas a preservar
1. QR Code via `api.qrserver.com` (não usar biblioteca JS — falha silenciosamente)
2. Checkout abre ANTES de fechar carrinho em `openCheckout()`
3. Token OpenPix NUNCA vai ao cliente — só `openpix_configured: bool`
4. `saveOrderToServer()` deve sempre retornar o `order_id`

## Pendente
- Hospedagem em servidor público
- Configurar OpenPix após hospedagem (webhook precisa de URL pública)

## Concluído
- E-mail de confirmação ao cliente (nodemailer — configurar EMAIL_HOST/USER/PASS no .env)
- Página de produto individual (product.html?id=pastel)
