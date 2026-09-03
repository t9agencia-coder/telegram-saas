import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../../common/guards/workspace-owner.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MetaOAuthService } from '../integrations/meta/meta-oauth.service';
import { MetaConnectionService } from '../services/meta-connection.service';
import { MarketingMetricsService, resolvePeriod } from '../services/marketing-metrics.service';
import { TrackingFinanceService, Fee } from '../services/tracking-finance.service';
import { TrackingGridService, GridLevel, StatusFilter, SortDir } from '../services/tracking-grid.service';
import { MetaCampaignOpsService, CampaignUpdateDto } from '../services/meta-campaign-ops.service';
import { MarketingSchedulerService } from '../marketing-scheduler.service';
import { MarketingPeriod } from '../marketing.constants';

@ApiTags('Tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/tracking')
export class MarketingController {
  constructor(
    private readonly oauth: MetaOAuthService,
    private readonly connections: MetaConnectionService,
    private readonly metrics: MarketingMetricsService,
    private readonly finance: TrackingFinanceService,
    private readonly gridSvc: TrackingGridService,
    private readonly campaignOps: MetaCampaignOpsService,
    private readonly scheduler: MarketingSchedulerService,
  ) {}

  // ── Taxas (config) ────────────────────────────────────────────────────────

  @Get('fees')
  @ApiOperation({ summary: 'Lista de taxas do workspace' })
  getFees(@Param('workspaceId') workspaceId: string) {
    return this.finance.getFees(workspaceId);
  }

  @Put('fees')
  @ApiOperation({ summary: 'Substitui a lista de taxas (% ou fixo, nomeadas)' })
  saveFees(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { fees?: Fee[] },
  ) {
    return this.finance.saveFees(workspaceId, dto?.fees ?? []);
  }

  @Post('fees')
  @ApiOperation({ summary: '[legado] Salva taxa geral (% + fixo)' })
  setFees(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { percentFee?: number; fixedFee?: number },
  ) {
    return this.finance.setLegacyFees(workspaceId, dto);
  }

  // ── Visão Geral financeira ────────────────────────────────────────────────

  @Get('finance/overview')
  @ApiOperation({ summary: 'Cards financeiros + série (vendas do sistema × gasto Meta)' })
  financeOverview(
    @Param('workspaceId') workspaceId: string,
    @Query('period') period: MarketingPeriod = 'last7',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.overview(workspaceId, resolvePeriod(period, from, to));
  }

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
  refreshAccounts(
    @Param('workspaceId') workspaceId: string,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.connections.refreshAdAccounts(workspaceId, connectionId);
  }

  @Post('meta/ad-accounts/:adAccountId/toggle')
  @ApiOperation({ summary: 'Liga/desliga uma conta de anúncio do sync (on/off)' })
  async toggle(
    @Param('workspaceId') workspaceId: string,
    @Param('adAccountId') adAccountId: string,
    @Body() dto: { active?: boolean },
  ) {
    const active = dto?.active !== false;
    const r = await this.connections.toggleAdAccount(workspaceId, adAccountId, active);
    if (active) await this.scheduler.kick(adAccountId).catch(() => {});
    return r;
  }

  // compat: alias antigo (seleção única) → liga a conta
  @Post('meta/ad-accounts/:adAccountId/select')
  @ApiOperation({ summary: '[legado] Liga a conta de anúncio' })
  async select(
    @Param('workspaceId') workspaceId: string,
    @Param('adAccountId') adAccountId: string,
  ) {
    const r = await this.connections.toggleAdAccount(workspaceId, adAccountId, true);
    await this.scheduler.kick(adAccountId).catch(() => {});
    return r;
  }

  @Delete('meta/connections/:connectionId')
  @ApiOperation({ summary: 'Desconecta um perfil do Facebook deste workspace' })
  disconnectOne(
    @Param('workspaceId') workspaceId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connections.disconnect(workspaceId, connectionId);
  }

  @Delete('meta/connection')
  @ApiOperation({ summary: 'Desconecta todos os perfis do Facebook deste workspace' })
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

  @Get('grid')
  @ApiOperation({ summary: 'Grid drill-down: contas / campanhas / conjuntos / criativos' })
  grid(
    @Param('workspaceId') workspaceId: string,
    @Query('level') level: GridLevel = 'campaigns',
    @Query('parentId') parentId?: string,
    @Query('period') period: MarketingPeriod = 'today',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '0',
    @Query('status') status: StatusFilter = 'any',
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir: SortDir = 'desc',
  ) {
    return this.gridSvc.grid(
      workspaceId, level, parentId, resolvePeriod(period, from, to),
      Number(page) || 0, status, sortBy, sortDir === 'asc' ? 'asc' : 'desc',
    );
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

  // ── Gestão de campanha (Fase 3 — write na Meta) ───────────────────────────

  @Post('campaigns/:campaignId/status')
  @ApiOperation({ summary: 'Ativa/pausa a campanha na Meta' })
  setCampaignStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: { active?: boolean },
    @CurrentUser('id') userId: string,
  ) {
    return this.campaignOps.setStatus(workspaceId, campaignId, dto?.active !== false, userId);
  }

  @Patch('campaigns/:campaignId')
  @ApiOperation({ summary: 'Edita nome / orçamento da campanha na Meta' })
  updateCampaign(
    @Param('workspaceId') workspaceId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: CampaignUpdateDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.campaignOps.update(workspaceId, campaignId, dto, userId);
  }
}
