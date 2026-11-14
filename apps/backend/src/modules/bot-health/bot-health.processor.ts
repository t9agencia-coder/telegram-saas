import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BotHealthService } from './bot-health.service';

export const BOT_HEALTH_QUEUE = 'bot-health';

/** De quanto em quanto tempo a sonda acorda. */
const INTERVALO_MS = 30_000;

/**
 * Reserva não recebe tráfego, então não precisa do mesmo ritmo de quem está
 * servindo — mas precisa estar vivo NA HORA em que for promovido.
 */
const INTERVALO_RESERVA_MS = 5 * 60_000;

/**
 * Chave do agendador repetível. É idempotente: as duas instâncias de worker
 * podem declarar a mesma chave na subida sem duplicar a sonda.
 */
const AGENDADOR_ID = 'bot-health-tick';

/**
 * Sonda periódica de saúde dos bots.
 *
 * Existe porque um bot banido é silencioso: o Telegram simplesmente para de
 * entregar updates. Sem alguém perguntando "você está aí?", a queda só
 * apareceria quando um disparo de remarketing esbarrasse nela — ou nunca, se o
 * fluxo não tiver remarketing.
 *
 * O intervalo é o que define quantas pessoas se perdem entre o banimento e a
 * troca: 30s, contra ~22 bots, é uma chamada a cada 1,4s no `getMe`, que é a
 * chamada mais barata da API do Telegram. O custo é irrelevante e a janela
 * fica curta.
 *
 * O agendamento é um Job Scheduler do BullMQ, e isso é uma CORREÇÃO: antes era
 * um job que se reagendava com `jobId` fixo, copiado do remarketing cíclico. Só
 * que o remarketing usa um id diferente por disparo, e aqui o id era sempre o
 * mesmo. Reagendar de dentro do `process` significava pedir ao BullMQ um job com
 * um id que o job em execução ainda ocupava — e o BullMQ ignora isso em
 * silêncio. Resultado: a sonda rodava UMA vez por subida do container e a fila
 * ficava vazia para sempre, sem erro em log nenhum. Nenhuma queda de bot era
 * detectada, e por consequência nenhuma contenção acontecia.
 */
@Processor(BOT_HEALTH_QUEUE, { concurrency: 1 })
export class BotHealthProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BotHealthProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly saude: BotHealthService,
    @InjectQueue(BOT_HEALTH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /**
   * Declara o agendador na subida. `upsert` é idempotente pela chave, então as
   * duas instâncias de worker podem chamar isto sem duplicar a sonda, e mudar o
   * intervalo depois não deixa agendamento antigo para trás.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        AGENDADOR_ID,
        { every: INTERVALO_MS },
        {
          name: 'sondar',
          data: {},
          opts: { removeOnComplete: true, removeOnFail: { count: 20 } },
        },
      );
      this.logger.log(`[BotHealth] sonda agendada a cada ${INTERVALO_MS / 1000}s.`);
    } catch (e: any) {
      // Falhar aqui deixa a contenção cega, então não pode passar em silêncio —
      // foi exatamente o silêncio que escondeu o bug anterior por dois dias.
      this.logger.error(`[BotHealth] NÃO consegui agendar a sonda: ${e?.message}`);
    }
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'sondar') return;

    // Sem reagendamento manual: quem repete é o agendador. Não engole mais o
    // erro da rodada em `warn` — se a sonda parar de funcionar, tem que doer.
    await this.sondarRodada();
  }

  private async sondarRodada(): Promise<void> {
    const limiteReserva = new Date(Date.now() - INTERVALO_RESERVA_MS);

    // Quem está servindo agora: o bot de um fluxo ATIVO. Bot já marcado como
    // caído fica de fora — banimento não se desfaz sozinho, e insistir só
    // gastaria chamada. Quem troca o token limpa a marcação pelo painel.
    const servindo = await this.prisma.telegramBot.findMany({
      where: {
        downSince: null,
        isActive: true,
        flows: { some: { isActive: true } },
      },
      select: { id: true, botToken: true },
    });

    // Quem está em alguma fila de contenção: ritmo mais folgado, porque não
    // atende ninguém — o que importa é estar vivo NA HORA de ser promovido.
    //
    // Sem filtro de `ordem`: antes era `ordem > 1`, partindo da ideia de que a
    // posição 1 é sempre o bot que serve. A numeração pode ter buraco (remover
    // um do meio deixava a fila em 1, 3, 4), e aí um reserva na posição 1 nunca
    // era sondado. Quem já foi sondado como "servindo" é descartado logo abaixo,
    // então incluir todos não custa chamada a mais.
    const reservas = await (this.prisma as any).telegramBot.findMany({
      where: {
        downSince: null,
        isActive: true,
        flowSlots: { some: {} },
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: limiteReserva } }],
      },
      select: { id: true, botToken: true },
    });

    const vistos = new Set<string>();
    const alvos = [...servindo, ...reservas].filter((b: any) => {
      if (vistos.has(b.id)) return false;
      vistos.add(b.id);
      return true;
    });

    if (alvos.length === 0) return;

    // Em série: são poucos bots e não há pressa dentro da janela de 30s. Em
    // paralelo, um pico de rede bateria no Telegram todo de uma vez.
    let caidos = 0;
    for (const bot of alvos) {
      const vivo = await this.saude.sondarBot(bot as any);
      if (!vivo) caidos++;
    }

    if (caidos > 0) {
      this.logger.error(`[BotHealth] rodada: ${caidos} de ${alvos.length} bot(s) caíram.`);
    }
  }
}
