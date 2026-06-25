import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateKwaiConfigDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pixelId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  testToken?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  eventAddToCart?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  eventPurchase?: boolean;
}
