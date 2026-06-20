import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PixConfigService } from './pix-config.service';
import { UpdatePixConfigDto } from './dto/update-pix-config.dto';

@ApiTags('PIX')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/pix')
export class PixController {
  constructor(private readonly pixConfigService: PixConfigService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get PIX gateway config' })
  async getConfig(@Param('workspaceId') workspaceId: string) {
    return this.pixConfigService.getConfig(workspaceId);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update PIX gateway config' })
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdatePixConfigDto,
  ) {
    return this.pixConfigService.updateConfig(workspaceId, dto);
  }
}
