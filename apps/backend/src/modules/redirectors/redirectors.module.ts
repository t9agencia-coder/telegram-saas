import { Module } from '@nestjs/common';
import { RedirectorsController, PublicRedirectorsController } from './redirectors.controller';
import { RedirectorsService } from './redirectors.service';
import { FacebookCapiModule } from '../facebook-capi/facebook-capi.module';
import { PlatformSettingsModule } from '../settings/platform-settings.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';
import { IpBlacklistModule } from '../ip-blacklist/ip-blacklist.module';

@Module({
  imports: [FacebookCapiModule, PlatformSettingsModule, KwaiAdsModule, IpBlacklistModule],
  controllers: [RedirectorsController, PublicRedirectorsController],
  providers: [RedirectorsService],
  exports: [RedirectorsService],
})
export class RedirectorsModule {}
