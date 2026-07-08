import { Controller, Get, Patch, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KwaiAdsService } from './kwai-ads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { UpdateKwaiConfigDto } from './dto/update-kwai-config.dto';

@ApiTags('Kwai Ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/kwai')
export class KwaiAdsController {
  constructor(private readonly kwaiService: KwaiAdsService) {}

  // ── Legacy (mantidos para compatibilidade) ─────────────

  @Get('config')
  @ApiOperation({ summary: 'Get Kwai config (legacy)' })
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.kwaiService.getConfig(workspaceId);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update Kwai config (legacy)' })
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateKwaiConfigDto,
  ) {
    return this.kwaiService.updateConfig(workspaceId, dto);
  }

  @Post('test')
  @ApiOperation({ summary: 'Test Kwai connection (legacy)' })
  async test(@Param('workspaceId') workspaceId: string) {
    return this.kwaiService.testConnection(workspaceId);
  }

  // ── Multi-conta ──────────────────────────────────────

  @Get('accounts')
  @ApiOperation({ summary: 'List Kwai accounts' })
  async listAccounts(@Param('workspaceId') workspaceId: string) {
    return this.kwaiService.listAccounts(workspaceId);
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Create Kwai account' })
  async createAccount(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: any,
  ) {
    return this.kwaiService.createAccount(workspaceId, dto);
  }

  @Patch('accounts/:accountId')
  @ApiOperation({ summary: 'Update Kwai account' })
  async updateAccount(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
    @Body() dto: any,
  ) {
    return this.kwaiService.updateAccount(workspaceId, accountId, dto);
  }

  @Delete('accounts/:accountId')
  @ApiOperation({ summary: 'Delete Kwai account' })
  async deleteAccount(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.kwaiService.deleteAccount(workspaceId, accountId);
  }

  @Post('accounts/:accountId/test')
  @ApiOperation({ summary: 'Test Kwai account connection' })
  async testAccount(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.kwaiService.testAccountById(workspaceId, accountId);
  }
}
