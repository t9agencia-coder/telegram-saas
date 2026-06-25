import { Module } from '@nestjs/common';
import { RedirectorsController, PublicRedirectorsController } from './redirectors.controller';
import { RedirectorsService } from './redirectors.service';
import { FacebookCapiModule } from '../facebook-capi/facebook-capi.module';

@Module({
  imports: [FacebookCapiModule],
  controllers: [RedirectorsController, PublicRedirectorsController],
  providers: [RedirectorsService],
  exports: [RedirectorsService],
})
export class RedirectorsModule {}
