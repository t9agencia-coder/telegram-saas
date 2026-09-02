import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationProcessor } from './automation.processor';
import { RemarketingProcessor } from './remarketing.processor';
import { WebhookProcessor } from './webhook.processor';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';
import { FacebookAdsModule } from '../facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { UtmifyModule } from '../utmify/utmify.module';
import { TelegramBlacklistModule } from '../telegram-blacklist/telegram-blacklist.module';
import { runsHeavyQueues } from '../../common/queue-role';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'telegram-messages' },
      { name: 'telegram-remarketing' },
      { name: 'webhook-events' },
      { name: 'scheduled-tasks' },
    ),
    TelegramBotsModule,
    FacebookAdsModule,
    KwaiAdsModule,
    UtmifyModule,
    TelegramBlacklistModule,
  ],
  controllers: [AutomationController],
  // Filas pesadas de background — só sobem onde QUEUE_ROLE permite (worker / all).
  providers: [
    AutomationService,
    ...(runsHeavyQueues() ? [AutomationProcessor, RemarketingProcessor, WebhookProcessor] : []),
  ],
  exports: [AutomationService],
})
export class AutomationModule {}
