#!/usr/bin/env node
'use strict';

/**
 * flowversion-cleanup.js — poda o histórico de versões dos fluxos.
 *
 * CONTEXTO: `FlowVersion` guarda um snapshot de nodes+config a cada save de
 * fluxo. Como o base64 dos vídeos vivia dentro do fluxo, cada versão pesava
 * ~18 MB — 517 versões viraram 12 GB, ou 86% do banco inteiro. A mídia-teca
 * resolveu a causa (os fluxos agora são pequenos), mas o acúmulo histórico
 * continua lá.
 *
 * SEGURANÇA: a tabela é SOMENTE-ESCRITA na aplicação — nenhum endpoint, tela ou
 * funcionalidade lê dela (verificado em backend e frontend). O valor dela é
 * recuperação manual de desastre, então manter as N versões mais recentes de
 * cada fluxo preserva esse valor e libera quase todo o espaço.
 *
 * Uso:
 *   node scripts/flowversion-cleanup.js                 (simula)
 *   node scripts/flowversion-cleanup.js --apply         (executa)
 *   node scripts/flowversion-cleanup.js --apply --manter=10
 */

const { Client } = require('ssh2');
const fs   = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..');
const APPLY  = process.argv.includes('--apply');
const MANTER = Number((process.argv.find(a => a.startsWith('--manter=')) || '--manter=5').split('=')[1]) || 5;

function loadVpsEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.vps'), 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}
const vpsEnv = loadVpsEnv();

function ssh(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      let out = '', err = '';
      stream.on('close', (code) => resolve({ code, stdout: out, stderr: err }));
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { err += d; });
    });
  });
}
const psql = (q) => `docker exec firebot-postgres psql -U postgres -d telegram_saas -c "${q.replace(/"/g, '\\"')}"`;

(async () => {
  console.log(`\n🧹 Poda do histórico de versões de fluxo${APPLY ? '  [--apply]' : '  [SIMULAÇÃO]'}  — mantendo ${MANTER} por fluxo\n`);

  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res); conn.on('error', rej);
    conn.connect({ host: vpsEnv.VPS_IP, username: vpsEnv.VPS_USER, password: vpsEnv.VPS_PASSWORD, readyTimeout: 30000 });
  });

  // ── Trava de segurança: exige backup recente e válido ─────────────────────
  console.log('=== 1) existe backup recente? (pré-requisito) ===');
  const bk = await ssh(conn, `U=$(ls -t /root/backups/firebot/*.sql.gz 2>/dev/null | grep -v parcial | grep -v rejeitado | head -1); if [ -z "$U" ]; then echo "  NENHUM"; else echo "  $(basename $U) — $(du -h $U | cut -f1) — $(stat -c %y $U | cut -d. -f1)"; fi`);
  if (bk.stdout.includes('NENHUM')) {
    console.log('\n❌ ABORTANDO: sem backup. Rode /usr/local/bin/firebot-backup.sh antes.');
    conn.end(); process.exit(1);
  }

  console.log('\n=== 2) situação atual ===');
  await ssh(conn, psql(`SELECT COUNT(*) AS versoes, pg_size_pretty(pg_total_relation_size('"FlowVersion"')) AS tabela, pg_size_pretty(pg_database_size('telegram_saas')) AS banco FROM "FlowVersion";`));

  console.log('=== 3) o que será apagado ===');
  await ssh(conn, psql(
    `WITH r AS (SELECT id, pg_column_size(nodes)+pg_column_size(config) AS bytes, ROW_NUMBER() OVER (PARTITION BY "flowId" ORDER BY version DESC) AS rn FROM "FlowVersion") ` +
    `SELECT COUNT(*) FILTER (WHERE rn<=${MANTER}) AS mantidas, pg_size_pretty(COALESCE(SUM(bytes) FILTER (WHERE rn<=${MANTER}),0)) AS peso_mantido, ` +
    `COUNT(*) FILTER (WHERE rn>${MANTER}) AS apagadas, pg_size_pretty(COALESCE(SUM(bytes) FILTER (WHERE rn>${MANTER}),0)) AS peso_liberado FROM r;`
  ));

  if (!APPLY) {
    console.log('\n[SIMULAÇÃO] nada foi alterado. Rode com --apply para executar.\n');
    conn.end(); return;
  }

  console.log('=== 4) apagando (em lotes de 25, pra não travar a tabela) ===');
  for (let lote = 1; lote <= 40; lote++) {
    const r = await ssh(conn, psql(
      `WITH r AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY "flowId" ORDER BY version DESC) AS rn FROM "FlowVersion") ` +
      `DELETE FROM "FlowVersion" WHERE id IN (SELECT id FROM r WHERE rn > ${MANTER} LIMIT 25);`
    ));
    const m = r.stdout.match(/DELETE (\d+)/);
    const n = m ? Number(m[1]) : 0;
    if (n === 0) { console.log(`  (fim — nada mais a apagar)`); break; }
    await new Promise(res => setTimeout(res, 400)); // respiro entre lotes
  }

  console.log('\n=== 5) VACUUM ANALYZE (sem lock exclusivo) ===');
  await ssh(conn, psql(`VACUUM (ANALYZE) "FlowVersion";`));

  console.log('=== 6) resultado ===');
  await ssh(conn, psql(`SELECT COUNT(*) AS versoes_restantes, pg_size_pretty(pg_total_relation_size('"FlowVersion"')) AS tabela, pg_size_pretty(pg_database_size('telegram_saas')) AS banco FROM "FlowVersion";`));

  console.log('=== 7) versões restantes por fluxo (amostra) ===');
  await ssh(conn, psql(`SELECT f.name, COUNT(*) AS versoes FROM "FlowVersion" v JOIN "Flow" f ON f.id=v."flowId" GROUP BY f.name ORDER BY 2 DESC LIMIT 8;`));

  console.log('\nObs.: o espaço só volta pro disco com VACUUM FULL (que trava a tabela).');
  console.log('      Mas o BACKUP já encolhe agora, porque o dump lê só as linhas vivas.\n');

  conn.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
