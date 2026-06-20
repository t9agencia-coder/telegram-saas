import { IsString, IsNumber, IsOptional, MinLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Curso de Marketing Digital' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 197.90 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;
}
