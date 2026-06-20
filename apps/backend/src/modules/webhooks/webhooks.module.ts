import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PixModule } from '../pix/pix.module';
import { FacebookAdsModule } from '../facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { UtmifyModule } from '../utmify/utmify.module';

@Module({
  imports: [PixModule, FacebookAdsModule, KwaiAdsModule, UtmifyModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
