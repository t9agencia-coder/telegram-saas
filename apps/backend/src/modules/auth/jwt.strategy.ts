import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // JWT_SECRET é validado (sem fallback) na carga de auth.module.ts
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: { sub: string; email: string; tokenVersion?: number; purpose?: string }) {
    // Tickets de 2FA (`purpose: '2fa-setup' | '2fa-verify'`, ver auth.service.ts)
    // são assinados com o mesmo JWT_SECRET mas nunca podem valer como access
    // token de verdade — só o /auth/2fa/* os aceita.
    if (payload.purpose) {
      throw new UnauthorizedException('Token inválido para esta operação');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, isActive: true, role: true, tokenVersion: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // tokenVersion divergente = sessão revogada manualmente (ver
    // POST /admin/users/:id/revoke-sessions) — invalida o JWT mesmo dentro
    // dos 7 dias de validade.
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Sessão revogada');
    }

    return user;
  }
}
