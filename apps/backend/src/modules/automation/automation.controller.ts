import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';

@ApiTags('Automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('flows')
  @ApiOperation({ summary: 'List all flows' })
  async findAllFlows(@Param('workspaceId') workspaceId: string) {
    return this.automationService.findAllFlows(workspaceId);
  }

  @Get('flows/remarketing-summary')
  @ApiOperation({ summary: 'Remarketing summary for all flows in workspace' })
  async getRemarketingSummary(@Param('workspaceId') workspaceId: string) {
    return this.automationService.getRemarketingSummary(workspaceId);
  }

  @Get('flows/:id')
  @ApiOperation({ summary: 'Get a single flow (fresh from DB)' })
  async findOneFlow(@Param('id') id: string) {
    return this.automationService.findOneFlow(id);
  }

  @Get('flows/:flowId/media-preview')
  @ApiOperation({ summary: 'Resolve o file_id cacheado do Telegram em bytes de mídia (fallback pra fluxos antigos sem fileData/fileUrl)' })
  async getMediaPreview(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Query('key') key: string,
    @Res() res: Response,
  ) {
    await this.automationService.streamMediaPreview(workspaceId, flowId, key, res);
  }

  @Post('flows')
  @ApiOperation({ summary: 'Create a flow' })
  async createFlow(@Param('workspaceId') workspaceId: string, @Body() dto: CreateFlowDto) {
    return this.automationService.createFlow(workspaceId, dto);
  }

  @Patch('flows/:id')
  @ApiOperation({ summary: 'Update a flow' })
  async updateFlow(@Param('id') id: string, @Body() dto: UpdateFlowDto) {
    return this.automationService.updateFlow(id, dto);
  }

  @Delete('flows/:id')
  @ApiOperation({ summary: 'Delete a flow' })
  async deleteFlow(@Param('id') id: string) {
    return this.automationService.deleteFlow(id);
  }

  @Post('flows/:id/activate')
  @ApiOperation({ summary: 'Activate a flow' })
  async activateFlow(@Param('id') id: string) {
    return this.automationService.activateFlow(id);
  }

  @Post('flows/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a flow' })
  async deactivateFlow(@Param('id') id: string) {
    return this.automationService.deactivateFlow(id);
  }

  @Post('flows/:id/duplicate')
  @ApiOperation({ summary: 'Duplicate a flow' })
  async duplicateFlow(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() body: { botId?: string },
  ) {
    return this.automationService.duplicateFlow(workspaceId, id, body.botId);
  }
}
