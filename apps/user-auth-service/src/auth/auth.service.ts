import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async register() {
    this.logger.log('Register method hit');
    return { message: 'Not implemented' };
  }

  async login() {
    this.logger.log('Login method hit');
    return { message: 'Not implemented' };
  }

  async refreshToken() {
    this.logger.log('Refresh token method hit');
    return { message: 'Not implemented' };
  }

  async logout() {
    this.logger.log('Logout method hit');
    return { message: 'Not implemented' };
  }
}
