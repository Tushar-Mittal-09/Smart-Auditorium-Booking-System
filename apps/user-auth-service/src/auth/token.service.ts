import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../entities';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  tokenVersion: number;
  jti: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(user: User): string {
    const roles = user.roles ? user.roles.map((r) => r.name) : [];
    const permissionsSet = new Set<string>();
    
    if (user.roles) {
      user.roles.forEach((role) => {
        if (role.permissions) {
          role.permissions.forEach((p) => permissionsSet.add(p.name));
        }
      });
    }

    const payload: AccessTokenPayload = {
      userId: user.id,
      email: user.email,
      roles: roles,
      permissions: Array.from(permissionsSet),
      tokenVersion: user.token_version,
      jti: uuidv4(),
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m') as any,
    });
  }

  generateRefreshToken(user: User, sessionId: string): string {
    const payload: RefreshTokenPayload = {
      userId: user.id,
      sessionId,
      tokenVersion: user.token_version,
      jti: uuidv4(),
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d') as any,
    });
  }

  generateTokenPair(user: User, sessionId: string) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user, sessionId),
      expiresIn: 900 // 15 minutes in seconds
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });
  }

  /**
   * Generate a short-lived temp token for MFA verification flow.
   * Contains only userId — no session/roles until MFA is confirmed (Plan 2.5).
   */
  generateMfaTempToken(user: User): string {
    return this.jwtService.sign(
      { userId: user.id, type: 'mfa_temp', jti: uuidv4() },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '5m',
      },
    );
  }
}
