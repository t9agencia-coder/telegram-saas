import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { FacebookCapiService, CAPI_EVENTS_QUEUE } from './facebook-capi.service';

// Processa os eventos de CAPI fora do event loop do backend (roda só na
// instância worker — ver common/queue-role). Hoje só 'page-view'; os eventos
// de PIX (AddToCart / Purchase) continuam inline por serem baixo volume.
@Processor(CAPI_EVENTS_QUEUE, { concurrency: 20 })
export class CapiProcessor extends WorkerHost {
  private readonly logger = new Logger(CapiProcessor.name);

  constructor(private readonly capi: FacebookCapiService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'page-view') return;
    const { workspaceId, ctx } = job.data;
    await this.capi.handlePageView(workspaceId, ctx);
  }
}
