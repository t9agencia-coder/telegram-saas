import { Injectable, Logger } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Fase 6 — envio de push pro app mobile via Firebase Cloud Messaging.
 *
 * Credencial: env `FIREBASE_SERVICE_ACCOUNT` com o JSON da service account
 * (gerado no Firebase Console → Configurações → Contas de serviço). Sem ela,
 * `isConfigured()` é false e `sendToTokens()` vira no-op — o resto da plataforma
 * (web push, webhooks, saldo) não é afetado.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;
  private initTried = false;

  isConfigured(): boolean {
    return this.getApp() !== null;
  }

  private getApp(): App | null {
    if (this.initTried) return this.app;
    this.initTried = true;

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT ausente — push mobile (FCM) desligado.');
      return null;
    }

    try {
      const existing = getApps().find((a) => a.name === 'fcm');
      if (existing) {
        this.app = existing;
        return this.app;
      }
      const serviceAccount = JSON.parse(raw) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      this.app = initializeApp(
        {
          credential: cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            // o JSON guarda o \n escapado — desfaz pra PEM válido
            privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
          }),
        },
        'fcm',
      );
      this.logger.log(`FCM inicializado (project=${serviceAccount.project_id}).`);
      return this.app;
    } catch (err) {
      this.logger.error(
        `Falha ao inicializar o Firebase Admin — FCM desligado: ${(err as Error).message}`,
      );
      this.app = null;
      return null;
    }
  }

  /**
   * Envia uma notificação (título + corpo + data) pra uma lista de tokens.
   * Retorna os tokens que o FCM reportou como inválidos/expirados, pra o
   * chamador removê-los do banco. Nunca lança.
   */
  async sendToTokens(
    tokens: string[],
    notification: { title: string; body: string },
    data: Record<string, string> = {},
  ): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
    const app = this.getApp();
    if (!app || tokens.length === 0) {
      return { sent: 0, failed: 0, invalidTokens: [] };
    }

    try {
      const res = await getMessaging(app).sendEachForMulticast({
        tokens,
        notification,
        data,
        apns: {
          headers: { 'apns-priority': '10' },
          // Som customizado do app — arquivo embutido no bundle iOS via plugin
          // expo-notifications (firebot-mobile/assets/sounds/efeito-sonoro.caf).
          // Tem que ser exatamente esse nome de arquivo; se o app não tiver o
          // asset (build antigo), o iOS cai pro som padrão automaticamente.
          payload: { aps: { sound: 'efeito-sonoro.caf', badge: 1 } },
        },
        android: { priority: 'high' },
      });

      const invalidTokens: string[] = [];
      res.responses.forEach((r, i) => {
        if (r.success) return;
        const code = r.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokens[i]);
        }
      });

      return { sent: res.successCount, failed: res.failureCount, invalidTokens };
    } catch (err) {
      this.logger.error(`sendToTokens falhou: ${(err as Error).message}`);
      return { sent: 0, failed: tokens.length, invalidTokens: [] };
    }
  }
}
