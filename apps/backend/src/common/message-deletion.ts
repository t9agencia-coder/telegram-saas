import { PrismaService } from './prisma.service';

// Tempo padrão de exclusão automática para mensagens sem temporizador configurado
export const DEFAULT_DELETION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Busca o temporizador configurado no fluxo (persistido em Flow.config.timerDelayMs).
// Usado por remarketing/upsell, que disparam bem depois da execução do fluxo — o
// mapa em memória do WebhooksService (flowDeletionTimers) não é confiável nesse
// momento (pode já ter sido descartado por reinício do processo ou limite de tamanho).
export async function resolveFlowDeletionDelay(
  prisma: PrismaService,
  flowId: string | null | undefined,
): Promise<number> {
  if (!flowId) return DEFAULT_DELETION_MS;
  try {
    // Extrai só timerDelayMs — `select: { config }` puxava o config inteiro
    // (dezenas de MB de mídia base64) só pra ler um número.
    const rows = await prisma.$queryRaw<Array<{ ms: bigint | null }>>`
      SELECT (config->>'timerDelayMs')::bigint AS ms FROM "Flow" WHERE id = ${flowId}
    `;
    const ms = rows?.[0]?.ms;
    return ms != null ? Number(ms) : DEFAULT_DELETION_MS;
  } catch {
    return DEFAULT_DELETION_MS;
  }
}
