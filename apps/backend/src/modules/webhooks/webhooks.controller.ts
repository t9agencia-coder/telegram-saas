import { Controller, Post, Param, Body, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('telegram/:workspaceId')
  @Public()
  @ApiOperation({ summary: 'Telegram bot webhook' })
  async telegramWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
  ) {
    return this.webhooksService.processTelegramWebhook(workspaceId, body);
  }

  @Post('pix/:workspaceId')
  @Public()
  @ApiOperation({ summary: 'PIX payment webhook' })
  async pixWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Headers('x-webhook-signature') signature: string,
  ) {
    return this.webhooksService.processPixWebhook(workspaceId, body, signature);
  }

  @Post('utmify/:workspaceId')
  @Public()
  @ApiOperation({ summary: 'UTMify webhook' })
  async utmifyWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
  ) {
    return this.webhooksService.processUtmifyWebhook(workspaceId, body);
  }
}
