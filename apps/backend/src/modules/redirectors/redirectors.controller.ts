import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  Ip,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RedirectorsService } from './redirectors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import {
  CreateRedirectorDto,
  UpdateRedirectorDto,
  ResolveRedirectorDto,
} from './dto/create-redirector.dto';

// ── Protected CRUD ─────────────────────────────────────────────────────────────

@ApiTags('Redirectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/redirectors')
export class RedirectorsController {
  constructor(private readonly svc: RedirectorsService) {}

  @Get()
  @ApiOperation({ summary: 'List all redirectors for a workspace' })
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.svc.findAll(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single redirector with click history' })
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.svc.findOne(workspaceId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a redirector' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateRedirectorDto,
  ) {
    return this.svc.create(workspaceId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a redirector' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRedirectorDto,
  ) {
    return this.svc.update(workspaceId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a redirector' })
  remove(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.svc.remove(workspaceId, id);
  }
}

// ── Public resolve (no auth) ───────────────────────────────────────────────────

@ApiTags('Redirectors')
@Controller('redirectors')
export class PublicRedirectorsController {
  constructor(private readonly svc: RedirectorsService) {}

  @Post('resolve/:slug')
  @ApiOperation({ summary: 'Resolve redirect destination (public)' })
  resolve(
    @Param('slug') slug: string,
    @Body() dto: ResolveRedirectorDto,
  ) {
    return this.svc.resolve(slug, dto);
  }
}
