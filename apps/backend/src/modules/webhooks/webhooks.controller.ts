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

  @Post('pixzypay')
  @Public()
  @ApiOperation({ summary: 'PixzyPay global webhook (sem workspaceId)' })
  async pixzypayWebhook(
    @Body() body: any,
  ) {
    return this.webhooksService.processPixWebhook('', body, '');
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

  @Post('qrcodes/pix')
  @Public()
  @ApiOperation({ summary: 'QRCodes (Sulcredi) webhook — formato BCB padrão (com /pix)' })
  async qrcodesWebhook(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body);
  }

  @Post('qrcodes')
  @Public()
  @ApiOperation({ summary: 'QRCodes (Sulcredi) webhook — URL base sem /pix' })
  async qrcodesWebhookBase(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body);
  }

  @Post('qrcodes2/pix')
  @Public()
  @ApiOperation({ summary: 'BaassPago Cliconbr 2 webhook — formato BCB padrão (com /pix)' })
  async qrcodes2Webhook(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body, '[QRCodes2]');
  }

  @Post('qrcodes2')
  @Public()
  @ApiOperation({ summary: 'BaassPago Cliconbr 2 webhook — URL base sem /pix' })
  async qrcodes2WebhookBase(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body, '[QRCodes2]');
  }
}
