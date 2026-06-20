import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateKwaiConfigDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  advertiserId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
