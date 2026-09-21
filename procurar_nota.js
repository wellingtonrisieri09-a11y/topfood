#!/usr/bin/env node
// ============================================================
// procurar_nota.js — procura QUALQUER vestigio de NF-e no sistema.
//
//   node procurar_nota.js
//
// Vasculha, nesta ordem:
//   1. banco atual  — todas as tabelas, campo por campo
//   2. audit log    — registro de quem clicou em emitir nota
//   3. backups .db  — data/backups/ (backup diario)
//   4. pedidos removidos — data/pedidos-removidos-*.json
//
// Procura por: campo "nfe" em pedido, chave de acesso (44 digitos),
// e qualquer texto com "nfe"/"danfe"/"nota fiscal".
// So le. Nao altera nada.
// ============================================================
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const CHAVE = /\b\d{44}\b/g;                       // chave de acesso da NF-e
const PALAVRA = /"nfe"|danfe|chave_nfe|nota.?fiscal/i;
const achados = [];

function olharTexto(origem, id, texto) {
  if (!texto) return;
  const s = String(texto);
  const chaves = s.match(CHAVE);
  if (chaves) chaves.forEach(c => achados.push({ origem, id, tipo: 'CHAVE DE ACESSO', valor: c }));
  if (PALAVRA.test(s)) {
    // mostra so o pedaco em volta, pra nao despejar o registro inteiro
    const m = s.match(/.{0,80}("nfe"|danfe|chave_nfe|nota.?fiscal).{0,140}/i);
    achados.push({ origem, id, tipo: 'MENCAO A NOTA', valor: m ? m[0] : '(trecho)' });
  }
}

function varrerBanco(arquivo, rotulo) {
  if (!fs.existsSync(arquivo)) return;
  let db;
  try { db = new Database(arquivo, { readonly: true, fileMustExist: true }); }
  catch (e) { console.log('  [!] nao consegui abrir ' + rotulo + ': ' + e.message); return; }

  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  for (const t of tabelas) {
    let linhas;
    try { linhas = db.prepare('SELECT * FROM "' + t + '"').all(); } catch (_) { continue; }
    linhas.forEach(l => {
      const id = l.id || l.key || l.resource_id || '';
      Object.values(l).forEach(v => { if (typeof v === 'string') olharTexto(rotulo + ' / ' + t, id, v); });
    });
  }
  db.close();
}

console.log('\n  ===== procurando nota fiscal no sistema =====\n');

// 1 + 2. banco atual (inclui audit_log)
console.log('  1) banco atual (data/topfood.db)');
varrerBanco(path.join(__dirname, 'data', 'topfood.db'), 'banco atual');

// audit log em separado — mostra se alguem clicou em emitir
try {
  const db = new Database(path.join(__dirname, 'data', 'topfood.db'), { readonly: true });
  const logs = db.prepare(
    "SELECT created_at,user_name,action,resource,resource_id,detail FROM audit_log " +
    "WHERE action LIKE '%nfe%' OR action LIKE '%nota%' OR resource LIKE '%nfe%' ORDER BY created_at DESC LIMIT 20"
  ).all();
  console.log('  2) audit log — emissoes registradas: ' + logs.length);
  logs.forEach(l => console.log('       ' + l.created_at + '  ' + l.user_name + '  ' + l.action + '  ' + (l.resource_id || '') + '  ' + String(l.detail || '').slice(0, 120)));
  db.close();
} catch (e) { console.log('  2) audit log: ' + e.message); }

// 3. backups diarios
const dirBk = path.join(__dirname, 'data', 'backups');
const bks = fs.existsSync(dirBk) ? fs.readdirSync(dirBk).filter(f => f.endsWith('.db')) : [];
console.log('  3) backups diarios encontrados: ' + bks.length);
bks.forEach(f => varrerBanco(path.join(dirBk, f), 'backup ' + f));

// 4. pedidos removidos na limpeza
const dirData = path.join(__dirname, 'data');
const rem = fs.existsSync(dirData) ? fs.readdirSync(dirData).filter(f => /^pedidos-removidos-.*\.json$/.test(f)) : [];
console.log('  4) arquivos de pedidos removidos: ' + rem.length);
rem.forEach(f => {
  try {
    const lista = JSON.parse(fs.readFileSync(path.join(dirData, f), 'utf8'));
    lista.forEach(o => olharTexto('removidos ' + f, o.id || '', JSON.stringify(o)));
  } catch (_) {}
});

// resultado
console.log('\n  ===== resultado =====\n');
if (!achados.length) {
  console.log('  Nenhum vestigio de NF-e em lugar nenhum do sistema.');
  console.log('  Nem no banco atual, nem no audit log, nem nos backups.\n');
} else {
  const vistos = new Set();
  achados.forEach(a => {
    const k = a.tipo + '|' + a.valor;
    if (vistos.has(k)) return;
    vistos.add(k);
    console.log('  [' + a.tipo + ']  ' + a.origem + (a.id ? '  (' + a.id + ')' : ''));
    console.log('     ' + a.valor + '\n');
  });
  console.log('  Total de vestigios: ' + vistos.size + '\n');
}
