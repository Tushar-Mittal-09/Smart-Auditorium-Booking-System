---
phase: 2
plan: 3
wave: 2
---

# Plan 2.3: Registration + Login + JWT Token System

## Objective
Implement complete registration (email domain validation, argon2 hashing, default role assignment), login (correct order: validate → session → token → hash → update; tokenVersion in JWT), JWT access/refresh token generation with mandatory rotation and tokenVersion + userAgentHash verification.

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
       - `generateAccessToken(payload)` — sign with JWT_ACCESS_SECRET, 15min expiry, includes:
         - userId, email, roles, permissions
         - **tokenVersion** — from user.token_version (CRITICAL for invalidation)
         - jti — unique token ID (UUID) for blacklist tracking
       - `generateRefreshToken(payload)` — sign with JWT_REFRESH_SECRET, 7d expiry, includes:
         - userId, sessionId, tokenVersion
         - jti — unique token ID
       - `verifyAccessToken(token)` — verify and decode
       - `verifyRefreshToken(token)` — verify and decode
       - `generateTokenPair(user, sessionId)` — convenience method that reads user.token_version

    3. Implement `auth.service.login()` — **CORRECT ORDER IS CRITICAL**:
       ```
       STEP 1: Brute-force check
       STEP 2: Find user + validate credentials
       STEP 3: Check email verified + account active
       STEP 4: Check MFA (early return if enabled)
       STEP 5: Create session skeleton (get sessionId)
       STEP 6: Generate token pair (needs userId + sessionId + tokenVersion)
       STEP 7: Hash refresh token, update session with hash
       STEP 8: Update user last_login_at/ip
       STEP 9: Log audit + return tokens
       ```

       Detailed flow:
       - **STEP 1**: Check brute-force: query MongoDB login_attempts for this IP in last 15min. If >= 5 failures, throw TooManyRequestsException with retry-after header.
       - **STEP 2**: Find user by email (include roles and permissions via eager/join). If not found or !isActive or deleted_at is set: log failed attempt, throw UnauthorizedException (generic message — don't reveal if user exists).
       - **STEP 3**: Verify password with argon2.verify. If wrong: log failed attempt to MongoDB, throw UnauthorizedException.
       - **STEP 4**: If `user.is_mfa_enabled === true`: return partial response `{ mfaRequired: true, tempToken }` (handled in Plan 2.5). DO NOT create session or tokens yet.
       - **STEP 5**: Create session in MongoDB with:
         - sessionId: uuid.v4()
         - userId: user.id
         - **tokenVersion: user.token_version** — snapshot of current version
         - refreshTokenHash: '' (placeholder — will be updated in STEP 7)
         - refreshTokenFamily: uuid.v4() — new family for this login
         - deviceInfo: { userAgent, **userAgentHash** (SHA-256), ip, device (parsed) }
         - isActive: true
         - expiresAt: now + 7 days
         Save session, get back the sessionId.
       - **STEP 6**: Generate token pair using `tokenService.generateTokenPair(user, session.sessionId)`. This embeds userId, sessionId, **tokenVersion**, roles, permissions, jti.
       - **STEP 7**: Hash the refresh token with argon2. Update the session document: `session.refreshTokenHash = hash`. This is a separate `findByIdAndUpdate` call.
       - **STEP 8**: Update user: `last_login_at = new Date()`, `last_login_ip = ip`.
       - **STEP 9**: Log audit (LOGIN_SUCCESS) with correlationId. Return `{ accessToken, refreshToken, expiresIn: 900, sessionId }`.

       **WHY THIS ORDER MATTERS:**
       - Token generation needs `sessionId` (from STEP 5) and `tokenVersion` (from user entity)
       - Hashing the refresh token (STEP 7) needs the token string (from STEP 6)
       - Session needs to exist before we can reference it in the token
       - The placeholder hash in STEP 5 is immediately overwritten in STEP 7 — this avoids a chicken-and-egg problem

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
    1. Implement `auth.service.refreshToken()` — **tokenVersion + userAgentHash checks are MANDATORY**:
       - **STEP 1**: Verify the refresh token signature (JWT_REFRESH_SECRET). Extract: userId, sessionId, tokenVersion from payload.
       - **STEP 2**: Find the session in MongoDB by `sessionId` (NOT by MongoDB _id).
       - **STEP 3 — Session validation checks** (in this exact order):
         ```
         a) Session not found        → throw Unauthorized (session deleted or never existed)
         b) session.isActive = false  → log REFRESH_TOKEN_REUSE, throw Unauthorized
         c) session.revokedAt != null → log REFRESH_TOKEN_REUSE, throw Unauthorized
         d) session.expiresAt <= now  → EXPLICIT EXPIRATION CHECK — throw Unauthorized
         ```
         **WHY STEP 3d is explicit and CRITICAL:**
         MongoDB TTL monitor runs only every ~60 seconds. This means a session
         document can exist in the database for up to 60s AFTER its expiresAt
         has passed. If we rely solely on "document exists = valid", an attacker
         with a stolen refresh token has a 60-second race window to use it
         after expiration. The application layer MUST compare:
         ```typescript
         if (session.expiresAt <= new Date()) {
           // Session is logically expired even though MongoDB hasn't deleted it yet
           this.logger.warn(`Session ${sessionId} used after expiration (TTL race window)`);
           // Deactivate immediately so it can't be tried again in the window
           await this.sessionModel.updateOne(
             { sessionId },
             { isActive: false, revokedAt: new Date(), revokedReason: 'EXPIRED' }
           );
           throw new UnauthorizedException('Session expired');
         }
         ```
         This makes the system airtight regardless of MongoDB's background cleanup timing.
       - **STEP 4 — tokenVersion check (CRITICAL)**:
         - Fetch the CURRENT user from PostgreSQL
         - Compare `jwt.tokenVersion` with `user.token_version`
         - If `jwt.tokenVersion < user.token_version`:
           - The user changed their password, did logout-all, or a security event fired AFTER this token was issued
           - **REVOKE this session** (set isActive=false, revokedAt=now, revokedReason='TOKEN_VERSION_STALE')
           - Log audit TOKEN_VERSION_MISMATCH
           - Throw UnauthorizedException — force re-login
         - Also compare `session.tokenVersion` with `user.token_version` (belt-and-suspenders):
           - If stale: same revocation logic
       - **STEP 5 — Refresh token hash verification**:
         - Compare the incoming refresh token with `session.refreshTokenHash` using argon2.verify
         - If mismatch: this means the token was already rotated and someone is replaying the OLD one
           - **IMMEDIATELY revoke ALL sessions in this `refreshTokenFamily`** (token theft detected)
           - Log audit TOKEN_THEFT_DETECTED with metadata: { family, sessionId, ip }
           - Throw UnauthorizedException
       - **STEP 6 — userAgentHash fingerprint check**:
         - Hash the incoming request's user-agent with SHA-256
         - Compare with `session.deviceInfo.userAgentHash`
         - If mismatch:
           - Log audit SESSION_FINGERPRINT_MISMATCH with metadata: { expected, got, sessionId }
           - **Configurable behavior** (via env `STRICT_FINGERPRINT=true/false`):
             - STRICT mode: revoke session, throw Unauthorized
             - RELAXED mode: log warning, allow refresh but flag session for review
           - Default: RELAXED in dev, STRICT in prod
       - **STEP 7 — Issue new tokens**:
         - Generate NEW token pair (same sessionId, current user.token_version)
         - Hash the NEW refresh token with argon2
         - Update session: refreshTokenHash, lastUsedAt, expiresAt (extend by 7 days)
         - Blacklist the OLD access token in Redis with TTL = remaining validity
         - Return new { accessToken, refreshToken, expiresIn: 900 }

    2. Implement `auth.service.logout()`:
       - Verify the access token
       - **tokenVersion check**: if jwt.tokenVersion < user.token_version, session is already invalid — return success
       - Find and deactivate the session in MongoDB (set isActive=false, revokedAt=now, revokedReason='LOGOUT')
       - Blacklist the access token in Redis with TTL = remaining validity
       - Log audit (LOGOUT)

    3. Implement `auth.service.logoutAll()`:
       - Deactivate ALL active sessions for the user in MongoDB (bulk update: isActive=false, revokedAt=now, revokedReason='LOGOUT_ALL')
       - **Increment user.token_version** in PostgreSQL — this instantly invalidates ALL existing JWTs for this user without needing to blacklist each one
       - Log audit (LOGOUT_ALL_DEVICES)

    4. Implement controller endpoints:
       - POST /auth/refresh — accepts { refreshToken } in body
       - POST /auth/logout — requires Authorization header, deactivates current session
       - POST /auth/logout-all — requires Authorization header, deactivates all sessions + increments tokenVersion
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Refresh rotation compiles with tokenVersion + userAgentHash checks. Token reuse detected via hash mismatch → family revocation. Logout-all increments tokenVersion. Multi-device logout works.</done>
</task>

## Success Criteria
- [ ] Registration validates domain, hashes password, assigns STUDENT role
- [ ] Login follows CORRECT order: validate → session skeleton → generate tokens → hash refresh → update session
- [ ] Login stores tokenVersion snapshot in session from user.token_version
- [ ] Login stores userAgentHash (SHA-256) in session.deviceInfo
- [ ] Login updates user.last_login_at and user.last_login_ip
- [ ] Access token JWT includes: userId, email, roles, permissions, tokenVersion, jti
- [ ] Refresh token JWT includes: userId, sessionId, tokenVersion, jti
- [ ] Refresh validates tokenVersion — rejects if jwt.tokenVersion < user.token_version (stale)
- [ ] Refresh explicitly checks session.expiresAt <= now — closes MongoDB TTL 60s race window
- [ ] Refresh validates userAgentHash — detects browser fingerprint mismatch
- [ ] Refresh validates refreshTokenHash — hash mismatch triggers family-wide revocation (token theft)
- [ ] Logout-all increments user.token_version — instant global token invalidation
- [ ] Logout deactivates session and blacklists access token in Redis
