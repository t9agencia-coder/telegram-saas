import { Controller, Post, Param, Body, Headers, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
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
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ) {
    // Confirma que a requisição veio mesmo do Telegram (secret_token configurado
    // em setWebhook, ver telegram-bots.service.ts) — sem isso, qualquer pessoa que
    // descobrisse o botId podia simular clique/mensagem sem nunca ter usado o bot.
    // Bots registrados antes dessa mudança ainda não têm o secret_token configurado
    // no lado do Telegram (só reregistrando o webhook aplica) — TELEGRAM_WEBHOOK_SECRET
    // ausente mantém o comportamento antigo (sem checagem) até todos migrarem.
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid secret token');
    }
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

  @Post('qrcodes3/pix')
  @Public()
  @ApiOperation({ summary: 'BaassPago Cliconbr 3 webhook — formato BCB padrão (com /pix)' })
  async qrcodes3Webhook(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body, '[QRCodes3]');
  }

  @Post('qrcodes3')
  @Public()
  @ApiOperation({ summary: 'BaassPago Cliconbr 3 webhook — URL base sem /pix' })
  async qrcodes3WebhookBase(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body, '[QRCodes3]');
  }

  @Post('goldrex/pix')
  @Public()
  @ApiOperation({ summary: 'Goldrex webhook — formato BCB padrão (com /pix)' })
  async goldrexWebhook(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body, '[Goldrex]');
  }

  @Post('goldrex')
  @Public()
  @ApiOperation({ summary: 'Goldrex webhook — URL base sem /pix' })
  async goldrexWebhookBase(@Body() body: any) {
    return this.webhooksService.processQRCodesWebhook(body, '[Goldrex]');
  }

  @Post('nowbanks')
  @Public()
  @ApiOperation({ summary: 'Now Banks webhook (deposit.updated / withdraw.updated / med.retained)' })
  async nowbanksWebhook(
    @Body() body: any,
    @Headers('x-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    return this.webhooksService.processNowBanksWebhook(body, req.rawBody, signature);
  }

  @Post('velana/:workspaceId')
  @Public()
  @ApiOperation({ summary: 'Velana webhook (postback de transação)' })
  async velanaWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
  ) {
    return this.webhooksService.processVelanaWebhook(workspaceId, body);
  }

  @Post('mercadopago')
  @Public()
  @ApiOperation({ summary: 'Mercado Pago webhook (Orders API)' })
  async mercadoPagoWebhook(
    @Body() body: any,
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
  ) {
    return this.webhooksService.processMercadoPagoWebhook(body, signature, requestId);
  }

  @Post('woovi')
  @Public()
  @ApiOperation({ summary: 'Woovi/OpenPix webhook (CHARGE_COMPLETED / CHARGE_EXPIRED)' })
  async wooviWebhook(
    @Body() body: any,
    @Headers('authorization') authorization: string,
  ) {
    return this.webhooksService.processWooviWebhook(body, authorization);
  }

  @Post('pagarme')
  @Public()
  @ApiOperation({ summary: 'Pagar.me webhook (charge.paid / charge.payment_failed)' })
  async pagarmeWebhook(
    @Body() body: any,
    @Headers('authorization') authorization: string,
  ) {
    return this.webhooksService.processPagarmeWebhook(body, authorization);
  }
}
