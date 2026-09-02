import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ScheduledTasksProcessor } from './scheduled-tasks.processor';
import { TelegramUpdatesProcessor } from './telegram-updates.processor';
import { PixModule } from '../pix/pix.module';
import { FacebookAdsModule } from '../facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { UtmifyModule } from '../utmify/utmify.module';
import { TelegramBlacklistModule } from '../telegram-blacklist/telegram-blacklist.module';
import { runsFlowQueues } from '../../common/queue-role';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'telegram-messages' },
      { name: 'telegram-remarketing' },
      { name: 'scheduled-tasks' },
      { name: 'telegram-updates' },
    ),
    PixModule, FacebookAdsModule, KwaiAdsModule, UtmifyModule, TelegramBlacklistModule,
  ],
  controllers: [WebhooksController],
  // Os processors de telegram-updates / scheduled-tasks só rodam onde QUEUE_ROLE
  // permite as filas de fluxo (api / all). No worker puro eles não sobem.
  providers: [
    WebhooksService,
    ...(runsFlowQueues() ? [ScheduledTasksProcessor, TelegramUpdatesProcessor] : []),
  ],
})
export class WebhooksModule {}
