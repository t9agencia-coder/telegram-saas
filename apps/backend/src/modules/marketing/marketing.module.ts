import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { runsHeavyQueues } from '../../common/queue-role';
import { MKT_SYNC_QUEUE } from './marketing.constants';

import { MetaGraphClient } from './integrations/meta/meta-graph.client';
import { MetaOAuthService } from './integrations/meta/meta-oauth.service';
import { MetaAdsService } from './integrations/meta/meta-ads.service';

import { MetaConnectionService } from './services/meta-connection.service';
import { MetaSyncService } from './services/meta-sync.service';
import { MarketingMetricsService } from './services/marketing-metrics.service';
import { MarketingSchedulerService } from './marketing-scheduler.service';

import { MarketingController } from './controllers/marketing.controller';
import { MetaOAuthController } from './controllers/meta-oauth.controller';
import { MetaSyncProcessor } from './workers/meta-sync.processor';

/**
 * Módulo Tracking — independente do motor de bots/fluxos. Só compartilha
 * PrismaService (global), auth e a infra de filas. O @Processor de sync só
 * sobe onde QUEUE_ROLE permite (worker / all); no backend/api o InjectQueue
 * segue sendo só produtor.
 */
@Module({
  imports: [BullModule.registerQueue({ name: MKT_SYNC_QUEUE })],
  controllers: [MarketingController, MetaOAuthController],
  providers: [
    MetaGraphClient,
    MetaOAuthService,
    MetaAdsService,
    MetaConnectionService,
    MetaSyncService,
    MarketingMetricsService,
    MarketingSchedulerService,
    ...(runsHeavyQueues() ? [MetaSyncProcessor] : []),
  ],
})
export class MarketingModule {}
