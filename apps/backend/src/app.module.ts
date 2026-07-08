import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma.module';
import { RedisModule } from './common/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TelegramBotsModule } from './modules/telegram-bots/telegram-bots.module';
import { ProductsModule } from './modules/products/products.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PixModule } from './modules/pix/pix.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { EventsModule } from './modules/events/events.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { FacebookAdsModule } from './modules/facebook-ads/facebook-ads.module';
import { KwaiAdsModule } from './modules/kwai-ads/kwai-ads.module';
import { UtmifyModule } from './modules/utmify/utmify.module';
import { AutomationModule } from './modules/automation/automation.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AdminModule } from './modules/admin/admin.module';
import { AcquirersModule } from './modules/acquirers/acquirers.module';
import { RedirectorsModule } from './modules/redirectors/redirectors.module';
import { DomainsModule } from './modules/domains/domains.module';
import { BalanceModule } from './modules/balance/balance.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    BullModule.forRoot({
      connection: {
        host:     process.env.REDIS_HOST     || 'localhost',
        port:     parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      streams: {
        events: { maxLen: 500 }, // limita event streams a 500 entradas por fila
      },
      defaultJobOptions: {
        attempts: 3,
        backoff:  { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500, age: 24 * 3600 },      // guarda últimos 500 por 1 dia
        removeOnFail:     { count: 100, age: 7 * 24 * 3600 },  // guarda falhas por 7 dias
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    TelegramBotsModule,
    ProductsModule,
    PaymentsModule,
    PixModule,
    TrackingModule,
    EventsModule,
    AnalyticsModule,
    FacebookAdsModule,
    KwaiAdsModule,
    UtmifyModule,
    AutomationModule,
    WebhooksModule,
    AdminModule,
    AcquirersModule,
    RedirectorsModule,
    DomainsModule,
    BalanceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
