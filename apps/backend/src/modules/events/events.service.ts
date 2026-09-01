import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { TelegramBlacklistService } from '../telegram-blacklist/telegram-blacklist.service';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private telegramBlacklist: TelegramBlacklistService,
  ) {}

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
    const events = await this.prisma.event.findMany({
      where: {
        ...(eventName ? { eventName } : {}),
        lead: { workspaceId },
      },
      include: {
        lead: {
          select: { id: true, name: true, leadUid: true, telegramId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Anexa isBlocked em cada lead — sem isso, o frontend só sabe quem está
    // bloqueado enquanto a aba fica aberta (perde o estado ao recarregar a
    // página, já que o bloqueio em si não altera nada visível no Lead/Event).
    const telegramIds = events.map(e => (e.lead as any)?.telegramId).filter(Boolean);
    const blocked = await this.telegramBlacklist.isBlockedBulk(telegramIds);

    return events.map(e => ({
      ...e,
      lead: e.lead
        ? { ...e.lead, isBlocked: blocked.has((e.lead as any).telegramId ?? '') }
        : e.lead,
    }));
  }

  // Bloqueio global disparado por um usuário comum (dono do workspace), a
  // partir da própria aba de Atividades — não é uma ação de admin. Escopo de
  // segurança: só pode bloquear o telegramId do lead de um evento que
  // pertence ao SEU workspace (o :eventId sozinho não bastaria — sem checar
  // event.lead.workspaceId, um dono de workspace poderia adivinhar o id de
  // um evento de outro workspace e bloquear um usuário que nunca falou com
  // o bot dele). O bloqueio em si é global (mesma tabela do admin), mas só
  // o admin pode desfazer — não existe endpoint de unblock aqui.
  async blockLeadTelegram(workspaceId: string, eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { lead: { select: { workspaceId: true, telegramId: true } } },
    });
    if (!event?.lead) throw new NotFoundException('Evento não encontrado');
    if (event.lead.workspaceId !== workspaceId) {
      throw new ForbiddenException('Este evento não pertence a este workspace');
    }
    if (!event.lead.telegramId) {
      throw new BadRequestException('Este lead não tem um Telegram ID associado');
    }

    const { entry, alreadyBlocked, linkedIps, skippedIps } = await this.telegramBlacklist.block(
      event.lead.telegramId,
      undefined,
      userId,
    );
    return { ...entry, alreadyBlocked, linkedIps, skippedIps };
  }
}
