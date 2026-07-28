import { Module } from '@nestjs/common';
import { RedirectorsController, PublicRedirectorsController } from './redirectors.controller';
import { RedirectorsService } from './redirectors.service';
import { FacebookCapiModule } from '../facebook-capi/facebook-capi.module';
import { PlatformSettingsModule } from '../settings/platform-settings.module';

@Module({
  imports: [FacebookCapiModule, PlatformSettingsModule],
  controllers: [RedirectorsController, PublicRedirectorsController],
  providers: [RedirectorsService],
  exports: [RedirectorsService],
})
export class RedirectorsModule {}
