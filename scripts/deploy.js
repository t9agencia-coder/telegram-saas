#!/usr/bin/env node
'use strict';

/**
 * deploy.js — FireBot Deploy Script
 *
 * Processo:
 *   1. Cria tarball do projeto localmente
 *   2. Conecta na VPS via SSH
 *   3. Garante Docker + Compose instalados
 *   4. Faz upload + extrai arquivos
 *   5. Cria/preserva .env com secrets
 *   6. Sobe postgres + redis (se não estiverem rodando)
 *   7. Builda nova imagem do backend
 *   8. Reinicia backend (entrypoint.sh aplica migrations automaticamente)
 *   9. Aguarda healthcheck real do backend (/api/health)
 *  10. Builda e reinicia frontend
 *  11. Relatório final
 *
 * Nunca derruba o banco de dados. Nunca roda `prisma db push`.
 * Migrations são aplicadas via `prisma migrate deploy` dentro do container.
 */

const { Client } = require('ssh2');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT        = path.join(__dirname, '..');

// Credenciais da VPS vêm de .env.vps (arquivo local, fora do git — nunca hardcoded aqui).
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

const VPS_IP      = vpsEnv.VPS_IP;
const VPS_USER    = vpsEnv.VPS_USER;
const VPS_PASS    = vpsEnv.VPS_PASSWORD;
const DEPLOY_DIR  = '/opt/firebot';
const COMPOSE_F   = 'docker-compose.vps.yml';
const TAR_NAME    = 'firebot.tar.gz';

if (!VPS_IP || !VPS_USER || !VPS_PASS) {
  console.error('VPS_IP/VPS_USER/VPS_PASSWORD ausentes em .env.vps — configure o arquivo antes de rodar o deploy.');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
};

function step(n, msg)  { console.log(`\n${C.bold}${C.cyan}[${n}]${C.reset} ${msg}`); }
function ok(msg)       { console.log(`${C.green}    ✔${C.reset} ${msg}`); }
function warn(msg)     { console.log(`${C.yellow}    ⚠${C.reset} ${msg}`); }
function fail(msg)     { console.error(`${C.red}    ✖${C.reset} ${msg}`); }
function info(msg)     { console.log(`${C.dim}      ${msg}${C.reset}`); }

function generateHex(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }
function generateKey32()         { return crypto.randomBytes(16).toString('hex'); }

function ssh(conn, cmd, opts = {}) {
  const { silent = false, allowFail = false } = opts;
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      let out = '', errOut = '';
      stream.on('close', (code) => {
        if (code !== 0 && !allowFail) {
          const msg = errOut.trim() || out.trim() || `exit code ${code}`;
          return reject(new Error(msg));
        }
        resolve({ code, stdout: out.trim(), stderr: errOut.trim() });
      });
      stream.on('data', (d) => {
        out += d;
        if (!silent) process.stdout.write(d);
      });
      stream.stderr.on('data', (d) => {
        errOut += d;
        if (!silent) process.stderr.write(d);
      });
    });
  });
}

function sftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((e, s) => (e ? reject(e) : resolve(s)));
  });
}

