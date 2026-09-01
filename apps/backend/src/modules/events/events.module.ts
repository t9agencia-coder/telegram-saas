import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TelegramBlacklistModule } from '../telegram-blacklist/telegram-blacklist.module';

@Module({
  imports: [TelegramBlacklistModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
