import { IsBoolean, IsOptional, IsString, IsArray, ArrayUnique, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WEBHOOK_EVENTS } from '../webhook-events';

export class UpdateWebhookSettingsDto {
  @ApiPropertyOptional({ description: 'Ativa/desativa o envio de webhooks' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'URL de destino do webhook (http/https)' })
  @IsString()
  @IsOptional()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ description: 'Secret opcional enviado no header X-Webhook-Secret. Omitir = manter; string vazia = remover.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  secret?: string;

  @ApiPropertyOptional({ description: 'Eventos habilitados', enum: WEBHOOK_EVENTS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  @IsOptional()
  enabledEvents?: string[];
}
