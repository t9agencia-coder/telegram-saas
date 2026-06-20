import { Controller, Get, Patch, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KwaiAdsService } from './kwai-ads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateKwaiConfigDto } from './dto/update-kwai-config.dto';

@ApiTags('Kwai Ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/kwai')
export class KwaiAdsController {
  constructor(private readonly kwaiService: KwaiAdsService) {}

  @Get('config')
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.kwaiService.getConfig(workspaceId);
  }

  @Patch('config')
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateKwaiConfigDto,
  ) {
    return this.kwaiService.updateConfig(workspaceId, dto);
  }

  @Post('test')
  async test(@Param('workspaceId') workspaceId: string) {
    return this.kwaiService.testConnection(workspaceId);
  }
}
