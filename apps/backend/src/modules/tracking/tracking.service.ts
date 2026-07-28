import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { generateLeadUid } from '../../common/utils/lead-uid';
import { TrackEventDto } from './dto/track-event.dto';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(private prisma: PrismaService) {}

  async track(dto: TrackEventDto) {
    let lead = await this.prisma.lead.findUnique({
      where: { leadUid: dto.leadUid },
    });

    if (!lead) {
      // Só cria lead pra um workspace que realmente existe — não impede
      // forjar workspaceId de terceiro (pixel é público/anônimo por natureza),
      // mas barra lixo/workspace inventado poluindo a base.
      const workspaceExists = await this.prisma.workspace.findUnique({
        where: { id: dto.workspaceId },
        select: { id: true },
      });
      if (!workspaceExists) {
        this.logger.warn(`Tracking: workspaceId inexistente (${dto.workspaceId}) — evento ignorado`);
        return { tracked: false };
      }

      lead = await this.prisma.lead.create({
        data: {
          workspaceId: dto.workspaceId,
          leadUid: dto.leadUid,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          ip: dto.ip,
          userAgent: dto.userAgent,
        },
      });

      await this.prisma.event.create({
        data: {
          leadId: lead.id,
          eventName: 'LEAD',
          source: 'tracking',
          metadata: { type: 'new_lead' },
        },
      });
    }

    if (dto.utmSource || dto.fbclid || dto.kwaiClickid) {
      await this.prisma.tracking.upsert({
        where: { leadId: lead.id },
        create: {
          leadId: lead.id,
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
          utmContent: dto.utmContent,
          utmTerm: dto.utmTerm,
          fbclid: dto.fbclid,
          gclid: dto.gclid,
          ttclid: dto.ttclid,
          kwaiClickid: dto.kwaiClickid,
        },
        update: {
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
          utmContent: dto.utmContent,
          utmTerm: dto.utmTerm,
          fbclid: dto.fbclid,
          gclid: dto.gclid,
          ttclid: dto.ttclid,
          kwaiClickid: dto.kwaiClickid,
        },
      });
    }

    await this.prisma.event.create({
      data: {
        leadId: lead.id,
        eventName: dto.event || 'PAGE_VIEW',
        source: dto.source || 'tracking',
        metadata: dto.metadata || {},
      },
    });

    this.logger.log(`Tracked event ${dto.event || 'PAGE_VIEW'} for lead ${dto.leadUid}`);

    return {
      leadUid: lead.leadUid,
      leadId: lead.id,
      tracked: true,
    };
  }
}
