import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WarmMediaDto {
  @ApiProperty({ enum: ['photo', 'video'] })
  @IsIn(['photo', 'video'])
  type: 'photo' | 'video';

  @ApiPropertyOptional({ description: 'URL pública do arquivo (alternativa a fileData)' })
  @IsString()
  @IsOptional()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Arquivo em base64/data URI (alternativa a fileUrl)' })
  @IsString()
  @IsOptional()
  fileData?: string;
}
