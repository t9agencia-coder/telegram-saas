import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secure123' })
  @IsString()
  password: string;

  // Opcional pra não quebrar o login antes do RECAPTCHA_SECRET_KEY ser configurado
  // (RecaptchaService.verify faz fail-open enquanto a secret não existir).
  @ApiPropertyOptional({ example: '03AGdBq27...' })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
