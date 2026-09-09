import { IsIn, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Fase 6 — registro do dispositivo mobile (token FCM) pra push de venda.
export class RegisterDeviceDto {
  @ApiProperty({ description: 'Token FCM do dispositivo' })
  @IsString()
  @MinLength(10)
  token: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: string;
}
