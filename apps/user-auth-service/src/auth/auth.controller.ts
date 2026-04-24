import { Controller, Post, NotImplementedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register() {
    throw new NotImplementedException('Not implemented');
  }

  @Post('login')
  async login() {
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
