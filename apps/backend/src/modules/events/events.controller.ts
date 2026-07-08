import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List events by workspace, optionally filtered by eventName' })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('eventName') eventName?: string,
    @Query('take') take?: string,
  ) {
    return this.eventsService.findByWorkspace(workspaceId, eventName, take ? parseInt(take, 10) : 50);
  }
}
