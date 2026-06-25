import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PixService } from './pix.service';
import { PixController } from './pix.controller';
import { PixConfigService } from './pix-config.service';
import { PaymentsModule } from '../payments/payments.module';
import { AcquirersModule } from '../acquirers/acquirers.module';
import { FacebookCapiModule } from '../facebook-capi/facebook-capi.module';
import { UtmifyModule } from '../utmify/utmify.module';
import { KwaiAdsModule } from '../kwai-ads/kwai-ads.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'telegram-messages' }),
    forwardRef(() => PaymentsModule),
    AcquirersModule,
    FacebookCapiModule,
    UtmifyModule,
    KwaiAdsModule,
  ],
  controllers: [PixController],
  providers:   [PixService, PixConfigService],
  exports:     [PixService, PixConfigService],
})
export class PixModule {}
