import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { MetaOAuthService } from '../integrations/meta/meta-oauth.service';
import { MetaConnectionService } from '../services/meta-connection.service';

/**
 * Callback do OAuth da Meta — chamado pelo navegador do usuário (sem JWT).
 * O workspace vem assinado no `state`. Fora do prefixo /workspaces/:id.
 */
@ApiTags('Tracking / Meta OAuth')
@Controller('tracking/meta/oauth')
export class MetaOAuthController {
  private readonly logger = new Logger(MetaOAuthController.name);

  constructor(
    private readonly oauth: MetaOAuthService,
    private readonly connections: MetaConnectionService,
  ) {}

  @Public()
  @Get('callback')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Callback OAuth da Meta' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const front = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const back = `${front}/dashboard/tracking/integracoes`;

    if (error) {
      this.logger.warn(`[Meta OAuth] recusado: ${error} — ${errorDescription}`);
      return res.redirect(`${back}?meta=denied`);
    }

    try {
      const workspaceId = this.oauth.verifyState(state);
      await this.oauth.handleCallback(code, workspaceId);
      await this.connections.refreshAdAccounts(workspaceId).catch((e) =>
        this.logger.warn(`[Meta OAuth] refreshAdAccounts falhou: ${e.message}`),
      );
      return res.redirect(`${back}?meta=connected`);
    } catch (err: any) {
      this.logger.error(`[Meta OAuth] callback falhou: ${err.message}`);
      return res.redirect(`${back}?meta=error`);
    }
  }
}
