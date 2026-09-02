import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PushNotificationsService, PUSH_NOTIFICATION_QUEUE } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushDeliveryProcessor } from './push-delivery.processor';
import { PlatformSettingsModule } from '../settings/platform-settings.module';
import { runsHeavyQueues } from '../../common/queue-role';

@Module({
  imports: [
    BullModule.registerQueue({ name: PUSH_NOTIFICATION_QUEUE }),
    PlatformSettingsModule,
  ],
  controllers: [PushNotificationsController],
  providers: [
    PushNotificationsService,
    ...(runsHeavyQueues() ? [PushDeliveryProcessor] : []),
  ],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
