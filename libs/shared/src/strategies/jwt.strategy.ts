import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { IAuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any): Promise<IAuthUser> {
    // 1. Check Redis blacklist by jti
    if (payload.jti) {
      const isBlacklisted = await this.redisService.exists(`blacklist:${payload.jti}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    // 2. tokenVersion check — fetch CURRENT user.token_version from DB via DataSource
    // Using raw query to avoid depending on User entity which lives in the app
    const users = await this.dataSource.query(
      'SELECT id, token_version, is_active, deleted_at FROM users WHERE id = $1',
      [payload.userId]
    );

    const user = users && users.length > 0 ? users[0] : null;

    if (!user || !user.is_active || user.deleted_at) {
      throw new UnauthorizedException('User account is inactive');
    }

    if (payload.tokenVersion < user.token_version) {
      throw new UnauthorizedException('Token version outdated — please re-login');
    }

    // 3. Return the auth user object
    return {
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles || [],
      permissions: payload.permissions || [],
      tokenVersion: payload.tokenVersion,
    };
  }
}
