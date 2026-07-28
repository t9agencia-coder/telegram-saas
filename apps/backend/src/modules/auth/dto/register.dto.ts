import { IsString, IsEmail, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Aceita only-digits com DDD (10 ou 11 dígitos: fixo ou celular) — a máscara
// visual fica só no frontend, o backend valida o número "limpo".
const WHATSAPP_REGEX = /^\d{10,11}$/;

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secure123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '11999999999', description: 'DDD + número, apenas dígitos' })
  @IsString()
  @Matches(WHATSAPP_REGEX, { message: 'Informe um número de WhatsApp válido com DDD.' })
  whatsapp: string;

  // Opcional pra não quebrar o cadastro antes do RECAPTCHA_SECRET_KEY ser configurado
  // (RecaptchaService.verify faz fail-open enquanto a secret não existir).
  @ApiPropertyOptional({ example: '03AGdBq27...' })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
