import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { RecaptchaService } from './recaptcha.service';
import { MailService } from './mail.service';
import { AuditLogService } from '../../common/audit-log.service';
import { encrypt, decrypt } from '../../common/utils/encryption';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_MAX_ATTEMPTS = 5;
const VERIFICATION_RESEND_COOLDOWN_S = 60;
const TWO_FACTOR_TICKET_TTL = '5m';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
    private recaptchaService: RecaptchaService,
    private mailService: MailService,
    private auditLogService: AuditLogService,
  ) {}

  async register(dto: RegisterDto, registrationIp?: string) {
    const captchaOk = await this.recaptchaService.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new BadRequestException('Captcha inválido. Recarregue a página e tente novamente.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    // Verificação por e-mail temporariamente desligada até RESEND_API_KEY/
    // RESEND_FROM_EMAIL serem configuradas em produção (ver mail.service.ts).
    const emailVerificationEnabled = this.mailService.isConfigured();
    const code = emailVerificationEnabled ? this.generateVerificationCode() : null;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        whatsapp: dto.whatsapp,
        registrationIp,
        emailVerified: !emailVerificationEnabled,
        emailVerificationCode: code,
        emailVerificationExpiresAt: emailVerificationEnabled
          ? new Date(Date.now() + VERIFICATION_CODE_TTL_MS)
          : null,
        workspaces: {
          create: {
            name: `${dto.name}'s Workspace`,
          },
        },
      },
    });

    if (!emailVerificationEnabled) {
      const workspaces = await this.prisma.workspace.findMany({
        where: { ownerId: user.id, isActive: true },
      });
      const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          workspaces,
        },
        ...tokens,
        requiresVerification: false,
      };
    }

    await this.mailService.sendVerificationCode(user.email, user.name, code!);

    return { email: user.email, requiresVerification: true };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Código inválido ou expirado.');

    // Idempotente: se o usuário já verificou (ex.: reenviou o form), só loga normalmente.
    if (!user.emailVerified) {
      if (!user.emailVerificationCode || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
        throw new UnauthorizedException('Código expirado. Solicite um novo.');
      }
      if (user.emailVerificationAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        throw new UnauthorizedException('Muitas tentativas incorretas. Solicite um novo código.');
      }
      if (user.emailVerificationCode !== dto.code) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { emailVerificationAttempts: { increment: 1 } },
        });
        throw new UnauthorizedException('Código incorreto.');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
          emailVerificationAttempts: 0,
        },
      });
    }

    const workspaces = await this.prisma.workspace.findMany({
      where: { ownerId: user.id, isActive: true },
    });
    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        workspaces,
      },
      ...tokens,
    };
  }

  async resendVerificationCode(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Resposta genérica sempre — não revela se o e-mail existe na base.
    if (!user || user.emailVerified) return { sent: true };

    const cooldownKey = `email-verify-cooldown:${user.id}`;
    const onCooldown = await this.redis.get(cooldownKey);
    if (onCooldown) return { sent: true };

    const code = this.generateVerificationCode();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: code,
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        emailVerificationAttempts: 0,
      },
    });
    await this.mailService.sendVerificationCode(user.email, user.name, code);
    await this.redis.set(cooldownKey, '1', 'EX', VERIFICATION_RESEND_COOLDOWN_S);

    return { sent: true };
  }

  private generateVerificationCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async login(dto: LoginDto, ip?: string) {
    const captchaOk = await this.recaptchaService.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new BadRequestException('Captcha inválido. Recarregue a página e tente novamente.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Bloqueio por conta — independe do rate-limit por IP (5/min), que sozinho
    // não impede um atacante distribuindo as tentativas por vários IPs contra
    // a mesma conta (ver tentativa de invasão de 16/07/2026).
    await this.assertNotLocked(user, ip);

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      await this.registerFailedAttempt(user, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    // Contas ADMIN exigem 2FA (TOTP) — nunca pulamos essa etapa, mesmo que o
    // resto da plataforma não use. Ver incidente de segurança de 16/07/2026.
    if (user.role === 'ADMIN') {
      if (!user.twoFactorEnabled) {
        const secret = generateSecret();
        const otpauth = generateURI({ issuer: 'FireBot Admin', label: user.email, secret });
        const qrCode = await QRCode.toDataURL(otpauth);
        const setupToken = this.jwtService.sign(
          { sub: user.id, secret, purpose: '2fa-setup' },
          { expiresIn: TWO_FACTOR_TICKET_TTL },
        );
        return { twoFactorSetupRequired: true, qrCode, secret, setupToken };
      }

      const verifyToken = this.jwtService.sign(
        { sub: user.id, purpose: '2fa-verify' },
        { expiresIn: TWO_FACTOR_TICKET_TTL },
      );
      return { twoFactorRequired: true, verifyToken };
    }

    const workspaces = await this.prisma.workspace.findMany({
      where: { ownerId: user.id, isActive: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);
    await this.logLoginAttempt(user.id, user.role, 'LOGIN_SUCCESS', ip);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        workspaces,
      },
      ...tokens,
    };
  }

  async confirmTwoFactorSetup(setupToken: string, code: string, ip?: string) {
    const payload = this.verifyTicket(setupToken, '2fa-setup');
    if (!payload.secret) {
      throw new UnauthorizedException('Token inválido.');
    }

    const existing = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!existing || !existing.isActive) {
      throw new UnauthorizedException('Sessão de login inválida. Faça login novamente.');
    }

    await this.assertNotLocked(existing, ip);

    const result = await verify({ secret: payload.secret, token: code, epochTolerance: 30 });
    if (!result.valid) {
      await this.registerFailedAttempt(existing, ip);
      throw new UnauthorizedException('Código inválido.');
    }

    const user = await this.prisma.user.update({
      where: { id: payload.sub },
      data: {
        twoFactorSecret: encrypt(payload.secret),
        twoFactorEnabled: true,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastTotpTimeStep: 'timeStep' in result ? result.timeStep : null,
      },
    });

    await this.auditLogService.log({
      userId: user.id,
      action: '2FA_ENABLED',
      entity: 'User',
      entityId: user.id,
      ip,
    });
    await this.logLoginAttempt(user.id, user.role, 'LOGIN_SUCCESS', ip);

    return this.buildLoginResponse(user);
  }

  async verifyTwoFactor(verifyToken: string, code: string, ip?: string) {
    const payload = this.verifyTicket(verifyToken, '2fa-verify');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Sessão de login inválida. Faça login novamente.');
    }

    await this.assertNotLocked(user, ip);

    const secret = decrypt(user.twoFactorSecret);
    // afterTimeStep rejeita a reutilização do mesmo código TOTP (ou de um
    // período anterior) — sem isso, um código capturado (rede comprometida,
    // olhando por cima do ombro etc.) continuava válido até expirar sozinho.
    const result = await verify({
      secret,
      token: code,
      epochTolerance: 30,
      afterTimeStep: user.lastTotpTimeStep ?? undefined,
    });
    if (!result.valid) {
      await this.registerFailedAttempt(user, ip);
      throw new UnauthorizedException('Código inválido.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastTotpTimeStep: 'timeStep' in result ? result.timeStep : null,
      },
    });
    await this.logLoginAttempt(user.id, user.role, 'LOGIN_SUCCESS', ip);
    return this.buildLoginResponse(user);
  }

  // Compartilhado entre login (senha) e as duas etapas de 2FA — mesma conta,
  // mesmo contador. Falhar o 2FA repetidas vezes também bloqueia a conta.
  private async assertNotLocked(user: { id: string; role: string; lockedUntil: Date | null }, ip?: string) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logLoginAttempt(user.id, user.role, 'LOGIN_FAILED', ip);
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(
        `Conta temporariamente bloqueada por muitas tentativas. Tente novamente em ${minutesLeft} min.`,
      );
    }
  }

  private async registerFailedAttempt(
    user: { id: string; role: string; failedLoginAttempts: number },
    ip?: string,
  ) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_MS) : null,
      },
    });
    await this.logLoginAttempt(user.id, user.role, 'LOGIN_FAILED', ip);
  }

  // Ticket de curta duração (5 min) emitido no /auth/login pra confirmar o
  // segundo fator sem reexpor a senha — mesmo JWT_SECRET, payload com `purpose`
  // pra não ser aceito como access token normal em nenhuma rota protegida.
  private verifyTicket(token: string, purpose: '2fa-setup' | '2fa-verify'): { sub: string; secret?: string } {
    let payload: { sub: string; secret?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Sessão de login expirada. Faça login novamente.');
    }
    if (payload.purpose !== purpose) {
      throw new UnauthorizedException('Token inválido.');
    }
    return payload as { sub: string; secret?: string };
  }

  private async buildLoginResponse(user: {
    id: string; name: string; email: string; avatar: string | null; role: string; tokenVersion: number;
  }) {
    const workspaces = await this.prisma.workspace.findMany({
      where: { ownerId: user.id, isActive: true },
    });
    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        workspaces,
      },
      ...tokens,
    };
  }

  // Antes só logava tentativas de conta ADMIN — generalizado pra todo usuário
  // depois de descobrirmos que um ataque de força bruta contra conta comum
  // não deixava nenhum rastro de auditoria (só o rate-limit por IP cobria).
  private async logLoginAttempt(
    userId: string,
    role: string,
    action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED',
    ip?: string,
  ) {
    await this.auditLogService.log({
      userId,
      action,
      entity: role === 'ADMIN' ? 'AdminSession' : 'UserSession',
      ip,
    });
  }

  async refreshToken(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.generateTokens(stored.user.id, stored.user.email, stored.user.tokenVersion);
  }

  async exchangeImpersonationToken(token: string) {
    const userId = await this.redis.get(`impersonate:${token}`);
    if (!userId) throw new UnauthorizedException('Token inválido ou expirado');

    // Token de uso único — invalida imediatamente
    await this.redis.del(`impersonate:${token}`);

    const user = await this.prisma.user.findUnique({
      where:   { id: userId },
      include: { workspaces: { where: { isActive: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Conta inativa');

    this.logger.warn(`[Impersonate] Acesso como user=${userId} (${user.email})`);

    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);
    return {
      user: {
        id:         user.id,
        name:       user.name,
        email:      user.email,
        avatar:     user.avatar,
        role:       user.role,
        workspaces: user.workspaces,
      },
      ...tokens,
    };
  }

  private async generateTokens(userId: string, email: string, tokenVersion: number) {
    const payload = { sub: userId, email, tokenVersion };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = uuidv4();
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 3600,
    };
  }
}
