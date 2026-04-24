---
phase: 2
plan: 3
wave: 2
---

# Plan 2.3: Registration + Login + JWT Token System

## Objective
Implement complete registration (email domain validation, argon2 hashing, default role assignment), login (brute-force check, credential validation, session creation), JWT access/refresh token generation with mandatory rotation.

## Context
- .gsd/SPEC.md
- apps/user-auth-service/src/entities/
- apps/user-auth-service/src/schemas/
- libs/shared/src/redis/redis.service.ts

## Tasks

<task type="auto">
  <name>Implement registration flow</name>
  <files>apps/user-auth-service/src/auth/dto/register.dto.ts, apps/user-auth-service/src/auth/auth.service.ts, apps/user-auth-service/src/auth/auth.controller.ts</files>
  <action>
    Install: `pnpm add argon2 class-validator class-transformer @nestjs/jwt @nestjs/passport passport passport-jwt`

    1. Create `dto/register.dto.ts`:
       - email: @IsEmail, custom validator for university domain
       - password: @MinLength(8), @Matches for complexity (uppercase, lowercase, number, special char)
       - firstName, lastName: @IsString, @MinLength(2)

    2. Implement `auth.service.register()`:
       - Validate email domain against UNIVERSITY_EMAIL_DOMAIN env var
       - Check if user already exists (throw ConflictException)
       - Hash password with argon2 (argon2.hash with recommended settings)
       - Create user entity in PostgreSQL
       - Assign STUDENT role via TypeORM relation
       - Generate email verification token (random UUID, store hash in Redis with 24h TTL)
       - Log audit event (REGISTRATION) to MongoDB
       - Return sanitized user object (NO password hash)

    3. Implement POST /auth/register in controller:
       - Use @Body() with validation pipe
       - Return 201 with user data and message
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Registration endpoint compiles. Email domain validated. Password hashed with argon2. User created with STUDENT role.</done>
</task>

<task type="auto">
  <name>Implement login flow with JWT token pair</name>
  <files>apps/user-auth-service/src/auth/dto/login.dto.ts, apps/user-auth-service/src/auth/auth.service.ts, apps/user-auth-service/src/auth/token.service.ts</files>
  <action>
    1. Create `dto/login.dto.ts`:
       - email: @IsEmail
       - password: @IsString

    2. Create `token.service.ts`:
       - Injectable service wrapping @nestjs/jwt JwtService
       - `generateAccessToken(payload)` — sign with JWT_ACCESS_SECRET, 15min expiry, includes: userId, email, roles, permissions
       - `generateRefreshToken(payload)` — sign with JWT_REFRESH_SECRET, 7d expiry, includes: userId, sessionId, tokenVersion
       - `verifyAccessToken(token)` — verify and decode
       - `verifyRefreshToken(token)` — verify and decode
       - `generateTokenPair(user, sessionId)` — convenience method

    3. Implement `auth.service.login()`:
       - Check brute-force: query MongoDB login_attempts for this IP in last 15min. If >= 5 failures, throw TooManyRequestsException with retry-after header.
       - Find user by email (include roles and permissions via eager/join)
       - If not found or !isActive: log failed attempt, throw UnauthorizedException
       - Verify password with argon2.verify
       - If wrong: log failed attempt, increment counter, throw UnauthorizedException
       - If MFA enabled: return partial response with mfa_required flag + temp token (handle in Plan 2.5)
       - Create session in MongoDB with: userId, device info from request, hashed refresh token, expiresAt
       - Generate access + refresh token pair
       - Log audit (LOGIN_SUCCESS)
       - Return { accessToken, refreshToken, expiresIn: 900 }

    4. Implement POST /auth/login in controller:
       - Extract IP and user-agent from @Req()
       - Pass device info to service
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Login endpoint compiles. Brute-force check works. Token pair generated. Session created in MongoDB.</done>
</task>

<task type="auto">
  <name>Implement refresh token rotation and logout</name>
  <files>apps/user-auth-service/src/auth/auth.service.ts, apps/user-auth-service/src/auth/auth.controller.ts</files>
  <action>
    1. Implement `auth.service.refreshToken()`:
       - Verify the refresh token signature
       - Find the session in MongoDB by sessionId from token payload
       - If session not found or !isActive: throw UnauthorizedException (token reuse attack — log audit REFRESH_TOKEN_REUSE)
       - Compare the token hash with stored refreshTokenHash using argon2.verify
       - If mismatch: IMMEDIATELY invalidate ALL sessions for this user (token theft detected), log audit TOKEN_THEFT_DETECTED, throw UnauthorizedException
       - Generate NEW token pair
       - Update session: new refreshTokenHash, new lastUsedAt, new expiresAt
       - Blacklist the OLD access token in Redis with TTL = remaining validity
       - Return new { accessToken, refreshToken, expiresIn: 900 }

    2. Implement `auth.service.logout()`:
       - Verify the access token
       - Find and deactivate the session in MongoDB (set isActive=false)
       - Blacklist the access token in Redis with TTL = remaining validity
       - Log audit (LOGOUT)

    3. Implement `auth.service.logoutAll()`:
       - Deactivate ALL sessions for the user in MongoDB
       - Log audit (LOGOUT_ALL_DEVICES)

    4. Implement controller endpoints:
       - POST /auth/refresh — accepts { refreshToken } in body
       - POST /auth/logout — requires Authorization header, deactivates current session
       - POST /auth/logout-all — requires Authorization header, deactivates all sessions
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Refresh rotation compiles. Token reuse detected and all sessions revoked. Logout blacklists token. Multi-device logout works.</done>
</task>

## Success Criteria
- [ ] Registration validates domain, hashes password, assigns STUDENT role
- [ ] Login checks brute-force, validates credentials, creates session, returns JWT pair
- [ ] Refresh rotation invalidates old token, detects reuse/theft
- [ ] Logout invalidates session and blacklists access token
