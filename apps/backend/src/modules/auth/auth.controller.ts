import { Controller, Post, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { getClientIp } from '../../common/utils/request-ip';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { TwoFactorSetupConfirmDto } from './dto/two-factor-setup-confirm.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new user (requires captcha + e-mail verification)' })
  @ApiResponse({ status: 201, description: 'User created, verification code sent' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, getClientIp(req));
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm the 6-digit code sent by e-mail and log the user in' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend the e-mail verification code (60s cooldown)' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationCode(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, getClientIp(req));
  }

  @Post('2fa/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirma o código TOTP de uma conta ADMIN com 2FA já habilitado' })
  async verifyTwoFactor(@Body() dto: TwoFactorVerifyDto, @Req() req: Request) {
    return this.authService.verifyTwoFactor(dto.verifyToken, dto.code, getClientIp(req));
  }

  @Post('2fa/setup-confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirma o primeiro código TOTP e habilita 2FA na conta ADMIN' })
  async confirmTwoFactorSetup(@Body() dto: TwoFactorSetupConfirmDto, @Req() req: Request) {
    return this.authService.confirmTwoFactorSetup(dto.setupToken, dto.code, getClientIp(req));
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('impersonate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Troca token de impersonation por JWT (uso único, 24h)' })
  async impersonate(@Body('token') token: string) {
    return this.authService.exchangeImpersonationToken(token);
  }
}
