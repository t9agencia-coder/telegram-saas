'use strict';
const express = require('express');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT       = parseInt(process.env.PORT || '3333', 10);
const EMAIL      = process.env.CERT_EMAIL || 'admin@firebot.shop';
const STAGING    = process.env.CERTBOT_STAGING === 'true';
const SITES_AVAIL = '/etc/nginx/sites-available';
const SITES_ENAB  = '/etc/nginx/sites-enabled';
const WEBROOT     = '/var/www/letsencrypt';
const NGINX_PID   = '/run/nginx.pid';
const LE_DIR      = '/etc/letsencrypt';

function log(msg)  { console.log(`[cert-manager] ${msg}`); }
function warn(msg) { console.warn(`[cert-manager][warn] ${msg}`); }

// ── Nginx helpers ─────────────────────────────────────────────────────────────

function nginxReload() {
  try {
    const pid = fs.readFileSync(NGINX_PID, 'utf8').trim();
    execSync(`kill -HUP ${pid}`);
    log('nginx recarregado');
  } catch (e) {
    // fallback
    try { execSync('pkill -HUP nginx'); log('nginx recarregado (pkill)'); }
    catch (e2) { warn('não foi possível recarregar nginx: ' + e2.message); }
  }
}

function writeSiteConfig(domain, content) {
  const avail   = path.join(SITES_AVAIL, domain);
  const enabled = path.join(SITES_ENAB, domain);
  fs.writeFileSync(avail, content);
  try { fs.unlinkSync(enabled); } catch (_) {}
  fs.symlinkSync(avail, enabled);
}

function removeSiteConfig(domain) {
  try { fs.unlinkSync(path.join(SITES_ENAB, domain));  } catch (_) {}
  try { fs.unlinkSync(path.join(SITES_AVAIL, domain)); } catch (_) {}
}

function certExists(domain) {
  return fs.existsSync(path.join(LE_DIR, 'live', domain, 'fullchain.pem'));
}

function httpConfig(domain) {
  return `# FireBot — ${domain} (HTTP — verificação ACME)
server {
    listen 80;
    server_name ${domain};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
`;
}

function sslConfig(domain) {
  return `# FireBot — ${domain}
server {
    server_name ${domain};

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    listen 443 ssl;
    ssl_certificate     ${LE_DIR}/live/${domain}/fullchain.pem;
    ssl_certificate_key ${LE_DIR}/live/${domain}/privkey.pem;
    include             ${LE_DIR}/options-ssl-nginx.conf;
    ssl_dhparam         ${LE_DIR}/ssl-dhparams.pem;
}

server {
    if ($host = ${domain}) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name ${domain};
    return 404;
}
`;
}

// ── Certbot ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function issueCert(domain) {
  fs.mkdirSync(WEBROOT, { recursive: true });

  const args = [
    'certonly',
    '--webroot',
    '-w', WEBROOT,
    '-d', domain,
    '--non-interactive',
    '--agree-tos',
    '-m', EMAIL,
  ];
  if (STAGING) args.push('--staging');
  if (certExists(domain)) args.push('--expand', '--keep-until-expiring');

  execFileSync('certbot', args, { stdio: 'inherit', timeout: 120_000 });
  log(`cert emitido para ${domain}`);
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// POST /provision  { domain }
app.post('/provision', async (req, res) => {
  const { domain } = req.body || {};
  if (!domain) return res.status(400).json({ ok: false, error: 'domain obrigatório' });

  log(`provisioning SSL para ${domain}`);

  try {
    // 1. Config HTTP para challenge
    writeSiteConfig(domain, httpConfig(domain));
    nginxReload();
    // Aguarda nginx recarregar completamente antes de o certbot iniciar
    await sleep(2000);

    // 2. Certbot
    await issueCert(domain);

    // 3. Config SSL
    writeSiteConfig(domain, sslConfig(domain));
    nginxReload();

    log(`SSL ativo para https://${domain}`);
    res.json({ ok: true, domain });
  } catch (e) {
    warn(`falha ao provisionar ${domain}: ${e.message}`);
    // Se algo falhou, tentar limpar config temporária para não deixar nginx quebrado
    try { removeSiteConfig(domain); nginxReload(); } catch (_) {}
    res.status(500).json({ ok: false, error: e.message, stderr: e.stderr?.toString() });
  }
});

// POST /remove  { domain }
app.post('/remove', (req, res) => {
  const { domain } = req.body || {};
  if (!domain) return res.status(400).json({ ok: false, error: 'domain obrigatório' });

  log(`removendo config para ${domain}`);
  try {
    removeSiteConfig(domain);
    nginxReload();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /status?domain=example.com
app.get('/status', (req, res) => {
  const domain = req.query.domain;
  if (!domain) return res.status(400).json({ ok: false, error: 'domain obrigatório' });

  const hasCert = certExists(domain);
  const hasConfig = fs.existsSync(path.join(SITES_ENAB, domain));
  res.json({ ok: true, domain, hasCert, hasConfig, ssl: hasCert && hasConfig });
});

app.listen(PORT, '0.0.0.0', () => {
  log(`rodando na porta ${PORT} | email=${EMAIL} | staging=${STAGING}`);
});
