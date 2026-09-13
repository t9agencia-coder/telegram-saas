// Roda DENTRO do container backend (docker exec -w /app). Usa decrypt + Prisma do app.
// Limpa base64 (mediaData/fileData) de NODES e de CONFIG (upsells, remarketing
// legado, remarketing multi-slot, orderBump). DRY=1 (default) só relata.
//
// Só remove quando existe OUTRA cópia comprovada do arquivo, em ordem de força:
//   1. MÍDIA-TECA — arquivo nosso, em disco (/app/media). Garantia real: sobrevive
//      a troca/exclusão de bot e a file_id expirado. Nem precisa chamar o Telegram.
//   2. file_id validado no getFile — garantia fraca (é ela que evapora quando o
//      fluxo troca de bot), mantida pro que ainda não passou pela mídia-teca.
//
// A mídia-teca só existe na FireBot. Na XBot (mesma base de código, imagem sem o
// MediaStoreService) o require abaixo falha de propósito e o script segue no
// comportamento antigo — por isso a detecção é opcional, e não um import fixo.
const { decrypt } = require('/app/dist/common/utils/encryption');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const DRY = process.env.DRY !== '0';
const MIN = 100; // ignora fileData/mediaData menor que isso (já vazio)

(async () => {
  const prisma = new PrismaClient();

  // ── mídia-teca (opcional — ver comentário do cabeçalho) ───────────────────
  let store = null;
  try {
    const { MediaStoreService } = require('/app/dist/common/media-store.service');
    store = new MediaStoreService(prisma);
    console.log('mídia-teca: disponível (garantia forte habilitada)');
  } catch (e) {
    console.log('mídia-teca: indisponível nesta instância — só file_id validado');
  }

  const flows = await prisma.flow.findMany();
  const bots = await prisma.telegramBot.findMany();
  const tok = {};
  for (const b of bots) { try { tok[b.id] = decrypt(b.botToken); } catch (e) { console.log('!! decrypt falhou ' + b.id); } }

  const cacheOk = new Map(); // fid -> bool (memo do getFile)
  async function validFileId(botToken, fid) {
    if (!fid) return false;
    const k = botToken.slice(-6) + ':' + fid;
    if (cacheOk.has(k)) return cacheOk.get(k);
    let ok = false;
    try {
      const r = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, { params: { file_id: fid }, timeout: 20000 });
      ok = !!(r.data && r.data.ok);
    } catch (e) {
      const d = (e.response && e.response.data && e.response.data.description) || '';
      ok = /too big/i.test(d); // file_id válido, só grande demais pra baixar
    }
    cacheOk.set(k, ok);
    return ok;
  }

  const T = { stripped: 0, viaTeca: 0, viaFileId: 0, freed: 0, keptNoCache: 0, keptBad: 0 };

  for (const f of flows) {
    if (!f.botId || !tok[f.botId]) continue;
    const bt = tok[f.botId];
    const cfg = f.config || {};
    const mc = cfg.mediaCache || {};
    const assets = cfg.mediaAssets || {};   // chave SEM botId — o arquivo não é de bot nenhum
    const nodes = Array.isArray(f.nodes) ? f.nodes : [];
    let changedNodes = false, changedCfg = false;
    const log = [];

    // helper genérico: obj tem obj[field] base64 grande?
    // `itemKey` é a chave na mídia-teca (nodeId, "upsell:0", "remarketing:2"...).
    async function tryStrip(obj, field, fid, label, itemKey) {
      const v = obj && obj[field];
      if (typeof v !== 'string' || Buffer.byteLength(v, 'utf8') < MIN) return null;
      const bytes = Buffer.byteLength(v, 'utf8');

      // 1) mídia-teca — garantia forte, e sem gastar chamada no Telegram
      const assetId = itemKey ? assets[itemKey] : null;
      if (assetId && store) {
        let temArquivo = false;
        try { temArquivo = await store.exists(assetId); } catch (e) { temArquivo = false; }
        if (temArquivo) {
          T.stripped++; T.viaTeca++; T.freed += bytes;
          log.push(`  ${label}: MÍDIA-TECA -> ${DRY ? 'REMOVERIA' : 'REMOVIDO'} (${(bytes/1048576).toFixed(1)}MB)`);
          if (!DRY) delete obj[field];
          return true;
        }
      }

      // 2) file_id validado — garantia fraca (comportamento antigo)
      if (!fid) { T.keptNoCache++; log.push(`  ${label}: SEM CACHE -> mantém (${(bytes/1048576).toFixed(1)}MB)`); return false; }
      const ok = await validFileId(bt, fid);
      if (!ok) { T.keptBad++; log.push(`  ${label}: file_id INVÁLIDO -> mantém (${(bytes/1048576).toFixed(1)}MB)`); return false; }
      T.stripped++; T.viaFileId++; T.freed += bytes;
      log.push(`  ${label}: file_id OK -> ${DRY ? 'REMOVERIA' : 'REMOVIDO'} (${(bytes/1048576).toFixed(1)}MB) fid=${fid.slice(0,18)}`);
      if (!DRY) delete obj[field];
      return true;
    }

    // ---- 1. NODES ----
    for (const n of nodes) {
      if (n.type !== 'image' && n.type !== 'video') continue;
      const ce = mc[`${n.id}:${f.botId}`];
      const fid = ce && ce.botId === f.botId ? ce.fileId : (ce && ce.fileId);
      const r = await tryStrip(n.data, 'fileData', fid, `node ${n.id}`, n.id);
      if (r) changedNodes = true;
    }

    // ---- 2. CONFIG.upsells[i].mediaData ----
    if (Array.isArray(cfg.upsells)) {
      for (let i = 0; i < cfg.upsells.length; i++) {
        const ce = mc[`upsell:${i}:${f.botId}`];
        const r = await tryStrip(cfg.upsells[i], 'mediaData', ce && ce.fileId, `upsell[${i}]`, `upsell:${i}`);
        if (r) changedCfg = true;
      }
    }

    // ---- 3. CONFIG.remarketings[i] (multi-slot): cache no próprio slot ----
    if (Array.isArray(cfg.remarketings)) {
      for (let i = 0; i < cfg.remarketings.length; i++) {
        const s = cfg.remarketings[i];
        const fid = (s && s.cachedBotId === f.botId) ? s.cachedFileId : null;
        const r = await tryStrip(s, 'mediaData', fid, `remarketing[${i}]`, `remarketing:${i}`);
        if (r) changedCfg = true;
      }
    }

    // ---- 4. CONFIG.remarketing (legado): cache no próprio objeto ----
    if (cfg.remarketing && typeof cfg.remarketing === 'object') {
      const rm = cfg.remarketing;
      const fid = (rm.cachedBotId === f.botId) ? rm.cachedFileId : null;
      const r = await tryStrip(rm, 'mediaData', fid, `remarketing(legado)`, 'remarketing');
      if (r) changedCfg = true;
    }

    // ---- 5. CONFIG.orderBump.mediaData: cache key orderbump:botId ----
    if (cfg.orderBump && typeof cfg.orderBump === 'object') {
      const ce = mc[`orderbump:${f.botId}`];
      const r = await tryStrip(cfg.orderBump, 'mediaData', ce && ce.fileId, `orderBump`, 'orderbump');
      if (r) changedCfg = true;
    }

    if (log.length) {
      console.log(`\nflow ${f.id.slice(0,8)} (active=${f.isActive}) bot=${f.botId.slice(0,8)}`);
      log.forEach(l => console.log(l));
    }

    if (!DRY && (changedNodes || changedCfg)) {
      const data = {};
      if (changedNodes) data.nodes = nodes;
      if (changedCfg) data.config = cfg;
      await prisma.flow.update({ where: { id: f.id }, data });
      console.log(`  >> flow ${f.id.slice(0,8)} salvo (${Object.keys(data).join('+')})`);
    }
  }

  console.log(`\n===== ${DRY ? '[DRY RUN] ' : ''}RESUMO =====`);
  console.log(`itens limpos:              ${T.stripped}  (mídia-teca: ${T.viaTeca} | file_id: ${T.viaFileId})`);
  console.log(`mantidos (sem cache):      ${T.keptNoCache}`);
  console.log(`mantidos (file_id ruim):   ${T.keptBad}`);
  console.log(`espaço liberado:           ${(T.freed/1048576).toFixed(1)} MB`);
  await prisma.$disconnect();
})().catch(e => { console.error('FALHOU:', e); process.exit(1); });
