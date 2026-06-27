# Deploy — TopFood Embalagens (VPS Hostinger)

O site roda numa VPS Hostinger. O código fica no GitHub (branch `main`).

## Deploy automático (configurado em `.github/workflows/deploy.yml`)
Todo push/merge na `main` faz o GitHub entrar na VPS por SSH, rodar
`git pull` + `npm install` e reiniciar o app. **Sobe sozinho.**

### Passo único (uma vez): cadastrar os Secrets no GitHub
No GitHub do projeto → **Settings → Secrets and variables → Actions → New repository secret**.
Crie:

| Secret | O que é | Exemplo |
|--------|---------|---------|
| `VPS_HOST` | IP ou domínio da VPS | `123.45.67.89` |
| `VPS_USER` | usuário SSH | `root` |
| `VPS_SSH_KEY` | **chave SSH privada** com acesso à VPS | conteúdo do arquivo `id_rsa` |
| `VPS_PATH` | (opcional) caminho do projeto na VPS | `/root/topfood` |
| `VPS_PORT` | (opcional) porta SSH, se não for a 22 | `22` |

> A chave/credencial fica guardada **só no GitHub** (criptografada). Não vai pro código.

Depois de cadastrar, é só mexer no código que o deploy roda sozinho. Dá pra
disparar manualmente também em **Actions → Deploy para a VPS Hostinger → Run workflow**.

## Deploy manual (enquanto os secrets não estão cadastrados)
Entre na VPS por SSH (hPanel → Terminal) e rode:

```bash
cd ~/topfood            # ajuste pro caminho real do projeto
git pull origin main
npm install --legacy-peer-deps
pm2 restart all         # ou o jeito que você reinicia o node
```
