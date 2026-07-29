import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookDispatchService, OUTBOUND_WEBHOOK_QUEUE } from './webhook-dispatch.service';
import { WebhookDispatchController } from './webhook-dispatch.controller';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: OUTBOUND_WEBHOOK_QUEUE }),
  ],
  controllers: [WebhookDispatchController],
  providers: [WebhookDispatchService, WebhookDeliveryProcessor],
  exports: [WebhookDispatchService],
})
export class WebhookDispatchModule {}
