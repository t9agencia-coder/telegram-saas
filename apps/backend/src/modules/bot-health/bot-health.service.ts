import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { decrypt } from '../../common/utils/encryption';

/**
 * Saúde dos bots — quem está vivo para atender.
 *
 * A distinção que sustenta tudo aqui:
 *
 *   401 Unauthorized  → nível BOT. Token revogado ou bot banido pelo Telegram.
 *                       O bot não fala com ninguém. É o único sinal de queda.
 *   403 Forbidden     → nível CHAT. O usuário bloqueou o bot. Vale só para
 *                       aquele chat, e acontece o tempo todo (5.443 vezes em
 *                       48h num levantamento real). Derrubar um bot por 403
 *                       tiraria a operação do ar no primeiro cliente que
 *                       bloqueasse.
 *
 * Por isso nada além de 401 marca um bot como caído.
 *
 * Duas camadas de detecção, porque nenhuma basta sozinha:
 *
 *   Passiva — qualquer chamada ao Telegram que volte 401 marca o bot na hora.
 *             Custo zero e imediata, mas só pega bot com movimento.
 *   Ativa   — `getMe` periódico. É a que importa de verdade: quando o Telegram
 *             bane um bot, ele PARA de entregar updates. O lead clica, cai no
 *             bot morto, e nós não recebemos nada — nenhuma mensagem, nenhum
 *             erro. Sem a sonda, um bot banido ficaria caído em silêncio.
 *
 * `status` (BotStatus) não é tocado aqui: continua sendo decisão manual do
 * admin. Misturar as duas coisas faria a automação sobrescrever uma decisão
 * humana.
 */
