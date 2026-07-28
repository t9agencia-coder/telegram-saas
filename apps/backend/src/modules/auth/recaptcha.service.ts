import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);

  // Sem RECAPTCHA_SECRET_KEY configurada, a verificação é pulada (fail-open) —
  // evita derrubar o cadastro em produção antes das credenciais serem cadastradas.
  // Uma vez configurada, token ausente/inválido sempre reprova.
  async verify(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
      this.logger.warn('RECAPTCHA_SECRET_KEY ausente — verificação de captcha pulada nesta requisição.');
      return true;
    }
    if (!token) return false;

    try {
      const { data } = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        null,
        { params: { secret, response: token, remoteip: remoteIp }, timeout: 8000 },
      );
      return !!data?.success;
    } catch (e: any) {
      this.logger.error(`Falha ao verificar reCAPTCHA: ${e.message}`);
      return false;
    }
  }
}
