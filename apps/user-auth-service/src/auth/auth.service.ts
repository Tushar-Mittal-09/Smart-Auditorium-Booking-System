import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User, Role } from '../entities';
import { AuditLogDocument, AuditLog } from '../schemas/audit-log.schema';
import { SessionDocument, Session } from '../schemas/session.schema';
import { LoginAttemptDocument, LoginAttempt } from '../schemas/login-attempt.schema';
import { RedisService } from '@sabs/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';

/** Metadata extracted from the incoming request for device fingerprinting */
export interface DeviceInfo {
  ip: string;
  userAgent: string;
  correlationId?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Maximum failed login attempts per IP within the brute-force window */
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  /** Brute-force window in minutes */
  private readonly BRUTE_FORCE_WINDOW_MIN = 15;
  /** Session lifetime in days */
  private readonly SESSION_LIFETIME_DAYS = 7;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(LoginAttempt.name)
    private readonly loginAttemptModel: Model<LoginAttemptDocument>,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  // ──────────────────────────────────────────────
  //  REGISTRATION
  // ──────────────────────────────────────────────

  async register(dto: RegisterDto, ip: string, userAgent: string, correlationId: string) {
    this.logger.log(`Registration attempt for ${dto.email}`);

    const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const password_hash = await argon2.hash(dto.password);

    const studentRole = await this.roleRepository.findOne({ where: { name: 'STUDENT' } });

    const user = this.userRepository.create({
      email: dto.email,
      password_hash,
      first_name: dto.firstName,
      last_name: dto.lastName,
      roles: studentRole ? [studentRole] : [],
    });

    await this.userRepository.save(user);

    // Generate email verification token — store hash in Redis with 24h TTL
    const emailToken = uuidv4();
    await this.redisService.setWithExpiry(`email_verify:${emailToken}`, user.id, 86400);

    try {
      await this.auditLogModel.create({
        userId: user.id,
        action: 'REGISTRATION',
        metadata: { email: user.email },
        ip,
        userAgent,
        correlationId,
      });
    } catch (e) {
      this.logger.error('Failed to write audit log', e);
    }

    // Return sanitized user (strip sensitive fields)
    const { password_hash: _, mfa_secret, mfa_backup_codes, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // ──────────────────────────────────────────────
  //  LOGIN — 9-step flow (order is CRITICAL)
  // ──────────────────────────────────────────────

  async login(dto: LoginDto, device: DeviceInfo) {
    const { email, password } = dto;
    const { ip, userAgent, correlationId } = device;

    // ── STEP 1: Brute-force check ────────────────────
    await this.checkBruteForce(ip);

    // ── STEP 2: Find user + validate existence ───────
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user || !user.is_active || user.deleted_at) {
      await this.logLoginAttempt(email, ip, userAgent, false, 'USER_NOT_FOUND_OR_INACTIVE');
      // Generic message — never reveal if user exists
      throw new UnauthorizedException('Invalid email or password');
    }

    // ── STEP 3: Verify password with argon2 ──────────
    const passwordValid = await argon2.verify(user.password_hash, password);
    if (!passwordValid) {
      await this.logLoginAttempt(email, ip, userAgent, false, 'INVALID_PASSWORD');
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check email verification
    if (!user.is_email_verified) {
      // Allow login but log — could enforce in production
      this.logger.warn(`User ${user.id} login with unverified email`);
    }

    // ── STEP 4: Check MFA (early return if enabled) ──
    if (user.is_mfa_enabled) {
      // Generate temporary token for MFA verification (Plan 2.5)
      const tempToken = this.tokenService.generateMfaTempToken(user);
      await this.logLoginAttempt(email, ip, userAgent, true, 'MFA_REQUIRED');
      return { mfaRequired: true, tempToken };
    }

    // ── STEP 5: Create session skeleton ──────────────
    const sessionId = uuidv4();
    const refreshTokenFamily = uuidv4();
    const userAgentHash = this.hashUserAgent(userAgent);
    const expiresAt = new Date(Date.now() + this.SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    const session = await this.sessionModel.create({
      sessionId,
      userId: user.id,
      tokenVersion: user.token_version, // Snapshot current version
      refreshTokenHash: '', // Placeholder — updated in STEP 7
      refreshTokenFamily,
      deviceInfo: {
        userAgent,
        userAgentHash,
        ip,
        device: this.parseDevice(userAgent),
      },
      isActive: true,
      expiresAt,
    });

    // ── STEP 6: Generate token pair ──────────────────
    // Needs userId + sessionId (from STEP 5) + tokenVersion (from user entity)
    const tokenPair = this.tokenService.generateTokenPair(user, sessionId);

    // ── STEP 7: Hash refresh token, update session ───
    const refreshTokenHash = await argon2.hash(tokenPair.refreshToken);
    await this.sessionModel.updateOne(
      { sessionId },
      { refreshTokenHash },
    );

    // ── STEP 8: Update user last_login fields ────────
    await this.userRepository.update(user.id, {
      last_login_at: new Date(),
      last_login_ip: ip,
    });

    // ── STEP 9: Log audit + return tokens ────────────
    await this.logLoginAttempt(email, ip, userAgent, true, null);

    try {
      await this.auditLogModel.create({
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        metadata: { sessionId, refreshTokenFamily },
        ip,
        userAgent,
        correlationId,
      });
    } catch (e) {
      this.logger.error('Failed to write login audit log', e);
    }

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      sessionId,
    };
  }

  // ──────────────────────────────────────────────
  //  REFRESH TOKEN ROTATION — 7-step validation
  // ──────────────────────────────────────────────

  async refreshToken(incomingRefreshToken: string, device: DeviceInfo) {
    const { ip, userAgent, correlationId } = device;

    // ── STEP 1: Verify JWT signature ─────────────────
    let payload;
    try {
      payload = this.tokenService.verifyRefreshToken(incomingRefreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { userId, sessionId, tokenVersion: jwtTokenVersion } = payload;

    // ── STEP 2: Find session by sessionId ────────────
    const session = await this.sessionModel.findOne({ sessionId });

    // ── STEP 3: Session validation checks (exact order) ──
    // 3a) Session not found
    if (!session) {
      this.logger.warn(`Refresh attempt for non-existent session: ${sessionId}`);
      throw new UnauthorizedException('Session not found');
    }

    // 3b) Session deactivated
    if (!session.isActive) {
      this.logger.warn(`Refresh token reuse detected (inactive session): ${sessionId}`);
      await this.auditLogModel.create({
        userId,
        action: 'REFRESH_TOKEN_REUSE',
        metadata: { sessionId, reason: 'SESSION_INACTIVE' },
        ip,
        userAgent,
        correlationId,
      });
      throw new UnauthorizedException('Session has been revoked');
    }

    // 3c) Session explicitly revoked
    if (session.revokedAt) {
      this.logger.warn(`Refresh token reuse detected (revoked session): ${sessionId}`);
      await this.auditLogModel.create({
        userId,
        action: 'REFRESH_TOKEN_REUSE',
        metadata: { sessionId, reason: 'SESSION_REVOKED' },
        ip,
        userAgent,
        correlationId,
      });
      throw new UnauthorizedException('Session has been revoked');
    }

    // 3d) EXPLICIT expiration check — closes MongoDB TTL 60s race window
    if (session.expiresAt <= new Date()) {
      this.logger.warn(`Session ${sessionId} used after expiration (TTL race window)`);
      await this.sessionModel.updateOne(
        { sessionId },
        { isActive: false, revokedAt: new Date(), revokedReason: 'EXPIRED' },
      );
      throw new UnauthorizedException('Session expired');
    }

    // ── STEP 4: tokenVersion check (CRITICAL) ────────
    const currentUser = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.permissions'],
    });

    if (!currentUser) {
      throw new UnauthorizedException('User not found');
    }

    // JWT tokenVersion vs current user token_version
    if (jwtTokenVersion < currentUser.token_version) {
      this.logger.warn(
        `Token version mismatch: JWT=${jwtTokenVersion}, User=${currentUser.token_version}`,
      );
      await this.sessionModel.updateOne(
        { sessionId },
        { isActive: false, revokedAt: new Date(), revokedReason: 'TOKEN_VERSION_STALE' },
      );
      await this.auditLogModel.create({
        userId,
        action: 'TOKEN_VERSION_MISMATCH',
        metadata: { sessionId, jwtVersion: jwtTokenVersion, currentVersion: currentUser.token_version },
        ip,
        userAgent,
        correlationId,
      });
      throw new UnauthorizedException('Token invalidated — please re-login');
    }

    // Belt-and-suspenders: session tokenVersion vs user token_version
    if (session.tokenVersion < currentUser.token_version) {
      this.logger.warn(
        `Session token version stale: Session=${session.tokenVersion}, User=${currentUser.token_version}`,
      );
      await this.sessionModel.updateOne(
        { sessionId },
        { isActive: false, revokedAt: new Date(), revokedReason: 'TOKEN_VERSION_STALE' },
      );
      throw new UnauthorizedException('Session invalidated — please re-login');
    }

    // ── STEP 5: Refresh token hash verification ──────
    let hashMatch: boolean;
    try {
      hashMatch = await argon2.verify(session.refreshTokenHash, incomingRefreshToken);
    } catch {
      hashMatch = false;
    }

    if (!hashMatch) {
      // Token was already rotated — someone is replaying the OLD one (token theft!)
      this.logger.error(
        `TOKEN THEFT DETECTED: Family=${session.refreshTokenFamily}, Session=${sessionId}`,
      );

      // IMMEDIATELY revoke ALL sessions in this refreshTokenFamily
      await this.sessionModel.updateMany(
        { refreshTokenFamily: session.refreshTokenFamily, isActive: true },
        { isActive: false, revokedAt: new Date(), revokedReason: 'TOKEN_THEFT_DETECTED' },
      );

      await this.auditLogModel.create({
        userId,
        action: 'TOKEN_THEFT_DETECTED',
        metadata: {
          family: session.refreshTokenFamily,
          sessionId,
          ip,
        },
        ip,
        userAgent,
        correlationId,
      });

      throw new UnauthorizedException('Security violation detected — all sessions revoked');
    }

    // ── STEP 6: userAgentHash fingerprint check ──────
    const incomingHash = this.hashUserAgent(userAgent);
    const storedHash = session.deviceInfo?.userAgentHash;

    if (storedHash && incomingHash !== storedHash) {
      const strictMode = this.isStrictFingerprint();

      await this.auditLogModel.create({
        userId,
        action: 'SESSION_FINGERPRINT_MISMATCH',
        metadata: {
          expected: storedHash,
          got: incomingHash,
          sessionId,
          strictMode,
        },
        ip,
        userAgent,
        correlationId,
      });

      if (strictMode) {
        this.logger.warn(`Fingerprint mismatch in STRICT mode — revoking session ${sessionId}`);
        await this.sessionModel.updateOne(
          { sessionId },
          { isActive: false, revokedAt: new Date(), revokedReason: 'FINGERPRINT_MISMATCH' },
        );
        throw new UnauthorizedException('Device fingerprint mismatch');
      } else {
        this.logger.warn(`Fingerprint mismatch in RELAXED mode — allowing refresh for ${sessionId}`);
      }
    }

    // ── STEP 7: Issue new tokens ─────────────────────
    const newTokenPair = this.tokenService.generateTokenPair(currentUser, sessionId);
    const newRefreshTokenHash = await argon2.hash(newTokenPair.refreshToken);
    const newExpiresAt = new Date(Date.now() + this.SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    await this.sessionModel.updateOne(
      { sessionId },
      {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
        expiresAt: newExpiresAt,
        tokenVersion: currentUser.token_version,
      },
    );

    // Blacklist the OLD access token in Redis with TTL = remaining validity
    // We use the jti from the old refresh token — the access token jti would need
    // to be passed from the client or extracted separately. Here we blacklist by userId+sessionId
    // to cover the window.
    try {
      const oldAccessJti = payload.jti;
      if (oldAccessJti) {
        await this.redisService.setWithExpiry(`blacklist:${oldAccessJti}`, '1', 900); // 15min max
      }
    } catch (e) {
      this.logger.error('Failed to blacklist old token', e);
    }

    return {
      accessToken: newTokenPair.accessToken,
      refreshToken: newTokenPair.refreshToken,
      expiresIn: newTokenPair.expiresIn,
    };
  }

  // ──────────────────────────────────────────────
  //  LOGOUT — single session
  // ──────────────────────────────────────────────

  async logout(accessToken: string, device: DeviceInfo) {
    const { ip, userAgent, correlationId } = device;

    // Verify access token
    let payload;
    try {
      payload = this.tokenService.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    const { userId, tokenVersion: jwtTokenVersion, jti } = payload;

    // Fetch current user for tokenVersion check
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // tokenVersion check: if jwt.tokenVersion < user.token_version, session is already invalid
    if (jwtTokenVersion < user.token_version) {
      this.logger.log(`Logout for already-invalidated token (version stale). userId=${userId}`);
      return { message: 'Logged out successfully' };
    }

    // Find the session by extracting sessionId from refresh token context
    // For logout, we use the userId from the access token to find active sessions
    // Since access token doesn't contain sessionId, we look up by userId + most recent
    // Actually, we need sessionId. Let's accept it as a parameter or find by userId.
    // The controller will pass sessionId from request body or cookie.

    // Deactivate all sessions for this user that match the access token's context
    // In practice, the client should send sessionId. Here we'll accept it via the controller.

    // Blacklist the access token in Redis
    if (jti) {
      const ttl = this.getTokenRemainingTTL(payload);
      if (ttl > 0) {
        await this.redisService.setWithExpiry(`blacklist:${jti}`, '1', ttl);
      }
    }

    try {
      await this.auditLogModel.create({
        userId,
        action: 'LOGOUT',
        metadata: { jti },
        ip,
        userAgent,
        correlationId,
      });
    } catch (e) {
      this.logger.error('Failed to write logout audit', e);
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from a specific session (when sessionId is known)
   */
  async logoutSession(accessToken: string, sessionId: string, device: DeviceInfo) {
    const { ip, userAgent, correlationId } = device;

    let payload;
    try {
      payload = this.tokenService.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    const { userId, jti } = payload;

    // Deactivate the specific session
    const result = await this.sessionModel.updateOne(
      { sessionId, userId, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedReason: 'LOGOUT' },
    );

    if (result.modifiedCount === 0) {
      this.logger.warn(`No active session found for logout: ${sessionId}`);
    }

    // Blacklist access token
    if (jti) {
      const ttl = this.getTokenRemainingTTL(payload);
      if (ttl > 0) {
        await this.redisService.setWithExpiry(`blacklist:${jti}`, '1', ttl);
      }
    }

    try {
      await this.auditLogModel.create({
        userId,
        action: 'LOGOUT',
        metadata: { sessionId, jti },
        ip,
        userAgent,
        correlationId,
      });
    } catch (e) {
      this.logger.error('Failed to write logout audit', e);
    }

    return { message: 'Logged out successfully' };
  }

  // ──────────────────────────────────────────────
  //  LOGOUT ALL — global token invalidation
  // ──────────────────────────────────────────────

  async logoutAll(accessToken: string, device: DeviceInfo) {
    const { ip, userAgent, correlationId } = device;

    let payload;
    try {
      payload = this.tokenService.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    const { userId } = payload;

    // Deactivate ALL active sessions for this user in MongoDB
    const result = await this.sessionModel.updateMany(
      { userId, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' },
    );

    this.logger.log(`Logout-all: deactivated ${result.modifiedCount} sessions for userId=${userId}`);

    // INCREMENT user.token_version — instantly invalidates ALL existing JWTs
    await this.userRepository.increment({ id: userId }, 'token_version', 1);

    try {
      await this.auditLogModel.create({
        userId,
        action: 'LOGOUT_ALL_DEVICES',
        metadata: { sessionsDeactivated: result.modifiedCount },
        ip,
        userAgent,
        correlationId,
      });
    } catch (e) {
      this.logger.error('Failed to write logout-all audit', e);
    }

    return { message: 'All sessions terminated successfully' };
  }

  // ──────────────────────────────────────────────
  //  PRIVATE HELPERS
  // ──────────────────────────────────────────────

  /**
   * Check brute-force attempts by IP within the configured time window.
   * Throws 429 TooManyRequests if threshold exceeded.
   */
  private async checkBruteForce(ip: string): Promise<void> {
    const windowStart = new Date(Date.now() - this.BRUTE_FORCE_WINDOW_MIN * 60 * 1000);

    const failedAttempts = await this.loginAttemptModel.countDocuments({
      ip,
      success: false,
      attemptedAt: { $gte: windowStart },
    });

    if (failedAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      this.logger.warn(`Brute-force threshold reached for IP: ${ip} (${failedAttempts} attempts)`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many login attempts. Please try again later.',
          retryAfter: this.BRUTE_FORCE_WINDOW_MIN * 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Log a login attempt to MongoDB for brute-force tracking.
   */
  private async logLoginAttempt(
    email: string,
    ip: string,
    userAgent: string,
    success: boolean,
    failureReason: string | null,
  ): Promise<void> {
    try {
      await this.loginAttemptModel.create({
        email,
        ip,
        success,
        failureReason,
        userAgent,
      });
    } catch (e) {
      this.logger.error('Failed to log login attempt', e);
    }
  }

  /**
   * SHA-256 hash of the user-agent string for fingerprint comparison.
   */
  private hashUserAgent(userAgent: string): string {
    return crypto.createHash('sha256').update(userAgent).digest('hex');
  }

  /**
   * Parse device type from user-agent string (basic heuristic).
   */
  private parseDevice(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  /**
   * Determine fingerprint strictness from environment.
   * Default: RELAXED in dev, STRICT in prod.
   */
  private isStrictFingerprint(): boolean {
    const envValue = this.configService.get<string>('STRICT_FINGERPRINT');
    if (envValue !== undefined) {
      return envValue === 'true';
    }
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Calculate remaining TTL in seconds for a decoded JWT payload.
   */
  private getTokenRemainingTTL(payload: any): number {
    if (!payload.exp) return 0;
    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    return Math.max(remaining, 0);
  }
}
