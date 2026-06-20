import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'My Business' })
  @IsString()
  @MinLength(2)
  name: string;
}
