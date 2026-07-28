import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  entity: string;
  action: string;
}

// Marca um endpoint do painel de admin pra ser registrado no AuditLog
// (ver AuditInterceptor). Só grava em caso de sucesso (status 2xx).
export const Audit = (entity: string, action: string) => SetMetadata(AUDIT_KEY, { entity, action } as AuditMetadata);
