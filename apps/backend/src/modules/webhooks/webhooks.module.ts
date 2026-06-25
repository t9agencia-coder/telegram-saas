import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ScheduledTasksProcessor } from './scheduled-tasks.processor';
import { PixModule } from '../pix/pix.module';
import { FacebookAdsModule } from '../facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { UtmifyModule } from '../utmify/utmify.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'telegram-messages' },
      { name: 'telegram-remarketing' },
      { name: 'scheduled-tasks' },
    ),
    PixModule, FacebookAdsModule, KwaiAdsModule, UtmifyModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, ScheduledTasksProcessor],
})
export class WebhooksModule {}
