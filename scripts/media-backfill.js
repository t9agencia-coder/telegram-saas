#!/usr/bin/env node
'use strict';

/**
 * media-backfill.js — Fase 2 da mídia-teca: resgatar o passado.
 *
 * A partir da Fase 1, toda mídia NOVA já nasce guardada em disco. Este script
 * cuida do que veio antes: percorre todos os fluxos e traz pra mídia-teca o
 * arquivo original de cada item de mídia que ainda não tem um.
 *
 * Ordem de resgate por item (a primeira que funcionar vence):
 *   1. base64 ainda no fluxo      → melhor caso, nem toca no Telegram
 *   2. URL pública                → baixa da origem
 *   3. file_id de um bot VIVO     → getFile com o token do bot DONO (≤ 20 MB)
 *
 * Se nenhuma funcionar, o item entra no relatório de "precisa reenviar" com o
 * motivo exato (bot dono excluído, arquivo grande demais, sem fonte nenhuma).
 *
 * É idempotente: item que já está na mídia-teca é pulado. Pode rodar quantas
 * vezes quiser.
 *
 * Uso:
 *   node scripts/media-backfill.js --dry-run   (só relata, não grava nada)
 *   node scripts/media-backfill.js             (resgata de verdade)
 */

const { Client } = require('ssh2');
const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

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

if (!vpsEnv.VPS_IP || !vpsEnv.VPS_USER || !vpsEnv.VPS_PASSWORD) {
  console.error('VPS_IP/VPS_USER/VPS_PASSWORD ausentes em .env.vps');
  process.exit(1);
}

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

