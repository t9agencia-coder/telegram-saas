import { Module } from '@nestjs/common';
import { TelegramBlacklistService } from './telegram-blacklist.service';
import { IpBlacklistModule } from '../ip-blacklist/ip-blacklist.module';

@Module({
  imports: [IpBlacklistModule],
  providers: [TelegramBlacklistService],
  exports: [TelegramBlacklistService, IpBlacklistModule],
})
export class TelegramBlacklistModule {}
