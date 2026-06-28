# 🍔 TopFood Embalagens — Ecossistema Digital — STATUS DO PROJETO
_Documento-mestre. Versionado no Git para nunca mais se perder (o PC com o histórico foi danificado por água; este é o documento de referência)._

> **Fonte da verdade.** Se algo aqui divergir do que estiver no servidor/site, perguntar ao Wellington antes de assumir.

---

## 🔄 ATUALIZAÇÃO — sessão de 28/06 (Claude Code)
Itens deste documento que **avançaram ou foram concluídos** nesta sessão:

- ✅ **SEO "A fazer" → CONCLUÍDO:**
  - Seção de conteúdo otimizado na home reforçando os termos que o Google **já** dá impressão (fast food / delivery / hambúrguer) — baseado em dado **real** do Search Console.
  - **Blog/guias criados:** `/guia/embalagem-para-pastel`, `/guia/embalagem-para-hamburguer`, `/guia/embalagem-para-churros`, `/guia/embalagem-para-batata-frita` + índice `/guias` (Article + FAQ + Breadcrumb schema, link interno).
  - Extras: **canonical por produto** (corrige duplicação `/produto` vs `/product.html` confirmada no GSC), schema de produto completo (preço/frete/devolução), breadcrumb, faq no sitemap.
  - **NAP corrigido:** endereço unificado para **São Bernardo do Campo** em todo o site (batia "Santo André" na contato/sobre/admin — prejudica ranking local).
- ✅ **M7 (Dashboard de Métricas) — DESBLOQUEADO:** chave da API Windsor configurada no servidor; módulo `marketing.js` puxa **Search Console + Meu Negócio + Meta/Google Ads** e entrega à IA Gestora. Endpoint `GET /api/eco/metrics`. _(Falta, se quiser, uma "tela" visual dedicada — hoje os dados saem pelo chat da IA Gestora.)_
- ✅ **M15 (IA Gestora) — RESPONDENDO COM DADO REAL:** testada no painel, respondeu com orgânico real (GSC) **e** os anúncios (R$ 16,10 do Facebook, por campanha, com CPC e flag caro/eficiente). Camada 1 + métricas reais (orgânico e pago) ligadas.
- ✅ **Créditos Anthropic CONFIRMADOS (já entraram há tempo):** IA Atendente (M5) funcionando no WhatsApp e testada (busca dados, integrada ao Windsor); IA Gestora (M15) respondendo. Nada de esperar crédito.
- ✅ **Infra:** **auto-deploy** (cron na VPS) — todo push entra no ar sozinho em ~2 min, reiniciando só o `topfood`. Documentado em `DEPLOY.md`.
- 🔒 **Segurança:** rotacionar a chave do Windsor (apareceu em chat durante a configuração).

---

## 📌 O QUE É O PROJETO
Ecossistema digital completo: site/loja online + painel que automatiza **marketing, vendas e atendimento**. Objetivo: gerar clientes por anúncios (Google, Facebook/Instagram, TikTok), atender 24h por IA no WhatsApp, e ter uma IA que gerencia tudo e mantém a empresa à frente da concorrência.

**Empresa:** TopFood Embalagens Ltda · CNPJ 67.038.607/0001-31 · São Bernardo do Campo–SP
**Site:** https://topfoodembalagens.com.br (no ar, HTTPS) · **Admin:** /admin.html

---

## ✅ INFRAESTRUTURA (PRONTA E NO AR)
- [x] Site/loja online completo, VPS própria, domínio + HTTPS
- [x] Painel administrativo (pedidos, produtos, clientes, relatórios, configurações)
- [x] Banco de dados, backup diário automático + backup externo
- [x] Segurança reforçada (login protegido, firewall, anti-ataque)
- [x] Pagamento PIX funcionando (confirmação automática via Asaas)
- [x] 6 produtos cadastrados com fotos
- [x] **Auto-deploy** (push no Git → no ar em ~2 min) — _novo, 28/06_

---

## 🧩 OS MÓDULOS — STATUS DE CADA UM
Legenda: ✅ Pronto · 🟡 Parcial · 🔜 A fazer · ⏳ Bloqueado (esperando algo/alguém) · ❌ Removido

