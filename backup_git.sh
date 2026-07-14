#!/bin/bash
# Backup automático noturno do código pro GitHub (TopFood).
# Protege contra perda por sessões paralelas — roda às 04:30, só commita se houver mudança.
cd /var/www/topfood || exit 1
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: backup automatico noturno ($(date +%d/%m/%Y %H:%M))" >/dev/null
  git push origin main >/dev/null 2>&1 && echo "$(date): backup enviado" >> data/backup_git.log || echo "$(date): PUSH FALHOU" >> data/backup_git.log
else
  echo "$(date): sem mudancas" >> data/backup_git.log
fi
