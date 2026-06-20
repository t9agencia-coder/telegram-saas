import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspaces for current user' })
  async findAll(@CurrentUser() user) {
    return this.workspacesService.findAllByUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user) {
    return this.workspacesService.findById(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  async create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user) {
    return this.workspacesService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workspace' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto, @CurrentUser() user) {
    return this.workspacesService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace' })
  async remove(@Param('id') id: string, @CurrentUser() user) {
    return this.workspacesService.remove(id, user.id);
  }
}
