// pm2 — SÓ o TopFood. Cada site da VPS tem o seu próprio arquivo destes.
// Subir:     pm2 start ecosystem.config.js && pm2 save
// Reiniciar: pm2 restart topfood        (NUNCA use "pm2 restart all")
module.exports = {
  apps: [{
    name: "topfood",
    script: "server.js",
    cwd: "/var/www/topfood",
    env: { NODE_ENV: "production", PORT: "3000" },
    autorestart: true,        // caiu? levanta sozinho
    max_memory_restart: "450M",
    time: true                // logs com data/hora
  }]
}
