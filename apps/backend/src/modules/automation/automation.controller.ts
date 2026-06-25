import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

  @Get('flows/:id')
  @ApiOperation({ summary: 'Get a single flow (fresh from DB)' })
  async findOneFlow(@Param('id') id: string) {
    return this.automationService.findOneFlow(id);
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
