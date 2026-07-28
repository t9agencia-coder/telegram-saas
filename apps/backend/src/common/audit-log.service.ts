import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface AuditLogEntry {
  userId: string;
  workspaceId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, any>;
  ip?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        workspaceId: entry.workspaceId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.ip,
      },
    });
  }
}