@Injectable()
export class BotHealthService {
  private readonly logger = new Logger(BotHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** O erro do Telegram é um 401? Aceita as várias formas que ele chega. */
  static ehUnauthorized(erro: any): boolean {
    const status = erro?.response?.status ?? erro?.status;
    const codigo = erro?.response?.data?.error_code ?? erro?.error_code;
    return status === 401 || codigo === 401;
  }

  /**
   * Ponto de entrada da detecção passiva: chame com o erro de qualquer chamada
   * ao Telegram. Só age em 401 — todo o resto é ignorado de propósito.
   */
  async registrarFalhaTelegram(botId: string | null | undefined, erro: any): Promise<void> {
    if (!botId) return;
    if (!BotHealthService.ehUnauthorized(erro)) return;

    const descricao = erro?.response?.data?.description || erro?.message || 'Unauthorized';
    await this.marcarCaido(botId, `401 do Telegram: ${descricao}`.slice(0, 250));
  }

  /** Idempotente: um bot já marcado não tem o `downSince` reescrito. */
  async marcarCaido(botId: string, motivo: string): Promise<void> {
    let marcouAgora = false;
    try {
      const { count } = await this.prisma.telegramBot.updateMany({
        where: { id: botId, downSince: null },
        data: { downSince: new Date(), downReason: motivo, lastCheckedAt: new Date() },
      });
      marcouAgora = count > 0;
      if (marcouAgora) {
        this.logger.error(`[BotHealth] bot ${botId} marcado como CAÍDO — ${motivo}`);
      }
    } catch (e: any) {
      this.logger.warn(`[BotHealth] falha ao marcar bot ${botId} como caído: ${e?.message}`);
      return;
    }

    // Só na transição viva→caído. Sem isso, cada 401 de um bot já morto
    // reexecutaria a promoção.
    if (marcouAgora) await this.promoverFluxosDoBot(botId);
  }

  /**
   * Passa os fluxos servidos por um bot caído para o próximo bot vivo da fila.
   *
   * O ponteiro é o `Flow.botId`, e isso é de propósito: ele já significa "o bot
   * que serve este fluxo" para todo o resto do sistema — cache de mídia,
   * aquecimento, trava de fluxo ativo por bot e, principalmente, o link que o
   * `/r/` monta (`flow.bot.username`). Mover ele é o que faz o redirecionador
   * apontar para o bot novo no clique seguinte, sem tocar no caminho quente do
   * redirect e sem custo de latência nenhum.
   *
   * A ORDEM dos slots não é mexida. Banimento é definitivo, então não há volta
   * ao bot anterior: quem serve é sempre o primeiro vivo da fila, e o bot morto
   * fica na posição dele para o dono ver o que aconteceu e remover quando
   * quiser.
   */
  async promoverFluxosDoBot(botIdCaido: string): Promise<void> {
    try {
      const fluxos = await this.prisma.flow.findMany({
        where: { botId: botIdCaido },
        select: { id: true, name: true },
      });
      if (fluxos.length === 0) return;

      for (const fluxo of fluxos) {
        const proximo = await (this.prisma as any).flowBotSlot.findFirst({
          where: {
            flowId: fluxo.id,
            botId:  { not: botIdCaido },
            bot:    { downSince: null, isActive: true },
          },
          orderBy: { ordem: 'asc' },
          select: { botId: true, ordem: true, bot: { select: { username: true } } },
        });

        if (!proximo) {
          this.logger.error(
            `[BotHealth] fluxo "${fluxo.name}" (${fluxo.id}) ficou SEM BOT: o bot caiu e ` +
            `não há reserva viva na fila de contenção.`,
          );
          continue;
        }

        await this.prisma.flow.update({
          where: { id: fluxo.id },
          data:  { botId: proximo.botId },
        });

        this.logger.warn(
          `[BotHealth] contenção: fluxo "${fluxo.name}" passou para @${proximo.bot?.username} ` +
          `(posição ${proximo.ordem}). O próximo clique no link já vai para ele.`,
        );
      }
    } catch (e: any) {
      this.logger.error(`[BotHealth] falha ao promover fluxos do bot ${botIdCaido}: ${e?.message}`);
    }
  }

  /**
   * Banimento no Telegram é definitivo na prática, então isto não existe para
   * "ressuscitar" bot: serve para o dono trocar o token do bot e limpar a
   * marcação à mão, e para a sonda não deixar marcado um bot que responde.
   */
  async marcarVivo(botId: string): Promise<void> {
    try {
      await this.prisma.telegramBot.updateMany({
        where: { id: botId },
        data: { downSince: null, downReason: null, lastCheckedAt: new Date() },
      });
    } catch (e: any) {
      this.logger.warn(`[BotHealth] falha ao marcar bot ${botId} como vivo: ${e?.message}`);
    }
  }

  /**
   * Sonda um bot com `getMe`. Devolve true se ele respondeu.
   *
   * Só 401 derruba. Timeout, 5xx e queda de rede não são o bot morrendo — são
   * o Telegram ou a nossa saída de rede oscilando, e tratar isso como queda
   * trocaria o bot de um cliente à toa.
   */
  async sondarBot(bot: { id: string; botToken: string }): Promise<boolean> {
    let token: string;
    try {
      token = decrypt(bot.botToken);
    } catch {
      await this.marcarCaido(bot.id, 'token ilegível no banco');
      return false;
    }

    try {
      await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10_000 });
      await this.prisma.telegramBot
        .updateMany({ where: { id: bot.id }, data: { lastCheckedAt: new Date() } })
        .catch(() => undefined);
      return true;
    } catch (erro: any) {
      if (BotHealthService.ehUnauthorized(erro)) {
        const descricao = erro?.response?.data?.description || 'Unauthorized';
        await this.marcarCaido(bot.id, `getMe respondeu 401: ${descricao}`.slice(0, 250));
        return false;
      }
      this.logger.warn(
        `[BotHealth] getMe falhou para ${bot.id} sem ser 401 (${erro?.message}) — ` +
        `não conta como queda.`,
      );
      return true;
    }
  }
}
