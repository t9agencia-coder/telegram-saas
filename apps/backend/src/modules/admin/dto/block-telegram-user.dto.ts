import { IsString, Matches, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BlockTelegramUserDto {
  @ApiProperty({ description: 'Telegram User ID numérico (from.id) — nunca username' })
  @IsString()
  @Matches(/^\d+$/, { message: 'telegramId deve ser o ID numérico do Telegram, não o username' })
  telegramId: string;

  @ApiPropertyOptional({ description: 'Motivo do bloqueio (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
