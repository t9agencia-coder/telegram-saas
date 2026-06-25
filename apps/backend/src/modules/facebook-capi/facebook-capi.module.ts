import { Module } from '@nestjs/common';
import { FacebookCapiService } from './facebook-capi.service';

@Module({
  providers: [FacebookCapiService],
  exports: [FacebookCapiService],
})
export class FacebookCapiModule {}
