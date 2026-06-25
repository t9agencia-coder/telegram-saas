import { Module } from '@nestjs/common';
import { AcquirerRegistryService } from './acquirer-registry.service';

@Module({
  providers: [AcquirerRegistryService],
  exports: [AcquirerRegistryService],
})
export class AcquirersModule {}
