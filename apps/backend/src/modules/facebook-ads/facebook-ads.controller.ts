import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FacebookAdsService } from './facebook-ads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { UpdateFacebookConfigDto, TestFacebookConnectionDto } from './dto/update-facebook-config.dto';

@ApiTags('Facebook Ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/facebook')
export class FacebookAdsController {
  constructor(private readonly facebookService: FacebookAdsService) {}

  // ── Legacy (compatibilidade) ───────────────────────────────────────────────

  @Get('config')
  @ApiOperation({ summary: 'Get Facebook integration config (legacy)' })
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.facebookService.getConfig(workspaceId);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update Facebook integration config (legacy)' })
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateFacebookConfigDto,
  ) {
    return this.facebookService.updateConfig(workspaceId, dto);
  }

  @Post('test')
  @ApiOperation({ summary: 'Test Facebook CAPI connection (legacy)' })
  async testConnection(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: TestFacebookConnectionDto,
  ) {
    return this.facebookService.testConnection(workspaceId, dto);
  }

  // ── Multi-pixel endpoints ─────────────────────────────────────────────────

  @Get('pixels')
  @ApiOperation({ summary: 'Listar pixels do Facebook' })
  async listPixels(@Param('workspaceId') workspaceId: string) {
    return this.facebookService.listPixels(workspaceId);
  }

  @Post('pixels')
  @ApiOperation({ summary: 'Adicionar pixel do Facebook (máx 5)' })
  async createPixel(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: any,
  ) {
    return this.facebookService.createPixel(workspaceId, dto);
  }

  @Patch('pixels/:pixelId')
  @ApiOperation({ summary: 'Atualizar pixel do Facebook' })
  async updatePixel(
    @Param('workspaceId') workspaceId: string,
    @Param('pixelId') pixelId: string,
    @Body() dto: any,
  ) {
    return this.facebookService.updatePixel(workspaceId, pixelId, dto);
  }

  @Delete('pixels/:pixelId')
  @ApiOperation({ summary: 'Remover pixel do Facebook' })
  async deletePixel(
    @Param('workspaceId') workspaceId: string,
    @Param('pixelId') pixelId: string,
  ) {
    return this.facebookService.deletePixel(workspaceId, pixelId);
  }

  @Post('pixels/:pixelId/test')
  @ApiOperation({ summary: 'Testar conexão de um pixel específico' })
  async testPixel(
    @Param('workspaceId') workspaceId: string,
    @Param('pixelId') pixelId: string,
    @Body() dto: any,
  ) {
    return this.facebookService.testPixelById(workspaceId, pixelId, dto);
  }
}
