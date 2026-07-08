import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AcquirersModule } from '../acquirers/acquirers.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [
    AcquirersModule,
    BalanceModule,
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
