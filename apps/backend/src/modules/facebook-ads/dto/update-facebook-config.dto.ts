import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFacebookConfigDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pixelId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
