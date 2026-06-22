import { IsString, IsOptional, IsArray, IsBoolean, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFlowDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  botId?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  nodes?: any[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  edges?: any[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  trigger?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  config?: Record<string, any>;
}
