# Deploy — TopFood Embalagens (VPS Hostinger)

> A VPS hospeda outros sites (Verbo Vivo, Arte Cromo, SDL), cada um separado
> em seu próprio processo/porta/domínio. O mapa completo e as regras para um
> site nunca derrubar o outro estão em **`SERVIDOR.md`**.

O site roda numa VPS Hostinger (`/var/www/topfood`), gerenciado pelo **pm2**
(processo `topfood`), atrás do nginx. Código no GitHub, branch `main`.

## Auto-deploy (na própria VPS, via cron — sem secrets)
O script `deploy.sh` roda na VPS a cada 2 minutos: checa se há push novo na
`main` e, se houver, atualiza o site e reinicia só o `topfood`.
Usa a chave SSH que a VPS já tem pro GitHub — **não precisa de GitHub Actions
nem cadastrar secrets**.

### Ativar (uma vez só) — cole na VPS:
```bash
chmod +x /var/www/topfood/deploy.sh
( crontab -l 2>/dev/null | grep -v 'topfood/deploy.sh'; \
  echo '*/2 * * * * /var/www/topfood/deploy.sh >> /var/log/topfood-deploy.log 2>&1' ) | crontab -
crontab -l   # confere se a linha entrou
```
Pronto. A partir daí, todo push na `main` entra no ar sozinho em até 2 min.

### Acompanhar / depurar
```bash
tail -f /var/log/topfood-deploy.log   # ver os deploys acontecendo
/var/www/topfood/deploy.sh            # forçar um deploy na hora
```

## Deploy manual (quando quiser subir na hora)
```bash
cd /var/www/topfood && git pull origin main && pm2 restart topfood
```

> O banco de dados (`data/topfood.db`) é gitignored — nenhum deploy o altera.
