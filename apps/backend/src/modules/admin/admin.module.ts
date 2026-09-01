import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AcquirersModule } from '../acquirers/acquirers.module';
import { BalanceModule } from '../balance/balance.module';
import { PlatformSettingsModule } from '../settings/platform-settings.module';
import { AuditLogModule } from '../../common/audit-log.module';
import { PixModule } from '../pix/pix.module';
import { TelegramBlacklistModule } from '../telegram-blacklist/telegram-blacklist.module';
import { IpBlacklistModule } from '../ip-blacklist/ip-blacklist.module';

@Module({
  imports: [
    AcquirersModule,
    BalanceModule,
    PlatformSettingsModule,
    AuditLogModule,
    PixModule,
    TelegramBlacklistModule,
    IpBlacklistModule,
    BullModule.registerQueue(
      { name: 'telegram-messages' },
      { name: 'telegram-remarketing' },
      { name: 'webhook-events' },
      { name: 'scheduled-tasks' },
    ),
  ],
  controllers: [AdminController],
  providers:   [AdminService],
  exports:     [AdminService],
})
export class AdminModule {}
