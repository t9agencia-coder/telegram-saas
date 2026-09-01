import { Module } from '@nestjs/common';
import { IpBlacklistService } from './ip-blacklist.service';

@Module({
  providers: [IpBlacklistService],
  exports: [IpBlacklistService],
})
export class IpBlacklistModule {}
