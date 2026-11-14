import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContencaoService } from './contencao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';

/**
 * Rotas novas, em controller próprio: nenhuma rota existente é tocada, então
 * não há como esta feature quebrar o que já está no ar.
 */
@ApiTags('Contenção')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/contencao')
export class ContencaoController {
  constructor(private readonly contencao: ContencaoService) {}

  @Get()
  @ApiOperation({ summary: 'Fila de bots de cada fluxo do workspace' })
  async listar(@Param('workspaceId') workspaceId: string) {
    return this.contencao.listar(workspaceId);
  }

  @Get('saude-da-sonda')
  @ApiOperation({ summary: 'A sonda que detecta bot caído está rodando?' })
  async saudeDaSonda() {
    return this.contencao.saudeDaSonda();
  }

  @Get('bots-disponiveis')
  @ApiOperation({ summary: 'Bots que ainda podem entrar numa fila' })
  async botsDisponiveis(@Param('workspaceId') workspaceId: string) {
    return this.contencao.botsDisponiveis(workspaceId);
  }

  @Post('flows/:flowId')
  @ApiOperation({ summary: 'Adiciona um bot ao fim da fila e já manda aquecer' })
  async adicionar(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body('botId') botId: string,
  ) {
    return this.contencao.adicionar(workspaceId, flowId, botId);
  }

  @Patch('flows/:flowId')
  @ApiOperation({ summary: 'Reordena a fila (arrastar e soltar)' })
  async reordenar(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body('ordem') ordem: string[],
  ) {
    return this.contencao.reordenar(workspaceId, flowId, ordem || []);
  }

  @Delete('flows/:flowId/:botId')
  @ApiOperation({ summary: 'Tira um bot da fila' })
  async remover(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Param('botId') botId: string,
  ) {
    return this.contencao.remover(workspaceId, flowId, botId);
  }
}
