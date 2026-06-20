import { Module } from '@nestjs/common';
import { TelegramBotsController } from './telegram-bots.controller';
import { TelegramBotsService } from './telegram-bots.service';

@Module({
  controllers: [TelegramBotsController],
  providers: [TelegramBotsService],
  exports: [TelegramBotsService],
})
export class TelegramBotsModule {}
