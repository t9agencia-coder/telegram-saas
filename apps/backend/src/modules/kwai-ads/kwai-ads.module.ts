import { Module } from '@nestjs/common';
import { KwaiAdsController } from './kwai-ads.controller';
import { KwaiAdsService } from './kwai-ads.service';

@Module({
  controllers: [KwaiAdsController],
  providers: [KwaiAdsService],
  exports: [KwaiAdsService],
})
export class KwaiAdsModule {}
