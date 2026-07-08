import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { TelegramBotsService } from '../telegram-bots/telegram-bots.service';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';

@Processor('telegram-messages')
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(
    private telegramBotsService: TelegramBotsService,
    private prisma: PrismaService,
    @InjectQueue('telegram-messages') private msgQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    // Protege contra clock drift: rejeita jobs criados no futuro ou com mais de 10 dias
    const MAX_JOB_AGE_MS = 10 * 24 * 60 * 60 * 1000;
    const MAX_FUTURE_MS  = 11 * 24 * 60 * 60 * 1000;
    const jobAge = Date.now() - job.timestamp;
    if (jobAge < -MAX_FUTURE_MS || jobAge > MAX_JOB_AGE_MS) {
      this.logger.warn(
        `[AutomationProcessor] Job inválido descartado: name=${job.name} id=${job.id}` +
        ` idade=${Math.round(jobAge / 86400000)} dias (criado em ${new Date(job.timestamp).toISOString()})`,
      );
      return;
    }

    switch (job.name) {
      case 'send-message':          return this.handleSendMessage(job.data);
      case 'delete-message':        return this.handleDeleteMessage(job.data);
      case 'pix-reminder':          return this.handlePixReminder(job.data);
      case 'send-deliverable':      return this.handleSendDeliverable(job.data);
      case 'check-pixzypay-status': return this.handleCheckPixzypayStatus(job.data);
      case 'check-qrcodes-status':  return this.handleCheckQRCodesStatus(job.data);
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async handleSendMessage(data: { botId: string; chatId: string; message: any }) {
    try {
      const token = await this.telegramBotsService.getRawToken(data.botId);

      if (data.message.type === 'text') {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: data.chatId,
          text: data.message.text,
          parse_mode: 'HTML',
          protect_content: true,
        });
      } else if (data.message.type === 'payment') {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: data.chatId,
          text: `💰 ${data.message.productName}\n\nValor: R$ ${data.message.amount}\n\nClique abaixo para pagar com PIX:`,
          reply_markup: {
            inline_keyboard: [[
              { text: `💳 Pagar R$ ${data.message.amount}`, callback_data: `pay_${data.message.productId || 'checkout'}` }
            ]]
          },
          parse_mode: 'HTML',
          protect_content: true,
        });
      }

      this.logger.log(`Message sent to chat ${data.chatId}`);
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
    }
  }

  private async handleDeleteMessage(data: { token: string; chatId: string | number; messageId: number }) {
    try {
      await axios.post(`https://api.telegram.org/bot${data.token}/deleteMessage`, {
        chat_id:    data.chatId,
        message_id: data.messageId,
      });
    } catch (_) {}
  }

  private async handlePixReminder(data: {
    token:      string;
    chatId:     string | number;
    paymentId:  string;
    copyPaste:  string;
    amount:     number;
    label:      string;
    text:       string;
    deleteInMs: number;
  }) {
    const payment = await this.prisma.payment.findUnique({ where: { id: data.paymentId } });
    if (!payment || payment.status !== 'PENDING') return;

    const valorBr = `R$ ${data.amount.toFixed(2).replace('.', ',')}`;

    try {
      const res = await axios.post(`https://api.telegram.org/bot${data.token}/sendMessage`, {
        chat_id:         data.chatId,
        text:            data.text.replace('{valorBr}', valorBr),
        parse_mode:      'Markdown',
        protect_content: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Verificar pagamento', callback_data: `check_${data.paymentId}` }],
            [{ text: '📋 Copiar código PIX',   copy_text: { text: data.copyPaste } }],
          ],
        },
      }, { timeout: 15_000 });
      const msgId = res.data?.result?.message_id;
      if (msgId) {
        await this.msgQueue.add(
          'delete-message',
          { token: data.token, chatId: data.chatId, messageId: msgId },
          { delay: data.deleteInMs },
        );
      }
    } catch (e: any) {
      const desc = e?.response?.data?.description ?? e.message;
      this.logger.warn(`pix-reminder falhou → paymentId=${data.paymentId} chatId=${data.chatId}: ${desc}`);
    }
  }

  private async handleSendDeliverable(data: {
    token:     string;
    chatId:    string;
    paymentId: string;
    message:   string;
  }) {
    const payment = await this.prisma.payment.findUnique({ where: { id: data.paymentId } });
    if (!payment || payment.status !== 'APPROVED') return; // protege contra reembolso/cancelamento no meio do caminho

    try {
      await axios.post(`https://api.telegram.org/bot${data.token}/sendMessage`, {
        chat_id: data.chatId,
        text: data.message,
        parse_mode: 'HTML',
        protect_content: true,
      }, { timeout: 15_000 });
      this.logger.log(`Entregável enviado → paymentId=${data.paymentId}`);
    } catch (e: any) {
      const desc = e?.response?.data?.description ?? e.message;
      this.logger.warn(`Entregável falhou → paymentId=${data.paymentId}: ${desc}`);
    }
  }

  private async handleCheckPixzypayStatus(data: {
    paymentId: string;
    transactionId: string;
    attempt: number;
  }) {
    const MAX_ATTEMPTS = 15; // ~30 min total

    const payment = await this.prisma.payment.findUnique({
      where: { id: data.paymentId },
      select: { status: true },
    });
    if (!payment || payment.status !== 'PENDING') return;

    const acquirer = await this.prisma.acquirer.findUnique({ where: { slug: 'pixzypay' } });
    if (!acquirer) return;

    const apiKey = decrypt(acquirer.apiKey);
    const delay  = data.attempt === 0 ? 60_000 : 2 * 60_000;

    try {
      const r = await axios.get(
        `https://app.pixzypay.com/api/transactions/${data.transactionId}`,
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10_000 },
      );
      const d = r.data?.data ?? r.data;

      if (d.status === 'paid') {
        this.logger.log(`[PixzyPay Poll] Pagamento confirmado ${data.transactionId} (tentativa ${data.attempt + 1})`);
        await axios.post(
          'http://localhost:3001/api/webhooks/pixzypay',
          { event: 'transaction.paid', data: { id: data.transactionId, status: 'paid' } },
          { timeout: 15_000 },
        );
      } else if (d.status === 'expired' || d.status === 'refunded' || d.status === 'chargeback') {
        // Marcar como CANCELLED no banco — antes só fazia log e o pagamento ficava PENDING para sempre
        this.logger.log(`[PixzyPay Poll] Cancelando ${data.transactionId} (status PixzyPay: ${d.status})`);
        await this.prisma.payment.update({
          where: { id: data.paymentId },
          data:  { status: 'CANCELLED' },
        }).catch(() => {});
      } else if (data.attempt < MAX_ATTEMPTS) {
        await this.msgQueue.add(
          'check-pixzypay-status',
          { ...data, attempt: data.attempt + 1 },
          { delay, removeOnComplete: { count: 100, age: 3600 } },
        );
      } else {
        // Esgotou tentativas sem confirmação — considerado expirado
        this.logger.log(`[PixzyPay Poll] Tentativas esgotadas para ${data.transactionId} → CANCELLED`);
        await this.prisma.payment.update({
          where: { id: data.paymentId },
          data:  { status: 'CANCELLED' },
        }).catch(() => {});
      }
    } catch (e: any) {
      this.logger.warn(`[PixzyPay Poll] Erro ${data.transactionId}: ${e.message}`);
      if (data.attempt < MAX_ATTEMPTS) {
        await this.msgQueue.add(
          'check-pixzypay-status',
          { ...data, attempt: data.attempt + 1 },
          { delay, removeOnComplete: { count: 100, age: 3600 } },
        );
      } else {
        // Erro persistente após MAX_ATTEMPTS — cancela para não ficar preso como PENDING
        await this.prisma.payment.update({
          where: { id: data.paymentId },
          data:  { status: 'CANCELLED' },
        }).catch(() => {});
      }
    }
  }

  private async handleCheckQRCodesStatus(data: {
    paymentId: string;
    transactionId: string;
    attempt: number;
  }) {
    const MAX_ATTEMPTS = 20; // ~40 min (cob expira em 1h, para por segurança)

    const payment = await this.prisma.payment.findUnique({
      where: { id: data.paymentId },
      select: { status: true },
    });
    if (!payment || payment.status !== 'PENDING') return;

    const delay = data.attempt === 0 ? 60_000 : 2 * 60_000;

    try {
      const acquirerRecord = await this.prisma.acquirer.findUnique({
        where: { slug: 'qrcodes' },
      });
      if (!acquirerRecord) return;

      const https = require('https');
      const fs    = require('fs');
      const path  = require('path');

      const certsDir = path.resolve(process.cwd(), 'certs', 'basspago');
      let agent: any;
      try {
        agent = new https.Agent({
          cert: fs.readFileSync(path.join(certsDir, 'BASSPAGO_236.crt')),
          key:  fs.readFileSync(path.join(certsDir, 'BASSPAGO_236.key')),
          rejectUnauthorized: false,
        });
      } catch {
        agent = new https.Agent({ rejectUnauthorized: false });
      }

      const clientId     = decrypt(acquirerRecord.apiKey);
      const clientSecret = acquirerRecord.apiSecret ? decrypt(acquirerRecord.apiSecret) : '';

      // Obtém token
      const tokenBody = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
      const tokenResp = await axios.post(
        'https://api.pix.basspago.com.br/oauth/token',
        tokenBody,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, httpsAgent: agent, timeout: 15_000 },
      );
      const token = tokenResp.data.access_token ?? tokenResp.data.accessToken;

      // Consulta status da cobrança
      const cobResp = await axios.get(
        `https://api.pix.basspago.com.br/cob/${data.transactionId}`,
        { headers: { Authorization: `Bearer ${token}` }, httpsAgent: agent, timeout: 15_000 },
      );
      const cobStatus = cobResp.data?.status;

      if (cobStatus === 'CONCLUIDA') {
        this.logger.log(`[QRCodes Poll] Pagamento confirmado ${data.transactionId} (tentativa ${data.attempt + 1})`);
        // Dispara o webhook internamente no formato BCB
        await axios.post(
          'http://localhost:3001/api/webhooks/qrcodes/pix',
          { pix: [{ txid: data.transactionId }] },
          { timeout: 15_000 },
        ).catch(() => {});
      } else if (cobStatus === 'REMOVIDA_PELO_USUARIO_RECEBEDOR' || cobStatus === 'REMOVIDA_PELO_PSP') {
        await this.prisma.payment.update({
          where: { id: data.paymentId },
          data:  { status: 'CANCELLED' },
        }).catch(() => {});
      } else if (data.attempt < MAX_ATTEMPTS) {
        await this.msgQueue.add(
          'check-qrcodes-status',
          { ...data, attempt: data.attempt + 1 },
          { delay, removeOnComplete: { count: 100, age: 3600 } },
        );
      } else {
        await this.prisma.payment.update({
          where: { id: data.paymentId },
          data:  { status: 'CANCELLED' },
        }).catch(() => {});
      }
    } catch (e: any) {
      this.logger.warn(`[QRCodes Poll] Erro ${data.transactionId}: ${e.message}`);
      if (data.attempt < MAX_ATTEMPTS) {
        await this.msgQueue.add(
          'check-qrcodes-status',
          { ...data, attempt: data.attempt + 1 },
          { delay, removeOnComplete: { count: 100, age: 3600 } },
        );
      } else {
        await this.prisma.payment.update({
          where: { id: data.paymentId },
          data:  { status: 'CANCELLED' },
        }).catch(() => {});
      }
    }
  }
}
