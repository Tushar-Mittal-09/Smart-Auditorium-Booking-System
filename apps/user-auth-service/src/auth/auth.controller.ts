import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, DeviceInfo } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    // @ts-expect-error correlationId injected by middleware
    const correlationId = req.correlationId || 'unknown';

    const user = await this.authService.register(dto, ip, userAgent, correlationId);
    return {
      message: 'Registration successful. Please check your email.',
      user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const device = this.extractDeviceInfo(req);
    return this.authService.login(dto, device);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const device = this.extractDeviceInfo(req);
    return this.authService.refreshToken(dto.refreshToken, device);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Headers('authorization') authHeader: string,
    @Body('sessionId') sessionId: string | undefined,
    @Req() req: Request,
  ) {
    const accessToken = this.extractBearerToken(authHeader);
    const device = this.extractDeviceInfo(req);

    if (sessionId) {
      return this.authService.logoutSession(accessToken, sessionId, device);
    }
    return this.authService.logout(accessToken, device);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Headers('authorization') authHeader: string,
    @Req() req: Request,
  ) {
    const accessToken = this.extractBearerToken(authHeader);
    const device = this.extractDeviceInfo(req);
    return this.authService.logoutAll(accessToken, device);
  }

  // ── Helpers ────────────────────────────────────

  private extractDeviceInfo(req: Request): DeviceInfo {
    return {
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      // @ts-expect-error correlationId injected by middleware
      correlationId: req.correlationId || undefined,
    };
  }

  private extractBearerToken(authHeader: string): string {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or malformed Authorization header');
    }
    return authHeader.slice(7);
  }
}
