import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
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
}
