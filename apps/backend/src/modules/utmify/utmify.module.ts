import { Module } from '@nestjs/common';
import { UtmifyController } from './utmify.controller';
import { UtmifyService } from './utmify.service';

@Module({
  controllers: [UtmifyController],
  providers: [UtmifyService],
  exports: [UtmifyService],
})
export class UtmifyModule {}
