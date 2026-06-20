import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBotDto {
  @ApiProperty({ example: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' })
  @IsString()
  botToken: string;
}
