import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BotHealthService } from './bot-health.service';
import { BotHealthProcessor, BOT_HEALTH_QUEUE } from './bot-health.processor';
import { runsHeavyQueues } from '../../common/queue-role';

/**
 * A sonda ativa roda só nas instâncias de fila pesada — a instância `api`
 * atende webhook do Telegram e não deve gastar event loop com isso. O serviço
 * em si é exportado para todo mundo: a detecção passiva (401) precisa estar
 * disponível em qualquer lugar que fale com o Telegram.
 */
@Module({
  imports: [BullModule.registerQueue({ name: BOT_HEALTH_QUEUE })],
  providers: [
    BotHealthService,
    ...(runsHeavyQueues() ? [BotHealthProcessor] : []),
  ],
  exports: [BotHealthService],
})
export class BotHealthModule {}
