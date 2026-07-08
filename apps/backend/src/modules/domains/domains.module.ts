import { Module } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { AdminDomainsController, PublicDomainsController, WorkspaceDomainsController } from './domains.controller';

@Module({
  controllers: [AdminDomainsController, PublicDomainsController, WorkspaceDomainsController],
  providers:   [DomainsService],
  exports:     [DomainsService],
})
export class DomainsModule {}
