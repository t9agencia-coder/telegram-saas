import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  // Enquanto RESEND_API_KEY/RESEND_FROM_EMAIL não estiverem configuradas, o
  // registro pula a verificação por e-mail (ver auth.service.ts#register) —
  // reativa sozinho assim que as duas variáveis forem preenchidas.
  isConfigured(): boolean {
    return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  }

  async sendVerificationCode(to: string, name: string, code: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      throw new InternalServerErrorException(
        'Serviço de e-mail não configurado (RESEND_API_KEY/RESEND_FROM_EMAIL ausentes).',
      );
    }

    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to,
          subject: `${code} é o seu código de verificação`,
          html: buildVerificationEmailHtml(name, code),
        },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10_000 },
      );
    } catch (e: any) {
      this.logger.error(
        `Falha ao enviar e-mail de verificação para ${to}: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`,
      );
      throw new InternalServerErrorException('Não foi possível enviar o e-mail de verificação. Tente novamente em instantes.');
    }
  }
}

function buildVerificationEmailHtml(name: string, code: string): string {
  return `
  <div style="background:#0D0D0D;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#1A1A1A;border-radius:8px;padding:32px;border:1px solid rgba(255,255,255,0.08);">
      <p style="color:#B3B3B3;font-size:14px;margin:0 0 4px;">Olá, ${escapeHtml(name)}</p>
      <h1 style="color:#FFFFFF;font-size:20px;margin:0 0 24px;">Confirme seu e-mail</h1>
      <p style="color:#B3B3B3;font-size:14px;line-height:1.5;margin:0 0 24px;">
        Use o código abaixo para confirmar sua conta. Ele expira em 15 minutos.
      </p>
      <div style="background:#0D0D0D;border:1px solid rgba(229,9,20,0.4);border-radius:6px;padding:16px;text-align:center;margin:0 0 24px;">
        <span style="color:#E50914;font-size:32px;font-weight:700;letter-spacing:8px;">${code}</span>
      </div>
      <p style="color:#666666;font-size:12px;margin:0;">Se você não solicitou este código, pode ignorar este e-mail.</p>
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
