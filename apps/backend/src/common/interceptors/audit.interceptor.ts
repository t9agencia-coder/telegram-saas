import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AUDIT_KEY, AuditMetadata } from '../decorators/audit.decorator';
import { AuditLogService } from '../audit-log.service';
import { getClientIp } from '../utils/request-ip';

const SENSITIVE_KEY_PATTERN = /key|secret|token|password/i;

// Remove credenciais (apiKey/apiSecret de adquirente, senhas, tokens) do body
// antes de gravar no AuditLog — o log guarda o que foi feito, nunca segredos.
function sanitize(body: unknown): Record<string, any> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(body as Record<string, any>)) {
    clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : value;
  }
  return clean;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private reflector: Reflector,
    private auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();

    return next.handle().pipe(
      tap(() => {
        if (!req.user?.id) return;
        this.auditLogService
          .log({
            userId: req.user.id,
            action: meta.action,
            entity: meta.entity,
            entityId: (req.params as Record<string, string> | undefined)?.id,
            metadata: sanitize(req.body),
            ip: getClientIp(req),
          })
          .catch((err) => this.logger.error(`Falha ao gravar audit log (${meta.entity}/${meta.action}): ${err.message}`));
      }),
    );
  }
}
