import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../../common/guards/workspace-owner.guard';
import { MetaOAuthService } from '../integrations/meta/meta-oauth.service';
import { MetaConnectionService } from '../services/meta-connection.service';
import { MarketingMetricsService, resolvePeriod } from '../services/marketing-metrics.service';
import { MarketingSchedulerService } from '../marketing-scheduler.service';
import { MarketingPeriod } from '../marketing.constants';

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/marketing')
export class MarketingController {
  constructor(
    private readonly oauth: MetaOAuthService,
    private readonly connections: MetaConnectionService,
    private readonly metrics: MarketingMetricsService,
    private readonly scheduler: MarketingSchedulerService,
  ) {}

  // ── Conexão Meta ──────────────────────────────────────────────────────────

  @Get('meta/status')
  @ApiOperation({ summary: 'Estado da conexão Meta Ads (sem token)' })
  status(@Param('workspaceId') workspaceId: string) {
    return this.connections.getStatus(workspaceId);
  }

  @Get('meta/oauth/url')
  @ApiOperation({ summary: 'URL do diálogo OAuth da Meta pra este workspace' })
  oauthUrl(@Param('workspaceId') workspaceId: string) {
    return { url: this.oauth.buildAuthUrl(workspaceId) };
  }

  @Post('meta/ad-accounts/refresh')
  @ApiOperation({ summary: 'Rebusca as contas de anúncio na Meta' })
  refreshAccounts(@Param('workspaceId') workspaceId: string) {
    return this.connections.refreshAdAccounts(workspaceId);
  }

  @Post('meta/ad-accounts/:adAccountId/select')
  @ApiOperation({ summary: 'Escolhe a conta de anúncio a sincronizar' })
  async select(
    @Param('workspaceId') workspaceId: string,
    @Param('adAccountId') adAccountId: string,
  ) {
    const r = await this.connections.selectAdAccount(workspaceId, adAccountId);
    await this.scheduler.kick(adAccountId).catch(() => {});
    return r;
  }

  @Delete('meta/connection')
  @ApiOperation({ summary: 'Desconecta a Meta deste workspace' })
  disconnect(@Param('workspaceId') workspaceId: string) {
    return this.connections.disconnect(workspaceId);
  }

  // ── Dashboard (lê do banco local) ─────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Cards + série da Visão Geral' })
  overview(
    @Param('workspaceId') workspaceId: string,
    @Query('period') period: MarketingPeriod = 'last7',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metrics.overview(workspaceId, resolvePeriod(period, from, to));
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Tabela de campanhas com métricas do período' })
  campaigns(
    @Param('workspaceId') workspaceId: string,
    @Query('period') period: MarketingPeriod = 'last7',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metrics.campaignTable(workspaceId, resolvePeriod(period, from, to));
  }

  @Get('campaigns/:campaignId')
  @ApiOperation({ summary: 'Detalhe da campanha (adsets + ads)' })
  campaignDetail(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Query('period') period: MarketingPeriod = 'last7',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metrics.campaignDetail(workspaceId, campaignId, resolvePeriod(period, from, to));
  }
}
