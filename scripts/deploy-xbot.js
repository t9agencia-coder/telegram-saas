#!/usr/bin/env node
'use strict';

/**
 * deploy-xbot.js — XBot Solutions Deploy Script (zero-downtime)
 *
 * Instância separada e isolada na MESMA VPS do FireBot: diretório, compose,
 * containers, rede, banco e portas próprios. NUNCA toca em /opt/firebot nem
 * nos containers firebot-*.
 *
 * XBot é tráfego ao vivo → o backend usa blue-green:
 *   - xbot-backend           :3011  (QUEUE_ROLE=api, primário no upstream do nginx)
 *   - xbot-backend-standby   :3012  (QUEUE_ROLE=worker, `backup` no upstream)
 * O nginx `upstream xbot_api` faz failover pro :3012 durante a recriação do :3011,
 * então a API não cai. Ordem do roll:
 *   1. build da image nova
 *   2. recria o PRIMÁRIO (roda migrations via entrypoint) — o gap é coberto pelo
 *      standby ANTIGO (código de produção atual, seguro)
 *   3. recria o STANDBY (código novo, SKIP_MIGRATIONS, schema já migrado)
 *   4. recria worker e worker-2 (um de cada vez — as filas nunca ficam sem consumidor)
 *   5. build + restart do frontend
 * NÃO mexe em landing nem cert-manager (sobem só sob demanda, fora deste script).
 *
 * Nunca derruba o banco. Nunca roda `prisma db push`. Migrations via
 * `prisma migrate deploy` dentro do container (entrypoint.sh).
 */

const { Client } = require('ssh2');
const fs         = require('fs');
const path       = require('path');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');

