import {
  Controller, Get, Put, Post, Body, Param,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { PushNotificationsService } from './push-notifications.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UpdatePushSettingsDto } from './dto/update-push-settings.dto';

@ApiTags('Push Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/push')
export class PushNotificationsController {
  constructor(private readonly service: PushNotificationsService) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Chave pública VAPID (usada pra criar a subscription no navegador)' })
  async getVapidPublicKey() {
    return { publicKey: await this.service.getVapidPublicKey() };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Registra (ou atualiza) a assinatura de push deste navegador' })
  subscribe(@Param('workspaceId') workspaceId: string, @Body() dto: SubscribePushDto) {
    return this.service.subscribe(workspaceId, dto);
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'Remove a assinatura de push deste navegador' })
  unsubscribe(@Param('workspaceId') workspaceId: string, @Body('endpoint') endpoint: string) {
    return this.service.unsubscribe(workspaceId, endpoint);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Preferências de notificação do workspace' })
  getSettings(@Param('workspaceId') workspaceId: string) {
    return this.service.getSettings(workspaceId);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Atualiza preferências de notificação' })
  updateSettings(@Param('workspaceId') workspaceId: string, @Body() dto: UpdatePushSettingsDto) {
    return this.service.updateSettings(workspaceId, dto);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envia uma notificação de teste pra todos os dispositivos do workspace' })
  testPush(@Param('workspaceId') workspaceId: string) {
    return this.service.testPush(workspaceId);
  }
}