// ── Script executado DENTRO do container (tem prisma, decrypt, MediaStoreService
//    e o volume /app/media montado) ────────────────────────────────────────────
const inner = `
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { decrypt } = require('/app/dist/common/utils/encryption');
const { MediaStoreService } = require('/app/dist/common/media-store.service');
const { saveMediaAssetRef } = require('/app/dist/common/media-cache-store');
const axios = require('/app/node_modules/axios');

const DRY_RUN = ${DRY_RUN};
const MAX_GETFILE = 20 * 1024 * 1024; // limite real do Bot API pra download

(async () => {
  const prisma = new PrismaClient();
  const store = new MediaStoreService(prisma);

  const bots = await prisma.telegramBot.findMany();
  const botById = new Map(bots.map(b => [b.id, b]));
  const tokenCache = new Map();
  const tokenOf = (id) => {
    if (!tokenCache.has(id)) {
      const b = botById.get(id);
      tokenCache.set(id, b ? decrypt(b.botToken) : null);
    }
    return tokenCache.get(id);
  };

  const flows = await prisma.flow.findMany({ include: { bot: true } });
  console.log((DRY_RUN ? '[SIMULAÇÃO] ' : '') + 'varrendo ' + flows.length + ' fluxos, ' + bots.length + ' bots vivos\\n');

  const stats = { ja: 0, base64: 0, url: 0, telegram: 0, botExcluido: 0, grande: 0, semFonte: 0, erro: 0 };
  const precisaReenviar = [];
  let bytesResgatados = 0;

  for (const flow of flows) {
    const cfg = flow.config || {};
    const mc = cfg.mediaCache || {};
    const assets = cfg.mediaAssets || {};
    const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];

    // Monta a lista de itens de mídia do fluxo, no mesmo vocabulário do
    // collectItems() do warmup — chave SEM botId (a mídia-teca é por arquivo).
    const itens = [];
    for (const n of nodes) {
      if (n.type !== 'image' && n.type !== 'video') continue;
      itens.push({
        key: n.id,
        label: n.type === 'image' ? 'Imagem' : 'Vídeo',
        type: n.type === 'image' ? 'photo' : 'video',
        raw: n.data?.fileData, url: n.data?.fileUrl,
        cachePrefix: n.id,
      });
    }
    (cfg.upsells || []).forEach((u, i) => {
      if (!u?.enabled || (u.mediaType !== 'image' && u.mediaType !== 'video')) return;
      itens.push({
        key: 'upsell:' + i, label: 'Upsell ' + (i+1),
        type: u.mediaType === 'image' ? 'photo' : 'video',
        raw: u.mediaData, url: u.mediaUrl,
        cachePrefix: 'upsell:' + i,
      });
    });
    const lg = cfg.remarketing;
    if (lg?.enabled && (lg.mediaType === 'image' || lg.mediaType === 'video')) {
      itens.push({
        key: 'remarketing', label: 'Remarketing',
        type: lg.mediaType === 'image' ? 'photo' : 'video',
        raw: lg.mediaData, url: lg.mediaUrl,
        directFileId: lg.cachedFileId, directBotId: lg.cachedBotId,
      });
    }
    (cfg.remarketings || []).forEach((s, i) => {
      if (!s?.enabled || (s.mediaType !== 'image' && s.mediaType !== 'video')) return;
      itens.push({
        key: 'remarketing:' + i, label: 'Remarketing ' + (i+1),
        type: s.mediaType === 'image' ? 'photo' : 'video',
        raw: s.mediaData, url: s.mediaUrl,
        directFileId: s.cachedFileId, directBotId: s.cachedBotId,
      });
    });

    for (const it of itens) {
      // 0) já resgatado antes? (idempotência)
      if (assets[it.key] && await store.exists(assets[it.key])) { stats.ja++; continue; }

      // Identificar por NOME só não basta: é comum vários fluxos chamados "1".
      // O bot é o que o dono reconhece de verdade na tela.
      const reportar = (motivo) => precisaReenviar.push({
        fluxo: flow.name,
        bot: flow.bot ? '@' + flow.bot.username : 'sem bot',
        fluxoId: flow.id, item: it.label, motivo,
      });

      try {
        let buf = null, mime = it.type === 'photo' ? 'image/jpeg' : 'video/mp4', via = null;

        // 1) base64 ainda dentro do fluxo — caminho ideal, offline
        if (it.raw && String(it.raw).length > 100) {
          const p = MediaStoreService.parseDataUri(String(it.raw));
          if (p) { buf = p.buf; mime = p.mime; via = 'base64'; }
        }

        // 2) URL pública
        if (!buf && it.url) {
          try {
            const r = await axios.get(it.url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 60*1024*1024 });
            buf = Buffer.from(r.data);
            mime = String(r.headers['content-type'] || mime).split(';')[0];
            via = 'url';
          } catch (e) { /* cai pro Telegram */ }
        }

        // 3) file_id de qualquer bot que AINDA EXISTA (usa o token do dono)
        if (!buf) {
          const candidatos = [];
          if (it.directFileId && it.directBotId) candidatos.push({ fileId: it.directFileId, botId: it.directBotId });
          if (it.cachePrefix) {
            for (const [k, v] of Object.entries(mc)) {
              if (k.startsWith(it.cachePrefix + ':') && v?.fileId && v?.botId) candidatos.push({ fileId: v.fileId, botId: v.botId });
            }
          }
          const vivos = candidatos.filter(c => botById.has(c.botId));
          if (!candidatos.length) { stats.semFonte++; reportar('nunca teve arquivo'); continue; }
          if (!vivos.length)      { stats.botExcluido++; reportar('bot dono foi excluído — arquivo irrecuperável'); continue; }

          let ultimoErro = null;
          for (const c of vivos) {
            const token = tokenOf(c.botId);
            if (!token) continue;
            try {
              const gf = await axios.get('https://api.telegram.org/bot' + token + '/getFile', { params: { file_id: c.fileId }, timeout: 15000 });
              const fp = gf.data?.result?.file_path;
              const sz = gf.data?.result?.file_size || 0;
              if (!fp) { ultimoErro = 'sem file_path'; continue; }
              if (sz > MAX_GETFILE) { ultimoErro = 'grande demais'; continue; }
              const dl = await axios.get('https://api.telegram.org/file/bot' + token + '/' + fp, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: 60*1024*1024 });
              buf = Buffer.from(dl.data);
              via = 'telegram(@' + botById.get(c.botId).username + ')';
              break;
            } catch (e) {
              const d = e?.response?.data?.description || e.message;
              ultimoErro = /too big/i.test(d) ? 'grande demais' : d;
            }
          }
          if (!buf) {
            if (ultimoErro === 'grande demais') { stats.grande++; reportar('arquivo acima de 20 MB — o Telegram não devolve'); }
            else { stats.erro++; reportar('falha ao baixar: ' + ultimoErro); }
            continue;
          }
        }

        if (!buf?.length) { stats.semFonte++; reportar('nunca teve arquivo'); continue; }

        if (DRY_RUN) {
          console.log('  [simulado] ' + flow.name + ' / ' + it.label + ' ← ' + via + ' (' + (buf.length/1024/1024).toFixed(2) + ' MB)');
        } else {
          const asset = await store.store(flow.workspaceId, buf, { mime, type: it.type });
          await saveMediaAssetRef(prisma, flow.id, it.key, asset.id);
          console.log('  ✅ ' + flow.name + ' / ' + it.label + ' ← ' + via + ' (' + (buf.length/1024/1024).toFixed(2) + ' MB' + (asset.deduped ? ', dedupe' : '') + ')');
        }
        bytesResgatados += buf.length;
        if (via === 'base64') stats.base64++; else if (via === 'url') stats.url++; else stats.telegram++;
      } catch (e) {
        stats.erro++; reportar('erro inesperado: ' + e.message);
      }
    }
  }

  console.log('\\n' + '='.repeat(64));
  console.log((DRY_RUN ? 'SIMULAÇÃO — nada foi gravado' : 'RESGATE CONCLUÍDO'));
  console.log('='.repeat(64));
  console.log('já estavam na mídia-teca ....... ' + stats.ja);
  console.log('resgatados do base64 do fluxo .. ' + stats.base64);
  console.log('resgatados de URL .............. ' + stats.url);
  console.log('resgatados do Telegram ......... ' + stats.telegram);
  console.log('volume resgatado ............... ' + (bytesResgatados/1024/1024).toFixed(1) + ' MB');
  console.log('-'.repeat(64));
  console.log('bot dono excluído (perda) ...... ' + stats.botExcluido);
  console.log('acima de 20 MB (perda) ......... ' + stats.grande);
  console.log('nunca tiveram arquivo .......... ' + stats.semFonte);
  console.log('erros ao baixar ................ ' + stats.erro);

  if (precisaReenviar.length) {
    console.log('\\n### PRECISA REENVIAR MANUALMENTE (' + precisaReenviar.length + ') ###');
    for (const p of precisaReenviar) {
      console.log('  • ' + p.bot + ' · fluxo "' + p.fluxo + '" → ' + p.item + ' — ' + p.motivo);
      console.log('    ' + p.fluxoId);
    }
  } else {
    console.log('\\n✅ nada ficou pendente de reenvio manual');
  }

  const uso = await store.usage();
  console.log('\\nmídia-teca agora: ' + uso.assets + ' arquivo(s), ' + (uso.totalBytes/1024/1024).toFixed(1) + ' MB');

  await prisma.\$disconnect();
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
`;

(async () => {
  console.log(`\n🎞️  Mídia-teca — Fase 2 (resgate do passado)${DRY_RUN ? '  [--dry-run]' : ''}`);
  console.log(`   ${vpsEnv.VPS_USER}@${vpsEnv.VPS_IP}\n`);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({
      host: vpsEnv.VPS_IP, username: vpsEnv.VPS_USER,
      password: vpsEnv.VPS_PASSWORD, readyTimeout: 30000,
    });
  });

  const b64 = Buffer.from(inner).toString('base64');
  const r = await ssh(conn, `echo ${b64} | base64 -d | docker exec -i firebot-backend node`);
  if (r.stderr) console.error(r.stderr);
  conn.end();
  process.exit(r.code === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
