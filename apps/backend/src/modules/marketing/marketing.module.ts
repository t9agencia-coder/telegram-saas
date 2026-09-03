import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { runsHeavyQueues } from '../../common/queue-role';
import { AuditLogModule } from '../../common/audit-log.module';
import { MKT_SYNC_QUEUE, MKT_SALES_QUEUE } from './marketing.constants';

import { MetaGraphClient } from './integrations/meta/meta-graph.client';
import { MetaOAuthService } from './integrations/meta/meta-oauth.service';
import { MetaAdsService } from './integrations/meta/meta-ads.service';

import { MetaConnectionService } from './services/meta-connection.service';
import { MetaSyncService } from './services/meta-sync.service';
import { MarketingMetricsService } from './services/marketing-metrics.service';
import { TrackingFinanceService } from './services/tracking-finance.service';
import { TrackingGridService } from './services/tracking-grid.service';
import { MetaCampaignOpsService } from './services/meta-campaign-ops.service';
import { MarketingAttributionService } from './services/marketing-attribution.service';
import { MarketingSalesService } from './services/marketing-sales.service';
import { MarketingSchedulerService } from './marketing-scheduler.service';

import { MarketingController } from './controllers/marketing.controller';
import { MetaOAuthController } from './controllers/meta-oauth.controller';
import { MetaSyncProcessor } from './workers/meta-sync.processor';
import { SalesScanProcessor } from './workers/sales-scan.processor';

/**
 * Módulo Tracking — independente do motor de bots/fluxos. Só compartilha
 * PrismaService (global), auth e a infra de filas. Os @Processor só sobem onde
 * QUEUE_ROLE permite (worker / all); no backend/api o InjectQueue segue sendo
 * só produtor.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: MKT_SYNC_QUEUE }, { name: MKT_SALES_QUEUE }),
    AuditLogModule,
  ],
  controllers: [MarketingController, MetaOAuthController],
  providers: [
    MetaGraphClient,
    MetaOAuthService,
    MetaAdsService,
    MetaConnectionService,
    MetaSyncService,
    MarketingMetricsService,
    TrackingFinanceService,
    TrackingGridService,
    MetaCampaignOpsService,
    MarketingAttributionService,
    MarketingSalesService,
    MarketingSchedulerService,
    ...(runsHeavyQueues() ? [MetaSyncProcessor, SalesScanProcessor] : []),
  ],
})
export class MarketingModule {}
