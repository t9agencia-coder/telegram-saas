import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MediaWarmupService } from './media-warmup.service';

export const MEDIA_WARMUP_QUEUE = 'media-warmup';

/**
 * Aquecimento de mídia fora do processo do save. Concorrência 2 — cada job pode
 * subir vários vídeos grandes; 2 em paralelo é o suficiente sem estourar o
 * rate limit do Telegram nem a banda. Retry por job (o service em si já é
 * idempotente e retoma do que falta).
 */
@Processor(MEDIA_WARMUP_QUEUE, { concurrency: 2 })
export class MediaWarmupProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaWarmupProcessor.name);

  constructor(private readonly warmup: MediaWarmupService) {
    super();
  }

  async process(job: Job<{ flowId: string }>): Promise<void> {
    const { flowId } = job.data;
    if (!flowId) return;
    try {
      await this.warmup.runWarmup(flowId);
    } catch (err: any) {
      this.logger.error(`warmup falhou (flow=${flowId}): ${err?.message}`);
      throw err; // deixa o BullMQ re-tentar
    }
  }
}
