import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFlowDto {
  @ApiProperty({ example: 'Welcome Flow' })
  @IsString()
  name: string;

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

  @ApiPropertyOptional({ default: 'start' })
  @IsString()
  @IsOptional()
  trigger?: string;
}