| # | Módulo | O que faz | Status | O que falta |
|---|--------|-----------|--------|-------------|
| M1 | Feeds de catálogo | Produtos p/ Google/Meta/TikTok | ✅ Pronto | — |
| M2 | Ad Center | Pixels + medição de conversão | ✅ Pronto | — |
| M3 | Gestão de Verba | Orçamento por plataforma | ✅ Pronto | — |
| M4 | Rastreamento (pixels) | Meta, Google, GA4, TikTok no site | ✅ Pronto | — |
| M4b | Rastreamento server-side (CAPI) | Rastreio à prova de bloqueador | ⏳ Bloqueado | Token da Meta (Wellington) |
| M5 | IA Atendente WhatsApp 24h | Robô responde no WhatsApp | ✅ Pronto | — (créditos OK, WhatsApp conectado e testado, integrado ao Windsor) |
| M6 | Retenção / E-mail | Sequências de e-mail automáticas | ⏳ Bloqueado | Boleto do e-mail Hostinger (Caio) |
| M7 | Dashboard de Métricas | Visitas/anúncios/SEO no painel | 🟡→✅ Dados ligados | (Opcional) tela visual dedicada; dados já vêm pela IA Gestora |
| M8 | Memória da IA | Atendente lembra de clientes/conversas | ✅ Pronto | — |
| M9 | Controle de Acesso | Login seguro, perfis, 2FA | ✅ Pronto | (2FA opcional) |
| M10 | Marketplace Hub | Vender em ML/Shopee/Amazon | 🟡 Reavaliar | ML conectado; publicar é burocrático; foco mudou p/ anúncios |
| M11 | Portal B2B (Nota Fiscal) | CNPJ, boleto, emissão de NF-e | ⏳ Bloqueado | Certificado digital NF-e (Contador) |
| M12 | Inteligência Competitiva | Espiar preços de concorrentes | 🔜 Ajustado | Radar ML inviável; intel virá do comportamento do site (M15) |
| ~~M13~~ | ~~Gerador de Criativos~~ | ~~Criar artes no painel~~ | ❌ Removido | Wellington cria por fora (Photoshop/Corel/Canva) |
| M14 | **Publicação Unificada de Anúncios** | 1 criativo/produto → publica Google+Face+TikTok | 🔜 A fazer | Ver "Publicação de Anúncios" abaixo |
| M15 | **IA Gestora de Tráfego** | IA analisa tudo, gerencia anúncios, dá feedback | 🟡 Parcial (respondendo) | Camada 1 + métricas reais ✅; Camada 2 (otimizar/executar anúncios) = "Fase 3" |
| M16 | IA altera o site | Falar c/ IA p/ mudar produto/banner/cor/telefone | 🔜 Futuro | Construir "controles" seguros; código só o Claude Code mexe |

---

## 🔍 SEO (PRIORIDADE MÁXIMA)
**Diagnóstico (confirmado com dado real do Search Console nesta sessão):** o site rankeia 1º só pra marca ("topfood"); para buscas que trazem cliente ("embalagem fast food", "caixa hambúrguer") está na **página 5–7**. Meta: subir.

**Concluído:**
- [x] Produtos no HTML da home (SSR) · meta description única por produto · títulos com palavra-chave + "Atacado" · conteúdo rico + FAQ + schema · alt das imagens
- [x] **Seção de conteúdo otimizado na home** (fast food/delivery) — _28/06_
- [x] **Blog/guias** (pastel, hambúrguer, churros, batata frita) — _28/06_
- [x] Canonical por produto · schema de produto completo · breadcrumb · faq no sitemap · NAP local — _28/06_

**A fazer (Wellington, rápido):**
- [ ] Solicitar indexação dos guias no Google Search Console (acelera de semanas p/ dias)
- [ ] Pegar avaliações no Google Meu Negócio (só 1 hoje — maior alavanca local)

---

## 📢 PUBLICAÇÃO DE ANÚNCIOS (M14)
**Visão:** subir criativo OU produto → PUBLICAR → vai p/ Google, Facebook/Instagram e TikTok de uma vez; gerenciar tudo pelo painel.

