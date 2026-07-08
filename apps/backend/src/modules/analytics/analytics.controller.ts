import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get analytics overview' })
  async getOverview(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getOverview(workspaceId, { startDate, endDate });
  }

  @Get('leads')
  @ApiOperation({ summary: 'Get leads analytics' })
  async getLeads(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getLeadsByDay(workspaceId, { startDate, endDate });
  }

  @Get('sales')
  @ApiOperation({ summary: 'Get sales analytics' })
  async getSales(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getSalesByDay(workspaceId, { startDate, endDate });
  }

  @Get('sources')
  @ApiOperation({ summary: 'Get sales by source' })
  async getSources(@Param('workspaceId') workspaceId: string) {
    return this.analyticsService.getSalesBySource(workspaceId);
  }
}
