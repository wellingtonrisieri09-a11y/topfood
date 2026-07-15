# Forpack Embalagens — clone do TopFood na mesma VPS

O Forpack é um **espelho do TopFood**: mesmo código, mesmos produtos, mesmos
preços — só muda o nome, o domínio e a porta. Ele roda como **mais um site
separado** na VPS (regras do `SERVIDOR.md`): mexer no Forpack não encosta no
TopFood, e vice-versa.

| | TopFood | Forpack |
|---|---------|---------|
| Domínio | topfoodembalagens.com.br | forpackembalagens.com.br |
| Porta | 3000 | **3002** |
| Processo pm2 | `topfood` | `forpack` |
| Pasta | `/var/www/topfood` | `/var/www/forpack` |
| Banco | `data/topfood.db` | `data/forpack.db` (cópia, depois independente) |
| Admin | /admin.html | /admin.html (mesmo login do TopFood no início) |

## Criar o clone (uma vez, na VPS)

```bash
chmod +x /var/www/topfood/forpack/clonar-forpack.sh
/var/www/topfood/forpack/clonar-forpack.sh
```

O script faz tudo: copia o código, troca "TopFood" por "Forpack" em todos os
textos (site, e-mails, SEO, sitemap), copia o banco com produtos e
configurações, ajusta o nome da loja no banco, cria o `.env` próprio
(porta 3002 + URL do Forpack) e sobe o processo `forpack` no pm2.
No final ele mostra os 3 passos de domínio (DNS, nginx, HTTPS).

## Atualizar o Forpack com as melhorias do TopFood

Fez melhorias no TopFood e quer levá-las pro Forpack? Rode o mesmo script de
novo. Ele re-copia o código, re-aplica a troca de marca e reinicia **só o
forpack** — o banco, os pedidos e o `.env` do Forpack ficam intactos.

Se quiser que isso seja automático (sempre que o TopFood atualizar, o Forpack
acompanha em até 10 min), adicione no `crontab -e`:

```
*/10 * * * * /var/www/topfood/forpack/clonar-forpack.sh --auto >> /var/log/forpack-clone.log 2>&1
```

> Prefere que o Forpack fique "congelado" enquanto você testa coisas novas no
> TopFood? Então NÃO coloque o cron — atualize só quando quiser, na mão.

## ⚠️ Avisos importantes

1. **Pagamentos**: o `.env` do Forpack nasce com as MESMAS chaves do TopFood
   (Asaas, Mercado Pago). Ou seja: as vendas do Forpack caem na mesma conta.
   - Se quiser separar o caixa, crie contas próprias e troque as chaves em
     `/var/www/forpack/.env`, depois `pm2 restart forpack`.
   - **Webhook**: no painel do provedor de pagamento, cadastre TAMBÉM a URL do
     Forpack (`https://forpackembalagens.com.br/api/asaas/webhook` etc.) —
     senão a confirmação automática de PIX só chega pro TopFood.
2. **Logo e imagens**: o script troca textos, não imagens — o clone nasce com
   o logo do TopFood. Coloque o logo/imagens do Forpack em
   `/var/www/forpack-personalizacao/` (mesma estrutura de pastas, ex.:
   `/var/www/forpack-personalizacao/logo.png`) — o script copia por cima em
   toda atualização, então sua personalização nunca se perde.
3. **Senha do admin**: nasce igual à do TopFood (o banco é uma cópia). Troque
   a senha no `.env` do Forpack (`ADMIN_PASSWORD`) por segurança.
4. **IA Atendente (WhatsApp)**: não conecte o MESMO número de WhatsApp nos
   dois sites ao mesmo tempo — um derruba a sessão do outro. Use um número
   próprio pro Forpack ou deixe o atendente desligado nele.
5. **Pedidos antigos**: como o banco é uma cópia, o Forpack nasce com o
   histórico de pedidos do TopFood. Não atrapalha nada, mas se quiser começar
   zerado, dá pra limpar os pedidos no painel admin do Forpack.
6. **Google/SEO**: o sitemap e as URLs já saem com o domínio do Forpack.
   Cadastre o domínio novo no Google Search Console quando o site estiver no ar.
