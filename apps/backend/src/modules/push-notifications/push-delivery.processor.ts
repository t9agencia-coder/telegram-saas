import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../common/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { PUSH_NOTIFICATION_QUEUE } from './push-notifications.service';
import { FcmService } from './fcm.service';

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:suporte@firebot.shop';

type FcmJobData = {
  tokens: string[];
  notification: { title: string; body: string };
  data: Record<string, string>;
};

// Worker das notificações push. Concorrência alta porque cada job é independente
// (um dispositivo) e a entrega em si é rápida (< 2s é a meta) — sem fila de espera
// artificial como nos webhooks de saída (aqui não tem backoff customizado de
// minutos, só o exponential padrão pra falha de rede transitória).
@Processor(PUSH_NOTIFICATION_QUEUE, { concurrency: 20 })
export class PushDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(PushDeliveryProcessor.name);

  constructor(
    private prisma: PrismaService,
    private platformSettings: PlatformSettingsService,
    private fcm: FcmService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'deliver-fcm') {
      return this.deliverFcm(job.data as FcmJobData);
    }
    return this.deliverWebPush(job.data as { subscriptionId: string; payload: any });
  }

  // ── Mobile (FCM) — um job = um multicast pra todos os tokens do workspace ────

  private async deliverFcm(data: FcmJobData): Promise<void> {
    const { invalidTokens } = await this.fcm.sendToTokens(data.tokens, data.notification, data.data);
    if (invalidTokens.length > 0) {
      // tokens que o FCM reportou como mortos/expirados — remove do banco
      await this.prisma.pushDevice
        .deleteMany({ where: { token: { in: invalidTokens } } })
        .catch(() => {});
    }
  }

  // ── Web push ───────────────────────────────────────────────────────────────

  private async deliverWebPush(data: { subscriptionId: string; payload: any }): Promise<void> {
    const { subscriptionId, payload } = data;

    const sub = await this.prisma.pushSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) return; // já foi removida (dispositivo desinscreveu) — nada a fazer

    // Chaves buscadas do banco na hora, nunca trafegam pelo Redis no payload do job
    // — mesmo padrão do secret do WebhookSettings em webhook-delivery.processor.ts.
    const { publicKey, privateKey } = await this.platformSettings.getOrCreateVapidKeys();

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600, vapidDetails: { subject: VAPID_SUBJECT, publicKey, privateKey } },
      );

      await this.prisma.pushSubscription.update({
        where: { id: subscriptionId },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});
    } catch (err: any) {
      const status = err?.statusCode;

      if (status === 404 || status === 410) {
        // Assinatura morta (permissão revogada, navegador desinstalado, subscription
        // expirada) — remove já, não é uma falha a re-tentar. Garante que registro
        // morto nunca acumula no banco.
        await this.prisma.pushSubscription.delete({ where: { id: subscriptionId } }).catch(() => {});
        return;
      }

      if (status === 401 || status === 403) {
        // Problema sistêmico de configuração VAPID (não desta subscription
        // específica) — re-tentar a mesma não resolve nada, mas indica que TODO
        // envio de push está quebrado nesse ambiente agora. Loga alto, não relança.
        this.logger.error(
          `ALERTA: VAPID rejeitado (${status}) pelo serviço de push — verifique o par de chaves. subscriptionId=${subscriptionId}`,
        );
        return;
      }

      // 429 / 5xx / erro de rede: falha transitória — relança pro BullMQ re-tentar
      // com o backoff exponential padrão (attempts=3, configurado no dispatch()).
      throw new Error(`Push falhou (status=${status ?? 'sem status'}): ${err?.message}`);
    }
  }
}