- **Anúncio de produto** = usa os feeds que já temos → conectar **Google Merchant Center**, **Facebook Commerce**, **TikTok Catalog** (config de conta).
- **Criativo próprio automático nas 3** = precisa **aprovação de API de anúncios** (Meta → TikTok → Google), leva dias/semanas — começar cedo.

**A fazer:**
- [x] Página de política de troca/devolução (requisito Google) — **feito (28/06): `/devolucao.html`** (arrependimento 7 dias com frete por nossa conta; defeito/avaria 48h sem custo) + no sitemap e no rodapé
- [ ] Conectar feed ao Google Merchant Center + campanha Shopping (Claude guia, Wellington configura)
- [ ] Repetir no Facebook Commerce e TikTok
- [ ] Tela no painel p/ subir criativos + botão Publicar
- [ ] Solicitar aprovações de API (Meta, TikTok, Google)
- [ ] Controle de verba (teto diário, alerta, pausar) — verba aprovada R$ 3.000/mês

---

## 🔌 CONTAS E INTEGRAÇÕES
**Conectadas (Windsor.ai):** GA4, Search Console, Google Ads, Facebook (2 contas), Instagram, Google Meu Negócio. **Windsor → servidor: chave configurada (28/06).**
**Mercado Livre:** conta conectada.
**Pagamento:** Asaas (PIX ✅; cartão aguarda docs do CNPJ).
**IA (Anthropic):** chave no servidor, **com créditos ativos** — IA Atendente (M5) e IA Gestora (M15) funcionando.

### Taxas Asaas (19/06)
- Boleto R$ 0,99 (recebe em 1 dia útil) · Pix R$ 0,99 (segundos) · Cartão 1,99% + R$ 0,49 (recebe em 32 dias)

---

## 👥 PENDÊNCIAS POR RESPONSÁVEL

### Wellington
- [x] ~~Créditos Anthropic~~ → **OK (já entraram há tempo)**; IA Atendente (M5) e IA Gestora (M15) funcionando
- [ ] Token da Meta (CAPI) → destrava M4b
- [x] ~~Chave Windsor.ai~~ → **feito (28/06)**, métricas ligadas na IA Gestora
- [ ] Iniciar aprovações de API de anúncios (Meta → TikTok → Google) → M14
- [ ] Adicionar fundos no Facebook Ads (campanha parou por pagamento — R$16 de R$20)
- [ ] Solicitar indexação dos guias (GSC) · pegar avaliações no Google
- [ ] Rotacionar a chave do Windsor (apareceu em chat)
- [ ] (Opcional) 2FA · fotos/vídeos profissionais

### Caio
- [ ] Asaas: docs do CNPJ → libera cartão
- [ ] Hostinger: boleto do e-mail profissional → libera M6
- [ ] Hostinger: boleto do upgrade do servidor (VPS)

### Contador
- [ ] Certificado digital + credenciamento NF-e → libera M11

---

## ▶️ PRÓXIMOS PASSOS SUGERIDOS
1. ~~SEO: home + blog/guias~~ ✅ **feito (28/06)** → agora: **indexação + avaliações** (Wellington)
2. ~~Créditos Anthropic~~ ✅ feito → IA Atendente + IA Gestora já 100% ligadas
3. Anúncios de catálogo: política de devolução + Google Merchant Center (Claude guia)
4. M14: tela de publicação + iniciar aprovações de API
5. M15 Camada 2 / "Fase 3": IA Gestora **recomenda e executa** ajuste de campanha (Windsor já permite agir em Meta/Google Ads) com aprovação do Wellington

---

## ⚠️ REGRAS DO PROJETO
- **Código/motor do site:** mexido **somente pelo Claude Code** (nunca deixa o site fora do ar).
- **IA do site:** pode mexer em **conteúdo/configurações** (produtos, banner, telefone, cor) com aprovação do Wellington — nunca no código.
- Tudo renderizado no servidor (não prejudica SEO).
- **Revisar e testar antes de entregar.** Site nunca sai do ar (prioridade nº 1).

---

## 🗂️ PROJETO À PARTE (NÃO faz parte deste ecossistema)
**Público-Alvo iFood** — prospecção B2B (CNPJs + iFood Shop + anúncios segmentados). Desenvolvido em separado. **Não misturar.**
