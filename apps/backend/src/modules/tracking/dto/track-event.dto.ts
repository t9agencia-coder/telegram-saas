import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackEventDto {
  @ApiProperty({ example: 'TG_A8F9B2D4' })
  @IsString()
  leadUid: string;

  @ApiProperty()
  @IsString()
  workspaceId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  event?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ip?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utmSource?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utmMedium?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utmCampaign?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utmContent?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  utmTerm?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fbclid?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  gclid?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ttclid?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  kwaiClickid?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
