# Organização da VPS — cada site separado, um NUNCA derruba o outro

> **Guia mestre do servidor.** Os 4 sites moram na mesma VPS Hostinger, mas cada
> um é um **processo separado, numa porta separada, numa pasta separada, com um
> domínio (DNS) separado**. Mexer num site não encosta nos outros.

## O mapa do servidor

| Site | Domínio (DNS) | Porta | Processo | Pasta na VPS | Como roda |
|------|---------------|-------|----------|--------------|-----------|
| **TopFood** (principal) | `topfoodembalagens.com.br` | **3000** | pm2 `topfood` | `/var/www/topfood` | Node (`server.js`) |
| **Forpack** (clone do TopFood) | `forpackembalagens.com.br` | **3002** | pm2 `forpack` | `/var/www/forpack` | Node (clone — ver `forpack/FORPACK.md`) |
| **SDL Brinquedos** | `sdlbrinquedos.com.br` | **3001** | pm2 `sdl-brinquedos` | `/var/www/sdl-brinquedos` | Next.js |
| **Arte Cromo** | `artecromoestampas.com.br` | **8765** | systemd `artecromo` | `/var/www/artecromo` | Python (`servidor.py`) |
| **Verbo Vivo** | `verbovivoapp.com.br` | **8787** | pm2 `verbovivo` | `/var/www/verbovivo` | HTML estático + API Node |

O **nginx** fica na frente de todos: ele olha o **domínio** que o visitante
digitou e manda para a **porta** certa. Cada site tem o seu próprio arquivo em
`/etc/nginx/sites-available/` — um arquivo por domínio, nunca tudo misturado.

## Como o DNS separa os sites

Todos os domínios apontam (registro **A**) para o **mesmo IP da VPS** — isso é
normal e correto. Quem separa é o nginx, pelo `server_name` de cada arquivo.
Ou seja: **não precisa de um servidor para cada site** — precisa de um
*processo* para cada site, e é isso que este guia garante.

## ⚠️ As 4 regras de ouro (é isso que evita o apagão geral)

1. **NUNCA rode `pm2 restart all`, `pm2 reload all` ou `pm2 delete all`.**
   Sempre pelo nome: `pm2 restart topfood`, `pm2 restart verbovivo`, etc.
   É quase sempre esse `all` que derruba todos os sites de uma vez.
2. **NUNCA rode `systemctl restart nginx`.** Use
   `sudo nginx -t && sudo systemctl reload nginx` — o `reload` troca a
   configuração **sem derrubar ninguém** (e o `nginx -t` confere antes se a
   config tem erro; se tiver, nada muda e os sites continuam no ar).
3. **Cada site só na sua pasta.** Mexeu no TopFood? Só `/var/www/topfood`.
   Nada de editar arquivos de um site dentro da pasta do outro.
4. **Cada site na sua porta, fixa, sem trocar:** 3000 TopFood · 3001 SDL ·
   3002 Forpack · 8765 Arte Cromo · 8787 Verbo Vivo. Se dois processos disputarem a mesma
   porta, um deles cai — por isso a tabela acima é lei.

## Montagem (fazer UMA vez na VPS)

Cada repositório agora tem seus próprios arquivos de infraestrutura:

- `ecosystem.config.js` (ou `artecromo.service` no Arte Cromo) → como o processo sobe
- `deploy.sh` → auto-deploy que reinicia **só aquele site**
- `nginx/*.conf` → a configuração do domínio daquele site

```bash
# 1) Subir cada processo separado (uma vez)
cd /var/www/topfood        && pm2 start ecosystem.config.js
cd /var/www/sdl-brinquedos && pm2 start ecosystem.config.js
cd /var/www/verbovivo      && pm2 start ecosystem.config.js
pm2 save                       # grava a lista p/ voltar sozinha se a VPS reiniciar
pm2 startup                    # (se ainda não fez) roda o comando que ele mostrar

# Arte Cromo é Python — roda pelo systemd (arquivo dentro do repo dele):
sudo cp /var/www/artecromo/artecromo.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now artecromo

# 2) nginx: um arquivo por domínio (cada repo traz o seu em nginx/)
sudo cp /var/www/topfood/nginx/*.conf        /etc/nginx/sites-available/  # renomeando sem o .conf se preferir
sudo cp /var/www/verbovivo/nginx/*.conf      /etc/nginx/sites-available/
sudo cp /var/www/artecromo/nginx/*.conf      /etc/nginx/sites-available/
sudo cp /var/www/sdl-brinquedos/nginx/*.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/* /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 3) Auto-deploy independente (cron) — cada linha só reinicia o próprio site
crontab -e   # e deixe assim (horários alternados p/ não coincidirem):
# */2 * * * * /var/www/topfood/deploy.sh        >> /var/log/topfood-deploy.log    2>&1
# 1-59/4 * * * * /var/www/verbovivo/deploy.sh      >> /var/log/verbovivo-deploy.log  2>&1
# 2-59/4 * * * * /var/www/artecromo/deploy.sh      >> /var/log/artecromo-deploy.log  2>&1
# 3-59/4 * * * * /var/www/sdl-brinquedos/deploy.sh >> /var/log/sdl-deploy.log        2>&1
```

## Dia a dia — mexer num site sem encostar nos outros

**Quero atualizar o TopFood:**
```bash
cd /var/www/topfood && git pull origin main && pm2 restart topfood
```
→ Verbo Vivo, Arte Cromo e SDL continuam no ar, intocados.

**Quero atualizar o Verbo Vivo:**
```bash
cd /var/www/verbovivo && git pull origin main && pm2 restart verbovivo
```
→ TopFood continua no ar, intocado. (E se mexeu só no front — `public/` — nem
precisa reiniciar nada: o nginx serve os arquivos direto.)

**Arte Cromo:** `cd /var/www/artecromo && git pull origin main && sudo systemctl restart artecromo`

**SDL:** `cd /var/www/sdl-brinquedos && git pull origin main && npm run build && pm2 restart sdl-brinquedos`
(Next.js precisa do `build` antes do restart.)

Ou simplesmente **dê push na `main` e deixe o `deploy.sh` de cada site fazer
isso sozinho em até poucos minutos** — cada script só toca no próprio site.

## Conferir a saúde de tudo

```bash
pm2 status                       # topfood, sdl-brinquedos, verbovivo → "online"
systemctl status artecromo       # → "active (running)"
ss -ltnp | grep -E ':3000|:3001|:3002|:8765|:8787'   # cada porta ocupada pelo seu processo
pm2 logs topfood --lines 50      # log de UM site só
```

## Se um site cair

- `pm2 restart <nome>` levanta só ele (o pm2 já religa sozinho se o processo
  morrer — `autorestart` está ligado em todos).
- Se a VPS inteira reiniciar: pm2 (via `pm2 startup` + `pm2 save`) e o systemd
  levantam tudo automaticamente.
- O nginx continua servindo os demais sites mesmo com um processo fora do ar —
  o visitante do site caído vê erro 502, os outros sites nem percebem.