function loadVpsEnv() {
  const content = fs.readFileSync(path.join(ROOT, '.env.vps'), 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}
const vpsEnv = loadVpsEnv();

const VPS_IP     = vpsEnv.VPS_IP;
const VPS_USER   = vpsEnv.VPS_USER;
const VPS_PASS   = vpsEnv.VPS_PASSWORD;
const DEPLOY_DIR = '/opt/xbot';
const COMPOSE_F  = 'docker-compose.vps.yml';     // nome final em /opt/xbot (ver STEP 4)
const REPO_COMPOSE = 'docker-compose.xbot.vps.yml'; // nome no repo
const TAR_NAME   = 'xbot.tar.gz';
const PRIMARY_PORT = 3011;
const STANDBY_PORT = 3012;

// --frontend-only: sobe só o frontend. Não toca backend, standby nem workers.
const FRONTEND_ONLY = process.argv.includes('--frontend-only');

if (!VPS_IP || !VPS_USER || !VPS_PASS) {
  console.error('VPS_IP/VPS_USER/VPS_PASSWORD ausentes em .env.vps.');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
};
function step(n, msg) { console.log(`\n${C.bold}${C.cyan}[${n}]${C.reset} ${msg}`); }
function ok(msg)      { console.log(`${C.green}    ✔${C.reset} ${msg}`); }
function warn(msg)    { console.log(`${C.yellow}    ⚠${C.reset} ${msg}`); }
function fail(msg)    { console.error(`${C.red}    ✖${C.reset} ${msg}`); }
function info(msg)    { console.log(`${C.dim}      ${msg}${C.reset}`); }

function ssh(conn, cmd, opts = {}) {
  const { silent = false, allowFail = false } = opts;
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      let out = '', errOut = '';
      stream.on('close', (code) => {
        if (code !== 0 && !allowFail) {
          return reject(new Error(errOut.trim() || out.trim() || `exit code ${code}`));
        }
        resolve({ code, stdout: out.trim(), stderr: errOut.trim() });
      });
      stream.on('data', (d) => { out += d; if (!silent) process.stdout.write(d); });
      stream.stderr.on('data', (d) => { errOut += d; if (!silent) process.stderr.write(d); });
    });
  });
}
function sftp(conn) { return new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s))); }
function sftpPut(s, l, r) { return new Promise((res, rej) => s.fastPut(l, r, {}, (e) => e ? rej(e) : res())); }
function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => resolve(c));
    c.on('error', reject);
    c.connect({ host: VPS_IP, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Espera /api/health responder OK numa porta local da VPS. Fatal por padrão.
async function waitHealth(conn, port, container, { timeoutMs = 180000, fatal = true } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(5000);
    const health = await ssh(conn,
      `curl -sf http://localhost:${port}/api/health 2>/dev/null && echo OK || echo FAIL`,
      { silent: true, allowFail: true });
    const state = await ssh(conn,
      `docker inspect --format='{{.State.Status}}|{{.State.Health.Status}}' ${container} 2>/dev/null || echo unknown`,
      { silent: true, allowFail: true });
    const [st, h] = state.stdout.split('|');
    info(`${container}: status=${st} health=${h} http=${health.stdout.trim()}`);
    if (health.stdout.includes('"status":"ok"') || health.stdout.trim().endsWith('OK')) return true;
    if (st === 'exited' || st === 'dead') {
      await ssh(conn, `docker logs --tail 60 ${container}`, { allowFail: true });
      if (fatal) throw new Error(`${container} parou inesperadamente durante o deploy.`);
      return false;
    }
  }
  await ssh(conn, `docker logs --tail 80 ${container}`, { allowFail: true });
  if (fatal) throw new Error(`Timeout: ${container} não ficou saudável.`);
  warn(`${container} não confirmou saúde no tempo — seguindo (não-fatal).`);
  return false;
}

async function waitContainerHealthy(conn, container, { timeoutMs = 120000, fatal = true } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(5000);
    const w = await ssh(conn,
      `docker inspect --format='{{.State.Status}}|{{.State.Health.Status}}|{{.RestartCount}}' ${container} 2>/dev/null || echo unknown`,
      { silent: true, allowFail: true });
    const [st, h, rc] = w.stdout.trim().split('|');
    info(`${container}: status=${st} health=${h} restarts=${rc}`);
    if (h === 'healthy') return true;
    if (st === 'exited' || st === 'dead' || (rc && parseInt(rc, 10) > 0)) {
      await ssh(conn, `docker logs --tail 50 ${container}`, { allowFail: true });
      if (fatal) throw new Error(`${container} falhou ao iniciar.`);
      return false;
    }
  }
  if (fatal) { await ssh(conn, `docker logs --tail 60 ${container}`, { allowFail: true }); throw new Error(`Timeout: ${container}.`); }
  warn(`${container} não ficou healthy no tempo — seguindo (não-fatal).`);
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  console.log(`\n${C.bold}🚀 XBot Solutions — Deploy zero-downtime${C.reset}${FRONTEND_ONLY ? `  ${C.yellow}(--frontend-only)${C.reset}` : ''}`);
  console.log(`   ${C.dim}${VPS_USER}@${VPS_IP} → ${DEPLOY_DIR}${C.reset}\n`);

  // ── STEP 1: tarball ────────────────────────────────────────────────────────
  step(1, 'Criando pacote do projeto...');
  const tarPath = path.resolve(ROOT, '..', TAR_NAME);
  execSync(
    `tar -czf "../${TAR_NAME}" ` +
    `--exclude="node_modules" --exclude=".git" --exclude=".next" ` +
    `--exclude="dist" --exclude="*.tar.gz" --exclude=".env" ` +
    `--exclude="ssl" --exclude="BASSPAGO_EXTRACTED" --exclude="*.zip" ` +
    `--exclude="docker-compose.vps.yml" .`,   // <- nunca leva o compose do FireBot pra /opt/xbot
    { cwd: ROOT, stdio: 'pipe' }
  );
  const sizeMB = (fs.statSync(tarPath).size / 1024 / 1024).toFixed(1);
  ok(`Pacote criado: ${sizeMB} MB`);

  // ── STEP 2: SSH ───────────────────────────────────────────────────────────
  step(2, `Conectando em ${VPS_IP}...`);
  const conn = await connect();
  ok('Conectado via SSH');

  try {
    // ── STEP 3: sanity ──────────────────────────────────────────────────────
    step(3, 'Checando pré-condições...');
    const envOk = await ssh(conn, `test -f ${DEPLOY_DIR}/.env && echo YES || echo NO`, { silent: true, allowFail: true });
    if (envOk.stdout.trim() !== 'YES') {
      throw new Error(`${DEPLOY_DIR}/.env não existe. Deploy da XBot ABORTADO (nunca gera .env — tem secrets reais).`);
    }
    const running = await ssh(conn, `docker ps --format '{{.Names}}' | grep -c '^xbot-backend$' || true`, { silent: true, allowFail: true });
    if (running.stdout.trim() !== '1') warn('xbot-backend não parece estar rodando — o failover blue-green pode não cobrir o gap.');
    const nginx = await ssh(conn, `grep -l xbot_api /etc/nginx/conf.d/*.conf 2>/dev/null | head -1`, { silent: true, allowFail: true });
    if (!nginx.stdout.trim()) warn('upstream xbot_api não encontrado no nginx — sem failover automático durante o deploy.');
    else info(`upstream nginx: ${nginx.stdout.trim()}`);
    ok('Pré-condições ok');

    // ── STEP 4: upload + extract ────────────────────────────────────────────
    step(4, `Enviando arquivos (${sizeMB} MB)...`);
    await ssh(conn, `mkdir -p ${DEPLOY_DIR}`, { silent: true });
    const sftpClient = await sftp(conn);
    await sftpPut(sftpClient, tarPath, `${DEPLOY_DIR}/${TAR_NAME}`);
    ok('Upload concluído');

    info('Extraindo (src limpo antes; landing-xbot preservada)...');
    // Só apaga o que o tarball repopula 100%. NÃO toca apps/landing-xbot
    // (existe só na VPS) nem docker-compose.vps.yml (vem do mv abaixo).
    await ssh(conn,
      `cd ${DEPLOY_DIR} && rm -rf apps/backend/src apps/backend/prisma apps/frontend/src apps/landing-firebot/src && ` +
      `tar -xzf ${TAR_NAME} && rm -f ${TAR_NAME} && ` +
      `mv -f ${REPO_COMPOSE} ${COMPOSE_F}`,   // o compose da XBot (do repo) vira o compose oficial
      { silent: true },
    );
    ok('Arquivos extraídos');

    // ── STEP 5: pg + redis ─────────────────────────────────────────────────
    step(5, 'Garantindo PostgreSQL + Redis...');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d postgres redis`, { silent: true });
    let pgReady = false;
    for (let i = 0; i < 20; i++) {
      const h = await ssh(conn, `docker inspect --format='{{.State.Health.Status}}' xbot-postgres 2>/dev/null || echo waiting`, { silent: true, allowFail: true });
      if (h.stdout.trim() === 'healthy') { pgReady = true; break; }
      await sleep(3000);
    }
    pgReady ? ok('PostgreSQL e Redis saudáveis') : warn('PostgreSQL demorou — continuando...');

    if (FRONTEND_ONLY) {
      info('--frontend-only: pulando backend, standby e workers.');
    } else {
    // ── STEP 6: build da image do backend ──────────────────────────────────
    step(6, 'Buildando backend (3-5 min)...');
    console.log(`${C.dim}--- docker build ---${C.reset}`);
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} build backend 2>&1`);
    console.log(`${C.dim}--- fim ---${C.reset}\n`);

    // ── STEP 7: BLUE-GREEN roll do backend ─────────────────────────────────
    step(7, 'Roll do backend (blue-green)...');

    // 7a. Primário primeiro: roda migrations via entrypoint. O gap é coberto
    //     pelo standby ANTIGO (:3012, código de produção atual — seguro).
    info('Recriando xbot-backend (primário :3011 — aplica migrations)...');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps backend 2>&1`, { silent: true });
    await waitHealth(conn, PRIMARY_PORT, 'xbot-backend', { timeoutMs: 210000 });
    ok('Primário saudável (schema migrado, código novo)');

    // 7b. Standby: mesma image, SKIP_MIGRATIONS=1, schema já migrado pelo primário.
    info('Recriando xbot-backend-standby (:3012)...');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps backend-standby 2>&1`, { silent: true, allowFail: true });
    await waitHealth(conn, STANDBY_PORT, 'xbot-backend-standby', { timeoutMs: 150000, fatal: false });

    // ── STEP 8: workers (um de cada vez — fila nunca fica sem consumidor) ───
    step(8, 'Roll dos workers...');
    info('Recriando xbot-worker...');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps worker 2>&1`, { silent: true });
    await waitContainerHealthy(conn, 'xbot-worker', { timeoutMs: 150000 });
    ok('xbot-worker no ar');

    info('Recriando xbot-worker-2...');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps worker-2 2>&1`, { silent: true, allowFail: true });
    await waitContainerHealthy(conn, 'xbot-worker-2', { timeoutMs: 150000, fatal: false });
    ok('xbot-worker-2 no ar');
    } // fim do if (!FRONTEND_ONLY)

    // ── STEP 9: frontend ──────────────────────────────────────────────────
    step(9, 'Buildando + reiniciando frontend...');
    console.log(`${C.dim}--- docker build ---${C.reset}`);
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} build frontend 2>&1`);
    console.log(`${C.dim}--- fim ---${C.reset}\n`);
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps frontend 2>&1`, { silent: true });
    await sleep(5000);
    ok('Frontend reiniciado');

    // landing + cert-manager: NÃO tocados de propósito (sobem fora deste script).

    // ── STEP 10: status ───────────────────────────────────────────────────
    step(10, 'Status:');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} ps`);
    info('Health via nginx (externo):');
    await ssh(conn, `curl -s -o /dev/null -w "  api.xbot.solutions/api/health -> %{http_code}\\n" https://api.xbot.solutions/api/health || true`, { allowFail: true });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`\n${C.bold}${C.green}✅ Deploy XBot concluído em ${elapsed}s!${C.reset}\n`);
    console.log(`   🔌  API (interno)  : http://127.0.0.1:${PRIMARY_PORT}/api  (standby :${STANDBY_PORT})`);
    console.log(`   🩺  Health         : http://127.0.0.1:${PRIMARY_PORT}/api/health`);
    console.log(`\n   ${C.dim}ssh ${VPS_USER}@${VPS_IP} "docker logs -f xbot-backend"${C.reset}\n`);

  } finally {
    conn.end();
    try { fs.unlinkSync(tarPath); } catch (_) {}
  }
}

main().catch((e) => { fail(e.message); process.exit(1); });
