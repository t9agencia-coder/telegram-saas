#!/usr/bin/env node
'use strict';

/**
 * media-gc.js — Fase 4 da mídia-teca: limpeza de arquivo órfão.
 *
 * Remove da mídia-teca o arquivo que NENHUM fluxo aponta mais (bloco apagado,
 * mídia trocada, fluxo excluído). Sem isso o disco só cresce.
 *
 * Três travas de segurança, porque apagar mídia de cliente é irreversível:
 *   1. Carência: só considera asset com mais de N dias (padrão 30). Mídia
 *      recém-criada nunca é tocada, mesmo que ainda não esteja referenciada
 *      (ex.: upload feito mas o fluxo ainda não salvou).
 *   2. Varre TODOS os fluxos antes de decidir — um asset referenciado por
 *      qualquer fluxo, de qualquer workspace, é preservado.
 *   3. `--dry-run` é o padrão implícito recomendado: sem `--apply`, só relata.
 *
 * Uso:
 *   node scripts/media-gc.js                 (só relata)
 *   node scripts/media-gc.js --apply         (apaga de verdade)
 *   node scripts/media-gc.js --apply --dias=60
 */

const { Client } = require('ssh2');
const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DIAS  = Number((process.argv.find(a => a.startsWith('--dias=')) || '--dias=30').split('=')[1]) || 30;

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
      stream.on('data', (d) => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', (d) => { err += d; });
    });
  });
}

const inner = `
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const fsp = require('fs/promises');

const APPLY = ${APPLY};
const DIAS = ${DIAS};
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/app/media';

(async () => {
  const prisma = new PrismaClient();

  // 1) todo assetId referenciado por QUALQUER fluxo (trava de segurança 2)
  const flows = await prisma.flow.findMany({ select: { id: true, config: true } });
  const referenciados = new Set();
  for (const f of flows) {
    const assets = (f.config || {}).mediaAssets || {};
    for (const id of Object.values(assets)) if (id) referenciados.add(String(id));
  }
  console.log('assets referenciados por algum fluxo: ' + referenciados.size);

  // 2) candidatos: fora da carência e sem referência
  const corte = new Date(Date.now() - DIAS * 24 * 3600 * 1000);
  const todos = await prisma.mediaAsset.findMany();
  const orfaos = todos.filter(a => !referenciados.has(a.id) && a.createdAt < corte);
  const novosSemRef = todos.filter(a => !referenciados.has(a.id) && a.createdAt >= corte);

  console.log('total na mídia-teca ............ ' + todos.length + ' (' + (todos.reduce((s,a)=>s+a.sizeBytes,0)/1024/1024).toFixed(1) + ' MB)');
  console.log('órfãos fora da carência ........ ' + orfaos.length + ' (' + (orfaos.reduce((s,a)=>s+a.sizeBytes,0)/1024/1024).toFixed(1) + ' MB)');
  console.log('sem referência mas recentes .... ' + novosSemRef.length + ' (preservados pela carência de ' + DIAS + ' dias)');

  if (!orfaos.length) { console.log('\\n✅ nada a limpar'); await prisma.\$disconnect(); return; }

  let liberados = 0;
  for (const a of orfaos) {
    // O arquivo em disco é compartilhado por hash: só apaga quando NENHUM outro
    // asset (de outro workspace) usa o mesmo conteúdo.
    const outros = await prisma.mediaAsset.count({ where: { sha256: a.sha256, id: { not: a.id } } });
    const caminho = MEDIA_ROOT + '/' + a.sha256.slice(0,2) + '/' + a.sha256;
    if (APPLY) {
      await prisma.mediaAsset.delete({ where: { id: a.id } });
      if (outros === 0) await fsp.unlink(caminho).catch(() => {});
      liberados += a.sizeBytes;
      console.log('  removido: ' + a.sha256.slice(0,12) + ' (' + (a.sizeBytes/1024/1024).toFixed(2) + ' MB)' + (outros ? ' [linha só — arquivo ainda usado por outro workspace]' : ''));
    } else {
      liberados += a.sizeBytes;
      console.log('  [simulado] removeria: ' + a.sha256.slice(0,12) + ' (' + (a.sizeBytes/1024/1024).toFixed(2) + ' MB, criado ' + a.createdAt.toISOString().slice(0,10) + ')');
    }
  }

  console.log('\\n' + (APPLY ? '✅ liberado: ' : '[simulação] liberaria: ') + (liberados/1024/1024).toFixed(1) + ' MB');
  if (!APPLY) console.log('rode de novo com --apply pra executar de verdade');

  await prisma.\$disconnect();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
`;

(async () => {
  console.log(`\n🧹 Mídia-teca — limpeza de órfãos${APPLY ? '  [--apply]' : '  [simulação]'}  carência: ${DIAS} dias`);
  console.log(`   ${vpsEnv.VPS_USER}@${vpsEnv.VPS_IP}\n`);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({ host: vpsEnv.VPS_IP, username: vpsEnv.VPS_USER, password: vpsEnv.VPS_PASSWORD, readyTimeout: 30000 });
  });

  const b64 = Buffer.from(inner).toString('base64');
  const r = await ssh(conn, `echo ${b64} | base64 -d | docker exec -i firebot-backend node`);
  if (r.stderr) console.error(r.stderr);
  conn.end();
  process.exit(r.code === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
