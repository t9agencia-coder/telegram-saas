import { IsIP, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BlockIpDto {
  @ApiProperty({ description: 'Endereço IP (IPv4 ou IPv6) a bloquear' })
  @IsIP()
  ip: string;

  @ApiPropertyOptional({ description: 'Motivo do bloqueio (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
