import { Controller, Post, Body, Req, HttpCode, HttpStatus, NotImplementedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    // @ts-ignore
    const correlationId = req.correlationId || 'unknown';

    const user = await this.authService.register(dto, ip, userAgent, correlationId);
    return {
      message: 'Registration successful. Please check your email.',
      user
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    throw new NotImplementedException('Not implemented');
  }

  @Post('refresh')
  async refresh() {
    throw new NotImplementedException('Not implemented');
  }

  @Post('logout')
  async logout() {
    throw new NotImplementedException('Not implemented');
  }
}
