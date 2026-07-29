import {
  Controller, Get, Put, Post, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { WebhookDispatchService } from './webhook-dispatch.service';
import { UpdateWebhookSettingsDto } from './dto/update-webhook-settings.dto';

@ApiTags('Webhooks (saída)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/webhook')
export class WebhookDispatchController {
  constructor(private readonly service: WebhookDispatchService) {}

  @Get()
  @ApiOperation({ summary: 'Configuração de webhook de saída do workspace' })
  getSettings(@Param('workspaceId') workspaceId: string) {
    return this.service.getSettings(workspaceId);
  }

  @Put()
  @ApiOperation({ summary: 'Salva a configuração de webhook de saída' })
  updateSettings(@Param('workspaceId') workspaceId: string, @Body() dto: UpdateWebhookSettingsDto) {
    return this.service.updateSettings(workspaceId, dto);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Histórico de envios de webhook' })
  listLogs(
    @Param('workspaceId') workspaceId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.listLogs(workspaceId, page, limit);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envia um webhook de teste (síncrono)' })
  testWebhook(@Param('workspaceId') workspaceId: string) {
    return this.service.testWebhook(workspaceId);
  }

  @Post('logs/:logId/resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reenvia um evento já registrado' })
  resend(@Param('workspaceId') workspaceId: string, @Param('logId') logId: string) {
    return this.service.resendLog(workspaceId, logId);
  }
}
