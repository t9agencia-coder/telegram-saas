import { Module } from '@nestjs/common';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';

@Module({
  controllers: [FacebookAdsController],
  providers: [FacebookAdsService],
  exports: [FacebookAdsService],
})
export class FacebookAdsModule {}
