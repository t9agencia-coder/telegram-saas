import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FacebookCapiService, CAPI_EVENTS_QUEUE } from './facebook-capi.service';
import { CapiProcessor } from './capi.processor';
import { runsHeavyQueues } from '../../common/queue-role';

@Module({
  imports: [BullModule.registerQueue({ name: CAPI_EVENTS_QUEUE })],
  // O processor (Worker BullMQ) só sobe na instância worker; o backend (api)
  // continua só ENFILEIRANDO via FacebookCapiService.enqueuePageView.
  providers: [
    FacebookCapiService,
    ...(runsHeavyQueues() ? [CapiProcessor] : []),
  ],
  exports: [FacebookCapiService],
})
export class FacebookCapiModule {}
