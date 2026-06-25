import { IsString, IsOptional, IsInt, IsBoolean, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAcquirerDto {
  @ApiProperty({ example: 'Podpay' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'podpay', description: 'Slug único que mapeia para o handler' })
  @IsString()
  slug: string;

  @ApiProperty({ description: 'API Key do adquirente (será criptografada)' })
  @IsString()
  apiKey: string;

  @ApiPropertyOptional({ description: 'API Secret (se exigido pelo adquirente)' })
  @IsString()
  @IsOptional()
  apiSecret?: string;

  @ApiPropertyOptional({ description: 'Endpoint customizado para criar PIX (opcional para adquirentes conhecidos)' })
  @IsString()
  @IsOptional()
  endpointCreatePix?: string;

  @ApiPropertyOptional({ description: 'Endpoint customizado para consultar PIX (opcional para adquirentes conhecidos)' })
  @IsString()
  @IsOptional()
  endpointCheckPix?: string;

  @ApiPropertyOptional({ description: 'Secret para validação de webhooks' })
  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @ApiPropertyOptional({ enum: ['production', 'sandbox'], default: 'production' })
  @IsString()
  @IsIn(['production', 'sandbox'])
  @IsOptional()
  environment?: string;

  @ApiPropertyOptional({ description: 'URL do logo do adquirente' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
