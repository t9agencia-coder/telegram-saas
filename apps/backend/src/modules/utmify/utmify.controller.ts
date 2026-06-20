import { Controller, Get, Patch, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UtmifyService } from './utmify.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateUtmifyConfigDto } from './dto/update-utmify-config.dto';

@ApiTags('UTMify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/utmify')
export class UtmifyController {
  constructor(private readonly utmifyService: UtmifyService) {}

  @Get('config')
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.utmifyService.getConfig(workspaceId);
  }

  @Patch('config')
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateUtmifyConfigDto,
  ) {
    return this.utmifyService.updateConfig(workspaceId, dto);
  }

  @Post('test')
  async test(@Param('workspaceId') workspaceId: string) {
    return this.utmifyService.testConnection(workspaceId);
  }
}
