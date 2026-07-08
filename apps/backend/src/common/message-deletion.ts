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
    const flow = await prisma.flow.findUnique({ where: { id: flowId }, select: { config: true } });
    return (flow?.config as any)?.timerDelayMs ?? DEFAULT_DELETION_MS;
  } catch {
    return DEFAULT_DELETION_MS;
  }
}
