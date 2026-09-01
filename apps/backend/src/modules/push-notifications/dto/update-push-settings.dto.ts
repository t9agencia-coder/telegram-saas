import { IsBoolean, IsOptional, IsArray, ArrayUnique, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WEBHOOK_EVENTS } from '../../webhook-dispatch/webhook-events';

export class UpdatePushSettingsDto {
  @ApiPropertyOptional({ description: 'Ativa/desativa notificações push pra este workspace' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Eventos habilitados', enum: WEBHOOK_EVENTS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  @IsOptional()
  enabledEvents?: string[];
}
