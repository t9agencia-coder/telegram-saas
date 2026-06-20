import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBotDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  botToken?: string;
}
