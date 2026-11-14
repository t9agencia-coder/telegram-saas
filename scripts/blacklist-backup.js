// Backup / restauração das blacklists (IpBlacklist, TelegramBlacklist, KwaiReviewerIp).
// Roda DENTRO do container do backend (usa o Prisma Client de lá):
//
//   Exportar:
//     docker cp scripts/blacklist-backup.js firebot-backend:/app/bl.js
//     docker exec -w /app firebot-backend node bl.js export > blacklist-AAAA-MM-DD.json
//
//   Restaurar (VPS nova, depois do primeiro deploy):
//     docker cp blacklist-AAAA-MM-DD.json firebot-backend:/app/bl.json
//     docker exec -w /app firebot-backend node bl.js import bl.json
//
// A importação é idempotente: o que já existe (mesmo ip / telegramId / ipKey)
// fica como está, só o que falta é criado. Nunca apaga nada.
// O arquivo exportado tem IPs e Telegram IDs — NÃO versionar (repo público).
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const data = (v) => (v ? new Date(v) : undefined);

async function exportar() {
  const [IpBlacklist, TelegramBlacklist, KwaiReviewerIp] = await Promise.all([
    prisma.ipBlacklist.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.telegramBlacklist.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.kwaiReviewerIp.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);
  process.stdout.write(JSON.stringify({ exportadoEm: new Date(), IpBlacklist, TelegramBlacklist, KwaiReviewerIp }, null, 2));
}

async function importar(arquivo) {
  const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const novos = { IpBlacklist: 0, TelegramBlacklist: 0, KwaiReviewerIp: 0 };

  for (const r of d.IpBlacklist || []) {
    const ok = await prisma.ipBlacklist.createMany({
      data: [{ ip: r.ip, telegramId: r.telegramId ?? null, reason: r.reason ?? null, createdBy: r.createdBy ?? null, createdAt: data(r.createdAt) }],
      skipDuplicates: true,
    });
    novos.IpBlacklist += ok.count;
  }
  for (const r of d.TelegramBlacklist || []) {
    const ok = await prisma.telegramBlacklist.createMany({
      data: [{ telegramId: r.telegramId, reason: r.reason ?? null, createdBy: r.createdBy ?? null, createdAt: data(r.createdAt) }],
      skipDuplicates: true,
    });
    novos.TelegramBlacklist += ok.count;
  }
  for (const r of d.KwaiReviewerIp || []) {
    const ok = await prisma.kwaiReviewerIp.createMany({
      data: [{ ipKey: r.ipKey, lastIp: r.lastIp ?? null, reason: r.reason, hits: r.hits ?? 1, createdAt: data(r.createdAt), lastSeenAt: data(r.lastSeenAt) }],
      skipDuplicates: true,
    });
    novos.KwaiReviewerIp += ok.count;
  }
  console.log('Restaurado (novos registros):', novos);
  console.log('No arquivo:', {
    IpBlacklist: (d.IpBlacklist || []).length,
    TelegramBlacklist: (d.TelegramBlacklist || []).length,
    KwaiReviewerIp: (d.KwaiReviewerIp || []).length,
  });
}

const [modo, arquivo] = process.argv.slice(2);
(modo === 'export' ? exportar() : modo === 'import' && arquivo ? importar(arquivo) : Promise.reject(new Error('uso: node bl.js export | import <arquivo.json>')))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
