import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MediaWarmupService } from '../automation/media-warmup.service';

/** Teto por fluxo, pedido pelo dono do produto. */
const MAX_RESERVAS = 10;

const p = (prisma: PrismaService) => prisma as any;

/**
 * Contenção: a fila ordenada de bots de um fluxo.
 *
 * O que esta classe NÃO faz, de propósito:
 *
 * - Não decide quem serve. Quem serve é o `Flow.botId`, como sempre foi. A
 *   troca acontece no BotHealthService quando um bot cai.
 * - Não mexe em `Flow.botId` ao adicionar ou remover reserva. Adicionar um bot
 *   à fila não pode, sozinho, trocar o bot de um fluxo que está rodando.
 *
 * A posição 1 é o bot que está servindo agora. A fila é do usuário (arrastar),
 * não do sistema — banimento no Telegram é definitivo, então ela só anda para
 * frente e nunca volta sozinha para um bot anterior.
 */
@Injectable()
export class ContencaoService {
  private readonly logger = new Logger(ContencaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaWarmup: MediaWarmupService,
  ) {}

  /**
   * A sonda de saúde está viva?
   *
   * Existe por causa de um incidente: a sonda parou de rodar e ficou dois dias e
   * meio sem checar bot nenhum, sem um erro em log. A contenção inteira depende
   * dela — se ela para, nenhuma queda é detectada e nenhum reserva assume, e
   * ninguém fica sabendo. `lastCheckedAt` é a prova de vida, e agora a tela
   * mostra quando ela envelhece.
   */
  async saudeDaSonda() {
    const maisRecente = await this.prisma.telegramBot.findFirst({
      where: { lastCheckedAt: { not: null } },
      orderBy: { lastCheckedAt: 'desc' },
      select: { lastCheckedAt: true },
    });

    const ultima = (maisRecente as any)?.lastCheckedAt ?? null;
    const minutos = ultima
      ? Math.floor((Date.now() - new Date(ultima).getTime()) / 60000)
      : null;

    // A sonda roda de 30 em 30 segundos. 10 minutos de folga cobre restart de
    // container e rodada demorada sem alarme falso.
    return {
      ultimaChecagem: ultima,
      minutosDesdeUltimaChecagem: minutos,
      sondaViva: minutos !== null && minutos <= 10,
    };
  }

