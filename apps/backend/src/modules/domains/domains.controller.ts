import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Body, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { DomainsService } from './domains.service';

// ── Admin (protegido) ────────────────────────────────────────────────────────

@ApiTags('Domains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/domains')
export class AdminDomainsController {
  constructor(private readonly svc: DomainsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos os domínios' })
  findAll() { return this.svc.findAll(); }

  @Post()
  @ApiOperation({ summary: 'Cria novo domínio' })
  create(@Body('domain') domain: string) { return this.svc.create(domain); }

  @Put(':id')
  @ApiOperation({ summary: 'Edita domínio' })
  update(@Param('id') id: string, @Body('domain') domain: string) { return this.svc.update(id, domain); }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exclui domínio' })
  remove(@Param('id') id: string) { return this.svc.remove(id); }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Ativa domínio' })
  activate(@Param('id') id: string) { return this.svc.activate(id); }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desativa domínio' })
  deactivate(@Param('id') id: string) { return this.svc.deactivate(id); }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Define como domínio padrão' })
  setDefault(@Param('id') id: string) { return this.svc.setDefault(id); }

  @Patch(':id/toggle-picker')
  @ApiOperation({ summary: 'Oculta/exibe domínio na lista de novos redirecionadores' })
  togglePicker(@Param('id') id: string) { return this.svc.togglePicker(id); }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verifica propagação DNS do domínio' })
  verifyDns(@Param('id') id: string) { return this.svc.verifyDns(id); }

  @Get('server-info')
  @ApiOperation({ summary: 'Retorna IP do servidor para configuração DNS' })
  serverInfo() { return { serverIp: this.svc.getServerIp() }; }
}

// ── Público (usuários logados) ────────────────────────────────────────────────

@ApiTags('Domains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('domains')
export class PublicDomainsController {
  constructor(private readonly svc: DomainsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Lista domínios ativos para seleção pelo usuário' })
  findActive(@Query('workspaceId') workspaceId?: string) { return this.svc.findActive(workspaceId); }
}

// ── Workspace (domínio próprio de conta) ────────────────────────────────────

@ApiTags('Domains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/domains')
export class WorkspaceDomainsController {
  constructor(private readonly svc: DomainsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os domínios próprios dessa conta' })
  findAllOwn(@Param('workspaceId') workspaceId: string) { return this.svc.findAllOwn(workspaceId); }

  @Post()
  @ApiOperation({ summary: 'Cadastra um domínio próprio (máx. 3 por conta)' })
  createOwn(@Param('workspaceId') workspaceId: string, @Body('domain') domain: string) {
    return this.svc.createOwn(workspaceId, domain);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verifica DNS/SSL do domínio próprio' })
  verifyDnsOwn(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.svc.verifyDnsOwn(workspaceId, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exclui domínio próprio' })
  removeOwn(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.svc.removeOwn(workspaceId, id);
  }

  @Get('server-info')
  @ApiOperation({ summary: 'Retorna IP do servidor para configuração DNS' })
  serverInfo() { return { serverIp: this.svc.getServerIp() }; }
}
