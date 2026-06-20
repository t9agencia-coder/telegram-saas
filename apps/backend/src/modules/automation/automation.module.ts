import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationProcessor } from './automation.processor';
import { WebhookProcessor } from './webhook.processor';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';
import { FacebookAdsModule } from '../facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { UtmifyModule } from '../utmify/utmify.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'telegram-messages' },
      { name: 'webhook-events' },
      { name: 'scheduled-tasks' },
    ),
    TelegramBotsModule,
    FacebookAdsModule,
    KwaiAdsModule,
    UtmifyModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationProcessor, WebhookProcessor],
  exports: [AutomationService],
})
export class AutomationModule {}
