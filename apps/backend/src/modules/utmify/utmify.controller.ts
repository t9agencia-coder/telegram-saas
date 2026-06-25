import { Controller, Get, Patch, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UtmifyService } from './utmify.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateUtmifyConfigDto, TestUtmifyDto } from './dto/update-utmify-config.dto';

@ApiTags('UTMify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/utmify')
export class UtmifyController {
  constructor(private readonly utmifyService: UtmifyService) {}

  // ── Legacy (mantidos para compatibilidade) ─────────────

  @Get('config')
  @ApiOperation({ summary: 'Get UTMify config (legacy)' })
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.utmifyService.getConfig(workspaceId);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update UTMify config (legacy)' })
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateUtmifyConfigDto,
  ) {
    return this.utmifyService.updateConfig(workspaceId, dto);
  }

  @Post('test')
  @ApiOperation({ summary: 'Test UTMify connection (legacy)' })
  async test(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: TestUtmifyDto,
  ) {
    return this.utmifyService.testConnection(workspaceId, dto);
  }

  // ── Multi-account ──────────────────────────────────────

  @Get('accounts')
  @ApiOperation({ summary: 'List UTMify accounts' })
  async listAccounts(@Param('workspaceId') workspaceId: string) {
    return this.utmifyService.listAccounts(workspaceId);
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Create UTMify account' })
  async createAccount(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: any,
  ) {
    return this.utmifyService.createAccount(workspaceId, dto);
  }

  @Patch('accounts/:accountId')
  @ApiOperation({ summary: 'Update UTMify account' })
  async updateAccount(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
    @Body() dto: any,
  ) {
    return this.utmifyService.updateAccount(workspaceId, accountId, dto);
  }

  @Delete('accounts/:accountId')
  @ApiOperation({ summary: 'Delete UTMify account' })
  async deleteAccount(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.utmifyService.deleteAccount(workspaceId, accountId);
  }

  @Post('accounts/:accountId/test')
  @ApiOperation({ summary: 'Test UTMify account connection' })
  async testAccount(
    @Param('workspaceId') workspaceId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.utmifyService.testAccountById(workspaceId, accountId);
  }
}
