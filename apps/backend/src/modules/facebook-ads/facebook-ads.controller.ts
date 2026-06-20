import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FacebookAdsService } from './facebook-ads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateFacebookConfigDto } from './dto/update-facebook-config.dto';
import { SendFacebookEventDto } from './dto/send-facebook-event.dto';

@ApiTags('Facebook Ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/facebook')
export class FacebookAdsController {
  constructor(private readonly facebookService: FacebookAdsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get Facebook integration config' })
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.facebookService.getConfig(workspaceId);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update Facebook integration config' })
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateFacebookConfigDto,
  ) {
    return this.facebookService.updateConfig(workspaceId, dto);
  }

  @Post('test')
  @ApiOperation({ summary: 'Test Facebook integration' })
  async testEvent(@Param('workspaceId') workspaceId: string) {
    return this.facebookService.testConnection(workspaceId);
  }
}
