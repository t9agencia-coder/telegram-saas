import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorVerifyDto {
  @ApiProperty({ description: 'Ticket de curta duração retornado pelo /auth/login' })
  @IsString()
  verifyToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}
