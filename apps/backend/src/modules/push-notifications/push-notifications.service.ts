import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UpdatePushSettingsDto } from './dto/update-push-settings.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { WebhookEvent } from '../webhook-dispatch/webhook-events';

export const PUSH_NOTIFICATION_QUEUE = 'push-notifications';

const DEFAULT_ENABLED_EVENTS: WebhookEvent[] = ['sale_pending', 'sale_approved'];

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private platformSettings: PlatformSettingsService,
    @InjectQueue(PUSH_NOTIFICATION_QUEUE) private queue: Queue,
  ) {}

  // ── VAPID pública (frontend usa pra criar a subscription no navegador) ───────

  async getVapidPublicKey(): Promise<string> {
    const { publicKey } = await this.platformSettings.getOrCreateVapidKeys();
    return publicKey;
  }

  // ── Subscriptions (um dispositivo/navegador por linha) ───────────────────────

  // endpoint já identifica navegador+dispositivo de forma única — serve de chave
  // natural pra upsert (resubscribe do mesmo dispositivo atualiza em vez de duplicar).
  async subscribe(workspaceId: string, dto: SubscribePushDto) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        workspaceId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
      },
      update: {
        workspaceId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
        lastSeenAt: new Date(),
      },
    });
    return { ok: true };
  }

  async unsubscribe(workspaceId: string, endpoint: string) {
    if (!endpoint) throw new BadRequestException('endpoint é obrigatório');
    await this.prisma.pushSubscription.deleteMany({ where: { workspaceId, endpoint } });
    return { ok: true };
  }

  // ── Dispositivos mobile (FCM) — Fase 6 ──────────────────────────────────────

  // token FCM = chave natural; re-registro do mesmo device atualiza a linha.
  async registerDevice(workspaceId: string, dto: RegisterDeviceDto) {
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { workspaceId, token: dto.token, platform: dto.platform },
      update: { workspaceId, platform: dto.platform, lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  async unregisterDevice(workspaceId: string, token: string) {
    if (!token) throw new BadRequestException('token é obrigatório');
    await this.prisma.pushDevice.deleteMany({ where: { workspaceId, token } });
    return { ok: true };
  }

  // ── Preferências (singleton por workspace, igual WebhookSettings) ────────────

  async getSettings(workspaceId: string) {
    const [settings, webCount, mobileCount] = await Promise.all([
      this.prisma.pushNotificationSettings.findUnique({ where: { workspaceId } }),
      this.prisma.pushSubscription.count({ where: { workspaceId } }),
      this.prisma.pushDevice.count({ where: { workspaceId } }),
    ]);
    return {
      enabled: settings?.enabled ?? true,
      enabledEvents: settings?.enabledEvents ?? DEFAULT_ENABLED_EVENTS,
      deviceCount: webCount + mobileCount,
    };
  }

  async updateSettings(workspaceId: string, dto: UpdatePushSettingsDto) {
    await this.prisma.pushNotificationSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        enabled: dto.enabled ?? true,
        enabledEvents: dto.enabledEvents ?? DEFAULT_ENABLED_EVENTS,
      },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.enabledEvents !== undefined ? { enabledEvents: dto.enabledEvents } : {}),
      },
    });
    return this.getSettings(workspaceId);
  }

  // ── Dispatch (API pública chamada pelo resto da plataforma) ──────────────────

  // Mesmo contrato de WebhookDispatchService.dispatch: fire-and-forget do lado de
  // quem chama, nunca lança pra fora, nunca bloqueia o processamento da venda.
  // Diferença chave: aqui é fanout — um workspace pode ter N dispositivos
  // inscritos, então um evento vira N jobs (um por dispositivo), não 1.
  async dispatch(event: WebhookEvent, paymentId: string): Promise<void> {
    try {
      const payment = await this.loadPaymentForPayload(paymentId);
      if (!payment) return;
      const workspaceId = payment.lead.workspaceId;

      // Gate de preferências ANTES de tocar em qualquer subscription/fila.
      const settings = await this.prisma.pushNotificationSettings.findUnique({ where: { workspaceId } });
      const enabled = settings?.enabled ?? true; // sem linha salva = habilitado por padrão
      const enabledEvents = settings?.enabledEvents ?? DEFAULT_ENABLED_EVENTS;
      if (!enabled || !enabledEvents.includes(event)) return;

      const [subscriptions, devices] = await Promise.all([
        this.prisma.pushSubscription.findMany({ where: { workspaceId } }),
        this.prisma.pushDevice.findMany({ where: { workspaceId } }),
      ]);
      if (subscriptions.length === 0 && devices.length === 0) return; // nada a fazer

      const eventId = uuidv4();
      const payload = this.buildPayload(event, payment);

      const jobOpts = {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 },
        removeOnComplete: { count: 500, age: 24 * 3600 },
        removeOnFail: { count: 200, age: 3 * 24 * 3600 },
      };

      // Web push — 1 job por dispositivo (fanout). jobId composto
      // (eventId-subscriptionId, nunca com ":" — o BullMQ rejeita Custom Id com
      // dois-pontos): o mesmo evento nunca duplica pro mesmo dispositivo, mas
      // dispositivos diferentes são independentes — um morto não trava os outros.
      await Promise.all(subscriptions.map((sub) =>
        this.queue.add(
          'deliver',
          { subscriptionId: sub.id, payload },
          { ...jobOpts, jobId: `${eventId}-${sub.id}` },
        ),
      ));

      // Mobile (FCM) — 1 job só, multicast pra todos os tokens do workspace.
      if (devices.length > 0) {
        await this.queue.add(
          'deliver-fcm',
          {
            tokens: devices.map((d) => d.token),
            notification: { title: payload.title, body: payload.body },
            data: { type: event, paymentId: payment.id },
          },
          { ...jobOpts, jobId: `${eventId}-fcm` },
        );
      }
    } catch (err: any) {
      this.logger.error(`dispatch(${event}, ${paymentId}) falhou ao enfileirar push: ${err?.message}`);
    }
  }

  // ── Teste manual (envia pra todos os dispositivos do workspace) ──────────────

  async testPush(workspaceId: string) {
    const [subscriptions, devices] = await Promise.all([
      this.prisma.pushSubscription.findMany({ where: { workspaceId } }),
      this.prisma.pushDevice.findMany({ where: { workspaceId } }),
    ]);
    if (subscriptions.length === 0 && devices.length === 0) {
      throw new BadRequestException(
        'Nenhum dispositivo inscrito — ative as notificações neste navegador ou registre o app mobile primeiro',
      );
    }

    const payload = {
      title: '🔔 Notificação de teste',
      body: 'Se você recebeu isso, suas notificações estão funcionando!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'test-notification',
      data: { url: '/dashboard/configuracoes' },
    };

    // Web push — 1 job por navegador inscrito.
    await Promise.all(subscriptions.map((sub) =>
      this.queue.add(
        'deliver',
        { subscriptionId: sub.id, payload },
        { jobId: `test-${uuidv4()}-${sub.id}`, attempts: 1, removeOnComplete: true, removeOnFail: true },
      ),
    ));

    // Mobile (FCM) — 1 job multicast pra todos os tokens do workspace. Mesmo
    // contrato do dispatch(): notification + data.type. `type: 'test'` faz o app
    // abrir a lista de vendas no toque, sem paymentId.
    if (devices.length > 0) {
      await this.queue.add(
        'deliver-fcm',
        {
          tokens: devices.map((d) => d.token),
          notification: { title: '🔔 Notificação de teste', body: 'Push do FireBot funcionando!' },
          data: { type: 'test' },
        },
        { jobId: `test-fcm-${uuidv4()}`, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
    }

    return { ok: true, webPush: subscriptions.length, mobile: devices.length };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadPaymentForPayload(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        lead: { select: { workspaceId: true } },
      },
    });
  }

  private buildPayload(event: WebhookEvent, payment: any) {
    const isApproved = event === 'sale_approved';
    // pt-BR formata como "R$ 197,00" (vírgula decimal) — igual ao resto da
    // plataforma, em vez do "R$ 197.00" (ponto) que Number().toFixed() produzia.
    const amountFormatted = Number(payment.amount)
      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return {
      title: isApproved ? 'Venda Aprovada' : 'Venda Pendente',
      body: `Valor: ${amountFormatted}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Tag inclui o evento (não só o id da venda) de propósito: pendente e
      // aprovada devem aparecer como duas notificações distintas na bandeja do
      // sistema — só colapsa reenvios repetidos do MESMO evento pra mesma venda.
      tag: `${event}-${payment.id}`,
      data: { url: '/dashboard/vendas', paymentId: payment.id, event },
    };
  }
}