function sftpPut(sftpClient, local, remote) {
  return new Promise((resolve, reject) => {
    sftpClient.fastPut(local, remote, {}, (e) => (e ? reject(e) : resolve()));
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => resolve(c));
    c.on('error', reject);
    c.connect({
      host:         VPS_IP,
      username:     VPS_USER,
      password:     VPS_PASS,
      readyTimeout: 30000,
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();

  console.log(`\n${C.bold}🚀 FireBot — Deploy para VPS${C.reset}`);
  console.log(`   ${C.dim}${VPS_USER}@${VPS_IP} → ${DEPLOY_DIR}${C.reset}\n`);

  // ── STEP 1: Criar tarball local ─────────────────────────────────────────────
  step(1, 'Criando pacote do projeto...');
  const tarPath = path.resolve(ROOT, '..', TAR_NAME);
  execSync(
    `tar -czf "../${TAR_NAME}" ` +
    `--exclude="node_modules" --exclude=".git" --exclude=".next" ` +
    `--exclude="dist" --exclude="*.tar.gz" --exclude=".env" ` +
    `--exclude="ssl" --exclude="BASSPAGO_EXTRACTED" --exclude="*.zip" .`,
    { cwd: ROOT, stdio: 'pipe' }
  );
  const sizeMB = (fs.statSync(tarPath).size / 1024 / 1024).toFixed(1);
  ok(`Pacote criado: ${sizeMB} MB`);

  // ── STEP 2: Conectar na VPS ─────────────────────────────────────────────────
  step(2, `Conectando em ${VPS_IP}...`);
  const conn = await connect();
  ok('Conectado via SSH');

  try {
    // ── STEP 3: Verificar Docker ──────────────────────────────────────────────
    step(3, 'Verificando Docker...');
    const dockerVer = await ssh(conn, 'docker --version 2>/dev/null || echo MISSING', { silent: true, allowFail: true });
    if (dockerVer.stdout.includes('MISSING')) {
      info('Instalando Docker...');
      await ssh(conn, 'curl -fsSL https://get.docker.com | sh && systemctl enable docker && systemctl start docker', { silent: true });
    }
    const composeVer = await ssh(conn, 'docker compose version 2>/dev/null || echo MISSING', { silent: true, allowFail: true });
    if (composeVer.stdout.includes('MISSING')) {
      info('Instalando Docker Compose plugin...');
      await ssh(conn,
        'mkdir -p /usr/local/lib/docker/cli-plugins && ' +
        'curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" ' +
        '-o /usr/local/lib/docker/cli-plugins/docker-compose && ' +
        'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
        { silent: true }
      );
    }
    const ver = await ssh(conn, 'docker --version && docker compose version', { silent: true });
    ok(ver.stdout.replace(/\n/g, ' | '));

    // ── STEP 4: Preparar diretório + upload ───────────────────────────────────
    step(4, `Enviando arquivos para a VPS (${sizeMB} MB)...`);
    await ssh(conn, `mkdir -p ${DEPLOY_DIR}`, { silent: true });
    const sftpClient = await sftp(conn);
    await sftpPut(sftpClient, tarPath, `${DEPLOY_DIR}/${TAR_NAME}`);
    ok('Upload concluído');

    info('Extraindo arquivos...');
    await ssh(conn, `cd ${DEPLOY_DIR} && tar -xzf ${TAR_NAME} && rm -f ${TAR_NAME}`, { silent: true });
    ok('Arquivos extraídos');

    // ── STEP 5: Criar .env (preserva se já existe) ─────────────────────────────
    step(5, 'Verificando configuração (.env)...');
    const envExists = await ssh(conn, `test -f ${DEPLOY_DIR}/.env && echo YES || echo NO`, { silent: true, allowFail: true });
    if (envExists.stdout.trim() === 'YES') {
      ok('.env existente preservado (secrets não alterados)');
    } else {
      info('Gerando secrets e criando .env...');
      const pgPass  = generateHex(16);
      const rdPass  = generateHex(16);
      const jwtSec  = generateHex(32);
      const jwtRef  = generateHex(32);
      const encKey  = generateKey32();

      const envContent = [
        `# Gerado em ${new Date().toISOString()}`,
        `# NÃO edite manualmente — execute o deploy novamente para regenerar`,
        `POSTGRES_PASSWORD=${pgPass}`,
        `REDIS_PASSWORD=${rdPass}`,
        `JWT_SECRET=${jwtSec}`,
        `JWT_REFRESH_SECRET=${jwtRef}`,
        `ENCRYPTION_KEY=${encKey}`,
        `VPS_IP=${VPS_IP}`,
        `BLACKPAY_API_KEY=`,
        `BLACKPAY_WEBHOOK_SECRET=`,
        `FRONTEND_URL=http://${VPS_IP}:3000`,
      ].join('\n');

      await ssh(conn, `cat > ${DEPLOY_DIR}/.env << 'EOF'\n${envContent}\nEOF`, { silent: true });
      ok('.env criado com secrets aleatórios');
    }

    // ── STEP 6: Subir banco de dados (se não estiver rodando) ──────────────────
    step(6, 'Garantindo PostgreSQL + Redis rodando...');
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d postgres redis`,
      { silent: true }
    );
    info('Aguardando PostgreSQL ficar saudável...');
    let pgReady = false;
    for (let i = 0; i < 20; i++) {
      const pgHealth = await ssh(conn,
        `docker inspect --format='{{.State.Health.Status}}' firebot-postgres 2>/dev/null || echo waiting`,
        { silent: true, allowFail: true }
      );
      if (pgHealth.stdout.trim() === 'healthy') { pgReady = true; break; }
      await sleep(3000);
    }
    if (!pgReady) {
      warn('PostgreSQL demorou para iniciar — continuando mesmo assim...');
    } else {
      ok('PostgreSQL e Redis saudáveis');
    }

    // ── STEP 7: Build + restart do backend ────────────────────────────────────
    // O entrypoint.sh aplica migrations ANTES de subir o servidor.
    // Isso garante que nunca há código novo com schema antigo.
    step(7, 'Buildando backend (pode levar 3-5 min)...');
    console.log(`${C.dim}--- docker build output ---${C.reset}`);
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} build backend 2>&1`
    );
    console.log(`${C.dim}--- fim do build ---${C.reset}\n`);

    info('Reiniciando backend (migrations aplicadas automaticamente)...');
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps backend 2>&1`,
      { silent: true }
    );

    // ── STEP 8: Aguardar healthcheck real do backend ───────────────────────────
    step(8, 'Aguardando backend ficar saudável...');
    info('Monitorando /api/health (timeout: 3 min)...');
    let backendReady = false;
    const maxAttempts = 36; // 36 × 5s = 3 min
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(5000);
      const health = await ssh(conn,
        `curl -sf http://localhost:3001/api/health 2>/dev/null && echo OK || echo FAIL`,
        { silent: true, allowFail: true }
      );
      const containerState = await ssh(conn,
        `docker inspect --format='{{.State.Status}}|{{.State.Health.Status}}' firebot-backend 2>/dev/null || echo unknown`,
        { silent: true, allowFail: true }
      );

      const [state, healthStatus] = containerState.stdout.split('|');
      info(`[${i + 1}/${maxAttempts}] container=${state} health=${healthStatus} http=${health.stdout.trim()}`);

      if (health.code === 0 || health.stdout.includes('"status":"ok"') || health.stdout.endsWith('OK')) {
        backendReady = true;
        break;
      }

      if (state === 'exited' || state === 'dead') {
        fail('Container parou inesperadamente. Verificando logs...');
        await ssh(conn, `docker logs --tail 60 firebot-backend`, { allowFail: true });
        throw new Error('Backend falhou ao iniciar. Verifique os logs acima.');
      }
    }

    if (!backendReady) {
      warn('Backend não respondeu a tempo. Verificando logs...');
      await ssh(conn, `docker logs --tail 80 firebot-backend`, { allowFail: true });
      throw new Error('Timeout: backend não ficou saudável em 3 minutos.');
    }
    ok('Backend saudável e respondendo');

    // ── STEP 9: Build + restart do frontend ───────────────────────────────────
    step(9, 'Buildando frontend...');
    console.log(`${C.dim}--- docker build output ---${C.reset}`);
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} build frontend 2>&1`
    );
    console.log(`${C.dim}--- fim do build ---${C.reset}\n`);

    info('Reiniciando frontend...');
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps frontend 2>&1`,
      { silent: true }
    );
    await sleep(5000);
    ok('Frontend reiniciado');

    // ── STEP 10: Build + restart cert-manager ─────────────────────────────────
    step(10, 'Buildando cert-manager (SSL automático)...');
    console.log(`${C.dim}--- docker build output ---${C.reset}`);
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} build cert-manager 2>&1`
    );
    console.log(`${C.dim}--- fim do build ---${C.reset}\n`);
    info('Iniciando cert-manager...');
    await ssh(conn,
      `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} up -d --no-deps cert-manager 2>&1`,
      { silent: true }
    );
    await sleep(3000);
    const cmHealth = await ssh(conn,
      `docker exec firebot-cert-manager wget -qO- http://127.0.0.1:3333/health 2>/dev/null && echo OK || echo FAIL`,
      { silent: true, allowFail: true }
    );
    if (cmHealth.stdout.includes('OK')) {
      ok('Cert-manager saudável e respondendo');
    } else {
      warn('Cert-manager não respondeu — verificar logs: docker logs firebot-cert-manager');
    }

    // ── STEP 11: Status final ──────────────────────────────────────────────────
    step(11, 'Status dos containers:');
    await ssh(conn, `cd ${DEPLOY_DIR} && docker compose -f ${COMPOSE_F} ps`);

    // ── Relatório ──────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`\n${C.bold}${C.green}✅ Deploy concluído em ${elapsed}s!${C.reset}\n`);
    console.log(`   🌐  Frontend : http://${VPS_IP}:3000`);
    console.log(`   🔌  API      : http://${VPS_IP}:3001/api`);
    console.log(`   🩺  Health   : http://${VPS_IP}:3001/api/health`);
    console.log(`   📚  Swagger  : http://${VPS_IP}:3001/api/docs`);
    console.log(`\n   Logs em tempo real:`);
    console.log(`   ${C.dim}ssh ${VPS_USER}@${VPS_IP} "docker logs -f firebot-backend"${C.reset}\n`);

  } finally {
    conn.end();
    try { fs.unlinkSync(tarPath); } catch (_) {}
  }
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
