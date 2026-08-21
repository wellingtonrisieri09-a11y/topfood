# 📣 Campanha Meta — mapa de IDs e configuração

_Referência rápida pra não perder os IDs entre sessões. Atualizado: 21/08._

## Conta e estrutura
- **Conta de anúncios:** `1424339431640184` (Conta de Anuncios de Diversos)
- **Campanha:** `120247606662050630` — "TopFood — Vendas Embalagens (Todos os Produtos)"
  - Objetivo: `OUTCOME_SALES` · Verba: **R$ 30,00/dia** (subida de R$15 em 21/08)
- **Conjunto:** `120247606662060630` — "Brasil — Donos de Lanchonete e Food Service"
  - Otimização: `OFFSITE_CONVERSIONS` · Público validado (CTR 4,3%, CPC R$0,42)
- **Página:** `1107513152452738` · **Pixel:** `1362777799250881` (100pilas - Pixel Site)

## Anúncios (1 criativo por produto — Meta escolhe qual mostrar pra cada pessoa)

**Status em 21/08: todos ATIVOS, links por produto aplicados, verba R$30/dia.**

| Anúncio | ID | Link de destino | Arte |
|---|---|---|---|
| Novo anúncio de Vendas (genérico) | `120247606662070630` | home | — |
| Produto — Hambúrguer | `120248138277860630` | `/produto/burger` | `assets/ads/produtos/hamburguer.png` |
| Produto — Pastel | `120248138285080630` | `/produto/pastel` | `assets/ads/produtos/pastel.png` |
| Produto — Fritas Aberta | `120248138287480630` | `/produto/fritas` | `assets/ads/produtos/fritas.png` |
| Produto — Batata Frita Fechada | `120248138291820630` | `/produto/caixa-para-batata-frita-fechada` | `assets/ads/produtos/batata-fech.png` |
| Produto — Churros Fechada | `120248138295440630` | `/produto/churros` | `assets/ads/produtos/churros-fech.png` |
| Produto — Churros Aberta | `120248138297850630` | `/produto/churros-aberto` | `assets/ads/produtos/churros-abert.png` |

> `Teste B — Custo por lanche` (`120248131497310630`) ficou redundante (o preço por
> unidade entrou em todos os 6 criativos). Pode excluir no Gerenciador.

## Regras que aprendemos na marra
1. **Não editar anúncio por 7 dias depois de ligar** — cada edição volta pra revisão e
   reinicia o aprendizado do algoritmo.
2. **Nunca deixar a conta sem saldo** — 10 dias parados (4–13/08) custaram o aprendizado
   inteiro do primeiro teste.
3. **Pixel:** o `fbq` do navegador precisa mandar `eventID: 'order-<id>'` igual ao da CAPI,
   senão a Meta conta cada compra duas vezes e o ROAS aparece inflado (corrigido 21/08).

## Como mexer daqui (via Windsor MCP)
Ações de escrita precisam estar ligadas em Windsor → Settings → Account →
"Enable write actions for Claude, ChatGPT & API".

```
connector: facebook · account: 1424339431640184
enable_ad / pause_ad            { ad_id }
update_ad_creative              { ad_id, link, message, headline, description, image_url }
set_campaign_budget             { campaign_id, budget_type: "daily", amount }  # em centavos
```
