# 🗺️ TopFood — MAPA DO QUE FALTA (checklist de execução)
_Só pendências. Módulo por módulo. Marque `[x]` conforme fechar. Atualizado: 30/06._
_Responsáveis: **[W]** Wellington · **[Caio]** · **[Contador]** · **[Claude]** (código)._

---

## 🟡 FALTA POUCO (rápido, alta alavanca)

### M4b — Rastreamento server-side (CAPI)
> Motor já pronto (`modules/capi.js`). Falta só ligar.
- [ ] **[W]** Gerar o `META_CAPI_TOKEN` no **Gerenciador de Eventos da Meta → Conversions API → Gerar token** e colar no `.env` do servidor.

### M6 — Retenção / E-mail
> Conta do domínio (contato@topfoodembalagens.com.br) + e-mail de confirmação JÁ ligados e funcionando. Resta só automação (opcional).
- [ ] **[Claude]** (Opcional) Sequências automáticas de pós-venda: boas-vindas, pós-compra, recompra. *(Carrinho abandonado já existe.)*

### SEO (prioridade máxima — não custa verba)
- [ ] **[W]** Solicitar **indexação dos guias** no Google Search Console (acelera de semanas → dias).
- [ ] **[W]** Conseguir **avaliações no Google Meu Negócio** (só 1 hoje — maior alavanca local).

---

## 🔜 PRÓXIMA FASE — CRESCER COM ANÚNCIOS

### M14 — Publicação Unificada de Anúncios
> Subir 1 criativo/produto e publicar no Google + Facebook/Instagram + TikTok.
- [ ] **[W+Claude]** Conectar feed ao **Google Merchant Center** + campanha Shopping (Claude guia, Wellington configura).
- [ ] **[W+Claude]** Repetir no **Facebook Commerce** e **TikTok Catalog**.
- [ ] **[Claude]** Tela no painel pra subir criativo + botão **Publicar**.
- [ ] **[W]** Solicitar **aprovações de API de anúncios** (Meta → TikTok → Google) — leva dias/semanas, começar cedo.
- [ ] **[Claude]** Controle de verba (teto diário, alerta, pausar) — verba aprovada R$ 3.000/mês.
- [ ] **[W]** Repor fundos no **Facebook Ads** (campanha parou em R$16 de R$20).

### M15 — IA Gestora de Tráfego (Camada 2 / "Fase 3")
> Hoje ela analisa e recomenda. Falta deixar ela **executar**.
- [ ] **[Claude]** IA recomenda **e executa** ajustes de campanha (pausar/ativar/ajustar verba em Meta e Google) — sempre com aprovação do Wellington. *(Windsor já permite agir.)*

---

## ⏳ BLOQUEADO (depende de terceiro)

### M11 — Portal B2B (Nota Fiscal + Boleto)
- [ ] **[Contador]** Certificado digital + credenciamento **NF-e** → destrava o módulo.
- [ ] **[Claude]** Depois do NF-e: área CNPJ, **boleto** (B2B), emissão de nota fiscal.

---

## 🔮 FUTURO / REAVALIAR

### M12 — Inteligência Competitiva
- [ ] **[Claude]** Definir a fonte (radar do Mercado Livre é inviável) → virá do **comportamento do próprio site** (via M15). A desenhar.

### M10 — Marketplace Hub (ML / Shopee / Amazon)
- [ ] **[W]** Decidir se vale a pena publicar (hoje despriorizado — foco em anúncios próprios).

### M16 — IA altera o site
- [ ] **[Claude]** Construir "controles seguros" pra IA mudar produto/banner/cor/telefone com aprovação do Wellington (sem tocar no código).

---

## 🔒 HIGIENE / SEGURANÇA (rápido)
- [ ] **[W]** Rotacionar a **chave do Windsor** e a **senha de e-mail** (apareceram em chat).
- [ ] **[W]** Apagar os **pedidos de teste** (TF-2026-004 etc.) em Admin → Pedidos.

---

## ✅ MÓDULOS SEM PENDÊNCIA (fechados)
M1 · M2 · M3 · M4 · M5 · M7 · M8 · M9 — e M13 removido. _(Não mexer sem motivo.)_

---

### 🎯 Ordem sugerida (maior retorno primeiro)
1. **SEO** (indexação + avaliações) — grátis, traz cliente orgânico.
2. **M14** (Google Merchant Center) — liga a torneira de anúncios numa loja que já converte.
3. **M6** (e-mail do domínio) — profissionaliza + abre retenção.
4. **M4b** (token CAPI) — melhora a medição dos anúncios do passo 2.
5. **M15 Camada 2** — IA passa a otimizar a verba sozinha.
6. **M11** (B2B) — quando o contador liberar a NF-e.
