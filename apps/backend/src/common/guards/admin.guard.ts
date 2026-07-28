import { Injectable, CanActivate, ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

// Painel de admin reabilitado em 16/07/2026 após o incidente de segurança
// (ver AuditLog, 2FA obrigatório em ADMIN e revogação de sessão).
const ADMIN_PANEL_ENABLED = true;

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!ADMIN_PANEL_ENABLED) {
      throw new ServiceUnavailableException('Painel de admin temporariamente desativado');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
