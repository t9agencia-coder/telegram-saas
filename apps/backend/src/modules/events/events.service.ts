import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    leadId: string;
    eventName: string;
    source?: string;
    metadata?: any;
  }) {
    return this.prisma.event.create({
      data: {
        leadId: data.leadId,
        eventName: data.eventName,
        source: data.source,
        metadata: data.metadata || {},
      },
    });
  }

  async findByLead(leadId: string) {
    return this.prisma.event.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByWorkspace(workspaceId: string, eventName?: string, take = 50) {
    return this.prisma.event.findMany({
      where: {
        ...(eventName ? { eventName } : {}),
        lead: { workspaceId },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
