# TopFood Ecossistema — Mapa dos Módulos

> Documento mestre do ecossistema. Reconstruído a partir do **código real**
> (fonte de verdade mais atual), porque o documento original não estava
> versionado no repositório. A partir de agora ele vive aqui, no Git — não
> se perde mais.
>
> **Legenda:** ✅ pronto e ativo · ⏳ pendente · 💤 construído, desligado · ❓ a confirmar

## Módulos M-tagueados (confirmados no código)

| M | Módulo | Arquivo | O que faz | Status |
|---|--------|---------|-----------|--------|
| **M1** | Feeds de catálogo | `modules/feeds.js` | Google Shopping, Meta Catalog, TikTok, GMB (`/feed*.xml`) | ✅ |
| **M2** | Ad Center | `admin.js` (painel) | Central de anúncios / pixels e conversão | ✅ |
| **M3** | Gestor de Verbas | `modules/budget.js` | Verbas de anúncios por plataforma + alertas | ✅ |
| **M4** | ❓ *a confirmar* | — | (não tagueado no código) | ❓ |
| **M5** | IA Atendente WhatsApp 24h | `modules/atendente.js` | Baileys + Claude API; IA sugere, Wellington aprova | ✅ |
| **M6** | ❓ *a confirmar* | — | (não tagueado no código) | ❓ |
| **M7** | ❓ *a confirmar* | — | (não tagueado no código) | ❓ |
| **M8** | Memória do Atendente | `modules/atendente.js` | Claude Memory (contexto sobrevive a restart) + ficha do cliente | ✅ |
| **M9** | Autenticação segura | `modules/auth.js` | bcrypt + JWT httpOnly + 2FA TOTP | ✅ |
| **M10** | Mercado Livre — base/OAuth | `modules/ml.js` | OAuth + tokens do ML | ⏳ pendente (falta conectar) |
| **M11** | NF-e (Focus NFe) | `modules/nfe.js` | Emissão de nota + DANFE + etiqueta | ✅ |
| **M12** | Radar de Concorrência ML | `modules/ml.js` | Monitora concorrência no Mercado Livre | ⏳ depende do M10 |
| **M13** | ❓ *a confirmar* | — | (não tagueado no código) | ❓ |
| **M14** | ❓ *a confirmar* | — | (não tagueado no código) | ❓ |
| **M15** | IA Gestora / Insights | `modules/insights.js` + `track.js` | Inteligência do site + chat da IA Gestora | ✅ |

## Módulos do ecossistema sem tag M (mas ativos)

| Módulo | Arquivo | O que faz | Status |
|--------|---------|-----------|--------|
| PIX automático (Asaas) | `modules/asaas.js` | Cobrança PIX + webhook de confirmação | ✅ |
| Backup diário | `modules/backup.js` | Backup do SQLite (node-cron) | ✅ |
| Visitantes online | `modules/online.js` | Contador real de visitantes (ping anônimo) | ✅ |
| SSR de SEO | `modules/seo.js` | Renderiza produtos no HTML para o Google | ✅ |
| Frete / Orçamento | `modules/frete.js` | Tabela de frete por estado (usada pela IA) | ✅ |
| **Guias de conteúdo (SEO)** | `modules/guias.js` | Páginas-artigo `/guia/:slug` (pastel, hambúrguer, churros, fritas) | ✅ *novo* |
| **Métricas reais de marketing** | `modules/marketing.js` | Search Console + Meu Negócio + Meta/Google Ads (via Windsor) → alimenta a IA Gestora | ✅ *novo* |

## Lacunas a preencher (M4, M6, M7, M13, M14)

Esses 5 não têm tag no código — preciso que o Wellington informe o que eram no
documento original. Candidatos prováveis (a confirmar), olhando o que existe sem
número: e-mail de confirmação (nodemailer), páginas institucionais, sitemap/robots,
SSR de SEO, frete, online, backup — algum desses pode ter sido M4/M6/M7/M13/M14.

## Pendências reais do ecossistema (estado atual)

- ⏳ **Mercado Livre (M10/M12)** — falta conectar (OAuth) para o radar de concorrência funcionar.
- ⏳ **Webhooks de pagamento** — confirmar se Asaas/OpenPix/Mercado Pago estão apontados para a URL pública (`/api/asaas/webhook`, `/api/pix-webhook`, `/api/webhook`).
- 📝 Preencher M4/M6/M7/M13/M14 acima quando o Wellington recuperar o documento original.

## Já concluídos (confirmado por Wellington)
- ✅ IA Atendente WhatsApp (M5) funcionando
- ✅ Pagamentos (PIX/Asaas) funcionando
- ✅ NF-e (M11) finalizado
- ✅ IA Gestora com métricas reais (orgânico + pago via Windsor) — Fases 1 e 2
