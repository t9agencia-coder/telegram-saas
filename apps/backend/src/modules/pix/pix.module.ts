import { Module, forwardRef } from '@nestjs/common';
import { PixService } from './pix.service';
import { PixController } from './pix.controller';
import { PixConfigService } from './pix-config.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [forwardRef(() => PaymentsModule)],
  controllers: [PixController],
  providers: [PixService, PixConfigService],
  exports: [PixService, PixConfigService],
})
export class PixModule {}
