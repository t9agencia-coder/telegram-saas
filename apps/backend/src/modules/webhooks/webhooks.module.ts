import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ScheduledTasksProcessor } from './scheduled-tasks.processor';
import { BroadcastTasksProcessor } from './broadcast-tasks.processor';
import { TelegramUpdatesProcessor } from './telegram-updates.processor';
import { PixModule } from '../pix/pix.module';
import { FacebookAdsModule } from '../facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { UtmifyModule } from '../utmify/utmify.module';
import { TelegramBlacklistModule } from '../telegram-blacklist/telegram-blacklist.module';
import { runsFlowQueues, runsHeavyQueues } from '../../common/queue-role';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'telegram-messages' },
      { name: 'telegram-remarketing' },
      { name: 'scheduled-tasks' },
      { name: 'broadcast-tasks' },
      { name: 'telegram-updates' },
    ),
    PixModule, FacebookAdsModule, KwaiAdsModule, UtmifyModule, TelegramBlacklistModule,
  ],
  controllers: [WebhooksController],
  // telegram-updates / scheduled-tasks só rodam onde QUEUE_ROLE permite as filas
  // de fluxo (api / all). broadcast-tasks é fila pesada: roda no worker (worker /
  // all), fora do event loop do /start.
  providers: [
    WebhooksService,
    ...(runsFlowQueues() ? [ScheduledTasksProcessor, TelegramUpdatesProcessor] : []),
    ...(runsHeavyQueues() ? [BroadcastTasksProcessor] : []),
  ],
})
export class WebhooksModule {}
