import { IsString, IsNotEmpty, IsOptional, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PushSubscriptionKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SubscribePushDto {
  @ApiProperty({ description: 'URL do endpoint de push gerado pelo navegador (PushSubscription.endpoint)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  userAgent?: string;
}