  /** Tudo que a aba precisa: fluxos do workspace, fila e saúde de cada bot. */
  async listar(workspaceId: string) {
    const fluxos = await this.prisma.flow.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, isActive: true, botId: true,
        bot: { select: { id: true, username: true, downSince: true, downReason: true, status: true, isActive: true, warmupChatId: true } },
      },
    });

    const slots = await p(this.prisma).flowBotSlot.findMany({
      where: { flowId: { in: fluxos.map((f) => f.id) } },
      orderBy: { ordem: 'asc' },
      select: {
        id: true, flowId: true, botId: true, ordem: true,
        bot: {
          select: {
            id: true, username: true, downSince: true, downReason: true,
            warmupChatId: true, precacheEnabled: true, isActive: true, status: true,
          },
        },
      },
    });

    return fluxos.map((f) => {
      const daFila = slots.filter((s: any) => s.flowId === f.id);

      const linha = (b: any, ordem: number, slotId: string | null) => ({
        slotId,
        botId:      b?.id ?? null,
        username:   b?.username ?? null,
        ordem,
        servindo:   b?.id === f.botId,
        caido:      !!b?.downSince,
        motivo:     b?.downReason ?? null,
        caidoDesde: b?.downSince ?? null,
        bloqueado:  b?.status === 'BLOCKED',
        desativado: b?.isActive === false,
        // Sem chat de aquecimento o reserva não tem como cachear mídia, e
        // entraria frio na hora da troca. A tela usa isto pra cobrar o QR.
        prontoParaAquecer: !!b?.warmupChatId,
        // `slotId` nulo = não está na fila, é só o bot do fluxo aparecendo pra
        // você saber quem atende hoje. Não dá pra arrastar nem remover.
        naFila: slotId !== null,
      });

      const bots = daFila.map((s: any) => linha(s.bot, s.ordem, s.id));

      // O bot do fluxo é quem atende. Se ele ainda não está na fila, aparece
      // mesmo assim: sem isso a tela mostrava uma fila vazia e escondia
      // justamente o bot que está trabalhando.
      const foraDaFila = f.bot && !daFila.some((s: any) => s.botId === f.botId);
      if (foraDaFila) bots.unshift(linha(f.bot, 0, null));

      return {
        flowId:   f.id,
        nome:     f.name,
        ativo:    f.isActive,
        servindo: f.botId,
        botDoFluxo: f.bot
          ? { botId: f.bot.id, username: f.bot.username, caido: !!(f.bot as any).downSince }
          : null,
        temFila: daFila.length > 0,
        bots,
      };
    });
  }

  /**
   * TODOS os bots do workspace, com o motivo de cada um poder ou não entrar.
   *
   * Antes esta lista escondia quem estava indisponível. Sumir com o bot é pior
   * que mostrá-lo bloqueado: quem procura "aquele bot que eu criei" fica sem
   * saber se ele não existe, se está banido ou se já está em outro fluxo.
   */
  async botsDisponiveis(workspaceId: string) {
    const bots = await this.prisma.telegramBot.findMany({
      where: { workspaceId },
      select: {
        id: true, username: true, status: true, isActive: true,
        downSince: true, downReason: true, warmupChatId: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Onde cada bot já está comprometido: numa fila de contenção, ou como bot
    // fixo de um fluxo. Os dois impedem que ele vire reserva de outro lugar.
    const emFila = await p(this.prisma).flowBotSlot.findMany({
      select: { botId: true, flow: { select: { id: true, name: true } } },
    });
    const filaPorBot = new Map<string, { id: string; nome: string }>(
      emFila.map((s: any) => [s.botId, { id: s.flow?.id, nome: s.flow?.name }]),
    );

    const comoBotDeFluxo = await this.prisma.flow.findMany({
      where: { workspaceId, botId: { not: null } },
      select: { id: true, name: true, botId: true },
    });
    const fluxoPorBot = new Map<string, { id: string; nome: string }>(
      comoBotDeFluxo.map((f) => [f.botId as string, { id: f.id, nome: f.name }]),
    );

    return bots.map((b) => {
      const usadoEm = filaPorBot.get(b.id) ?? fluxoPorBot.get(b.id) ?? null;

      // Ordem importa: o motivo mostrado é o primeiro que realmente impede.
      let impedimento: string | null = null;
      if (b.isActive === false)        impedimento = 'desativado';
      else if (b.status === 'BLOCKED') impedimento = 'bloqueado';
      else if ((b as any).downSince)   impedimento = 'caido';
      else if (usadoEm)                impedimento = 'em_uso';

      return {
        botId:    b.id,
        username: b.username,
        status:   b.status,
        ativo:    b.isActive && b.status !== 'BLOCKED' && !(b as any).downSince,
        bloqueado: b.status === 'BLOCKED',
        desativado: b.isActive === false,
        caido:    !!(b as any).downSince,
        motivo:   (b as any).downReason ?? null,
        emUsoEm:  usadoEm,
        prontoParaAquecer: !!b.warmupChatId,
        impedimento,
        podeEntrar: impedimento === null,
      };
    });
  }

  async adicionar(workspaceId: string, flowId: string, botId: string) {
    const fluxo = await this.prisma.flow.findFirst({
      where: { id: flowId, workspaceId },
      select: { id: true, botId: true },
    });
    if (!fluxo) throw new NotFoundException('Fluxo não encontrado neste workspace');

    const bot = await this.prisma.telegramBot.findFirst({
      where: { id: botId, workspaceId },
      select: { id: true, username: true, warmupChatId: true },
    });
    if (!bot) throw new BadRequestException('Bot não encontrado neste workspace');

    // Exclusividade: um bot é reserva de um fluxo só. É o que mantém válida a
    // trava de um fluxo ativo por bot quando ele for promovido a servindo.
    const jaEmFila = await p(this.prisma).flowBotSlot.findUnique({ where: { botId } });
    if (jaEmFila) {
      throw new BadRequestException(
        jaEmFila.flowId === flowId
          ? 'Esse bot já está na fila deste fluxo.'
          : 'Esse bot já é reserva de outro fluxo. Remova de lá antes.',
      );
    }

    // Um bot que já é o bot fixo de OUTRO fluxo entraria em conflito com a
    // trava BOT_HAS_ACTIVE_FLOW assim que fosse promovido. Melhor recusar agora,
    // com uma explicação, do que falhar na hora da troca.
    const deOutroFluxo = await this.prisma.flow.findFirst({
      where: { botId, id: { not: flowId } },
      select: { name: true },
    });
    if (deOutroFluxo) {
      throw new BadRequestException(
        `Esse bot já é o bot do fluxo "${deOutroFluxo.name}". Um bot serve um fluxo só.`,
      );
    }

    const total = await p(this.prisma).flowBotSlot.count({ where: { flowId } });
    if (total >= MAX_RESERVAS) {
      throw new BadRequestException(`Máximo de ${MAX_RESERVAS} bots por fluxo.`);
    }

    // A fila nasce com o bot do fluxo na posição 1.
    //
    // Sem isto, o primeiro reserva viraria "posição 1" sem ser quem atende, e a
    // tela mostraria uma fila que não corresponde à realidade. Fazer isso aqui,
    // dentro de uma ação explícita do usuário, e não ao listar: uma tela de
    // consulta não pode escrever no banco.
    if (total === 0 && fluxo.botId && fluxo.botId !== botId) {
      const donoJaEmFila = await p(this.prisma).flowBotSlot.findUnique({
        where: { botId: fluxo.botId },
      });
      if (!donoJaEmFila) {
        await p(this.prisma).flowBotSlot.create({
          data: { flowId, botId: fluxo.botId, ordem: 1 },
        });
        this.logger.log(`[Contenção] fila do fluxo ${flowId} criada com o bot atual na posição 1.`);
      }
    }

    const ultimo = await p(this.prisma).flowBotSlot.findFirst({
      where: { flowId }, orderBy: { ordem: 'desc' }, select: { ordem: true },
    });

    const slot = await p(this.prisma).flowBotSlot.create({
      data: { flowId, botId, ordem: (ultimo?.ordem ?? 0) + 1 },
    });

    // Fecha buraco herdado de remoções antigas: sem isto a fila continuava
    // contando de onde parou e a tela mostrava posições 3 e 4 com dois bots.
    await this.renumerar(flowId);

    // Aquece agora, não na hora do aperto: quando a troca acontecer, o cache já
    // tem que estar pronto ou o primeiro lead espera o upload do vídeo.
    // Fire-and-forget — o cadastro não espera, e a tela acompanha o progresso.
    if (bot.warmupChatId) {
      this.mediaWarmup
        .runWarmup(flowId, botId)
        .catch((e: any) => this.logger.warn(`[Contenção] aquecimento de @${bot.username} falhou: ${e?.message}`));
    } else {
      this.logger.warn(
        `[Contenção] @${bot.username} entrou na fila SEM chat de aquecimento — ` +
        `a mídia só vai cachear quando o dono abrir o bot (/aquecimento).`,
      );
    }

    return slot;
  }

  async remover(workspaceId: string, flowId: string, botId: string) {
    const fluxo = await this.prisma.flow.findFirst({
      where: { id: flowId, workspaceId }, select: { id: true, botId: true },
    });
    if (!fluxo) throw new NotFoundException('Fluxo não encontrado neste workspace');

    // Tirar da fila o bot que está servindo deixaria o fluxo sem rede: ele
    // continua atendendo (o Flow.botId não muda), mas a próxima queda não
    // teria para onde ir sem ninguém perceber.
    if (fluxo.botId === botId) {
      throw new BadRequestException(
        'Esse bot é o que está atendendo agora. Promova outro antes de tirá-lo da fila.',
      );
    }

    await p(this.prisma).flowBotSlot.deleteMany({ where: { flowId, botId } });
    await this.renumerar(flowId);
    return { ok: true };
  }

  /**
   * Fecha buracos na numeração: deixa a fila em 1, 2, 3… sem furo.
   *
   * Remover alguém do meio deixava a fila em 1, 3, 4 — e um caso real ficou com
   * um único bot na posição 3. Além de confundir na tela, furo fazia a sonda
   * pular reservas (ela filtrava por posição) e o próximo bot adicionado
   * continuar a contagem furada.
   *
   * Duas etapas por causa do índice único (flowId, ordem): passar direto para a
   * numeração nova esbarraria em posições ainda ocupadas no meio do caminho.
   */
  private async renumerar(flowId: string): Promise<void> {
    const slots = await p(this.prisma).flowBotSlot.findMany({
      where: { flowId }, orderBy: { ordem: 'asc' }, select: { id: true, ordem: true },
    });

    const precisa = slots.some((s: any, i: number) => s.ordem !== i + 1);
    if (!precisa) return;

    await this.prisma.$transaction([
      ...slots.map((s: any, i: number) =>
        p(this.prisma).flowBotSlot.update({ where: { id: s.id }, data: { ordem: -(i + 1) } }),
      ),
      ...slots.map((s: any, i: number) =>
        p(this.prisma).flowBotSlot.update({ where: { id: s.id }, data: { ordem: i + 1 } }),
      ),
    ]);
  }

  /**
   * Reordena a fila inteira (arrastar e soltar).
   *
   * Em duas etapas porque `(flowId, ordem)` é único: passar direto para a ordem
   * nova esbarraria em posições ainda ocupadas no meio do caminho. A primeira
   * etapa joga todo mundo para uma faixa negativa, que ninguém usa.
   */
  async reordenar(workspaceId: string, flowId: string, botIdsNaOrdem: string[]) {
    const fluxo = await this.prisma.flow.findFirst({
      where: { id: flowId, workspaceId }, select: { id: true },
    });
    if (!fluxo) throw new NotFoundException('Fluxo não encontrado neste workspace');

    const atuais = await p(this.prisma).flowBotSlot.findMany({
      where: { flowId }, select: { botId: true },
    });
    const conhecidos = new Set(atuais.map((s: any) => s.botId));

    if (botIdsNaOrdem.length !== conhecidos.size || botIdsNaOrdem.some((b) => !conhecidos.has(b))) {
      throw new BadRequestException('A ordem enviada não bate com os bots da fila deste fluxo.');
    }

    await this.prisma.$transaction([
      ...botIdsNaOrdem.map((botId, i) =>
        p(this.prisma).flowBotSlot.updateMany({
          where: { flowId, botId }, data: { ordem: -(i + 1) },
        }),
      ),
      ...botIdsNaOrdem.map((botId, i) =>
        p(this.prisma).flowBotSlot.updateMany({
          where: { flowId, botId }, data: { ordem: i + 1 },
        }),
      ),
    ]);

    return { ok: true };
  }
}
