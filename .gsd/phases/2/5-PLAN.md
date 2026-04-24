---
phase: 2
plan: 5
wave: 3
---

# Plan 2.5: Password Reset + Email Verification + MFA

## Objective
Implement password reset flow (token, email, update, session invalidation), email verification, and TOTP-based multi-factor authentication with backup codes.

## Context
- .gsd/SPEC.md
- apps/user-auth-service/src/auth/auth.service.ts
- libs/shared/src/redis/redis.service.ts

## Tasks

<task type="auto">
  <name>Implement password reset and email verification</name>
  <files>apps/user-auth-service/src/auth/dto/password-reset.dto.ts, apps/user-auth-service/src/auth/dto/verify-email.dto.ts, apps/user-auth-service/src/auth/auth.service.ts, apps/user-auth-service/src/auth/auth.controller.ts</files>
  <action>
    Install: `pnpm add uuid` and `pnpm add -D @types/uuid`

    1. Password Reset:
       - Create dto/password-reset-request.dto.ts: { email }
       - Create dto/password-reset-confirm.dto.ts: { token, newPassword }
       - `auth.service.requestPasswordReset(email)`:
         - Find user by email (don't reveal if user exists — always return success)
         - Generate reset token (UUID v4), hash it, store in Redis with key `pwd-reset:{hash}` and TTL 1 hour
         - Store userId in the Redis value
         - Log audit (PASSWORD_RESET_REQUESTED)
         - In production: send email (for now, log the token to console)
        - `auth.service.confirmPasswordReset(token, newPassword)`:
          - Hash the token, look up in Redis
          - If not found: throw BadRequestException (expired or invalid)
          - Hash new password with argon2
          - **CRITICAL**: Update user password AND **increment user.token_version** in PostgreSQL
            - The increment instantly invalidates all existing JWTs for this user
          - Delete the reset token from Redis
          - Invalidate ALL user sessions in MongoDB (bulk update isActive=false, revokedReason='PASSWORD_RESET')
          - Log audit (PASSWORD_RESET_COMPLETED)

    2. Email Verification:
       - `auth.service.requestEmailVerification(userId)`:
         - Generate verification token, store hash in Redis with key `email-verify:{hash}` TTL 24h
         - Log to console (email sending placeholder)
       - `auth.service.verifyEmail(token)`:
         - Look up token hash in Redis
         - If valid: set user.is_email_verified = true in PostgreSQL
         - Delete token from Redis
         - Log audit (EMAIL_VERIFIED)
       - Called automatically after registration

    3. Controller endpoints:
       - POST /auth/password-reset/request — @Public()
       - POST /auth/password-reset/confirm — @Public()
       - POST /auth/verify-email — @Public(), accepts { token }
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Password reset flow compiles. Email verification compiles. Session invalidation on password change works.</done>
</task>

<task type="auto">
  <name>Implement MFA system with OTP and backup codes</name>
  <files>apps/user-auth-service/src/auth/mfa.service.ts, apps/user-auth-service/src/auth/dto/mfa.dto.ts, apps/user-auth-service/src/auth/auth.controller.ts</files>
  <action>
    Install: `pnpm add otplib crypto`

    1. Create `mfa.service.ts`:
       - `enableMfa(userId)`:
         - Generate TOTP secret using otplib authenticator
         - Generate 10 backup codes (random 8-char hex strings)
         - Hash each backup code with argon2
         - Store mfa_secret (encrypted) and hashed backup codes in user entity
         - Set is_mfa_enabled = true
         - Return { secret, qrCodeUrl (otpauth://), backupCodes (plain — shown once) }
         - Log audit (MFA_ENABLED)

       - `verifyMfaOtp(userId, otp)`:
         - Load user, verify OTP against mfa_secret using otplib
         - If invalid, check against backup codes (argon2 verify each)
         - If backup code matches, mark it as used (delete from array)
         - Track failed MFA attempts in Redis (`mfa-attempts:{userId}`, TTL 15min)
         - If >= 5 failures in window: temporarily lock MFA for 15min, log audit (MFA_LOCKED)
         - Return boolean success

       - `disableMfa(userId, otp)`:
         - Verify OTP first (require current valid OTP to disable)
         - Clear mfa_secret and backup codes
         - Set is_mfa_enabled = false
         - Log audit (MFA_DISABLED)

    2. Login flow integration (update auth.service.login):
        - If user.is_mfa_enabled === true after password verification:
          - **Generate a temporary MFA token** (short-lived, 5min):
            - Include: `userId`, `jti: uuid.v4()`, `purpose: 'mfa_verification'`
            - Sign with `JWT_ACCESS_SECRET` but use a very short TTL (5min)
          - **Redis Binding (Single-use)**:
            - Store `mfa-pending:{jti}` -> `userId` in Redis with TTL 5min
            - This ensures the token is strictly single-use and cannot be used for any other purpose than the MFA verify route
          - Return `{ mfaRequired: true, mfaToken: tempToken }` instead of full token pair
          - DO NOT create a session yet

    3. Create `POST /auth/mfa/verify` endpoint:
        - Accept `{ mfaToken, otp }`
        - **Verify Strategy**:
          - Decode `mfaToken`, extract `userId` and `jti`
          - Check if `mfa-pending:{jti}` exists in Redis. If not, throw UnauthorizedException.
          - Call `mfa.verifyMfaOtp(userId, otp)`
          - If valid:
            - **Delete `mfa-pending:{jti}` from Redis** immediately (prevents replay)
            - Continue with normal login completion (Plan 2.3 flow):
              - Create MongoDB session (sessionId, userAgentHash, etc.)
              - Generate full Access/Refresh token pair
              - Update user `last_login_at`/`ip`
              - Log audit (LOGIN_SUCCESS_MFA)
            - Return token pair
          - If invalid: Handle failed attempt counter in Redis (max 5)

    4. Additional endpoints:
       - POST /auth/mfa/enable — requires auth, returns secret + QR + backup codes
       - POST /auth/mfa/disable — requires auth + OTP
       - POST /auth/mfa/verify — @Public() (but requires tempToken)
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>MFA enrollment, verification, and login integration compile. Backup codes work. Failed attempt tracking works.</done>
</task>

## Success Criteria
- [ ] Password reset generates token, validates it, updates password, increments `token_version`, and invalidates all sessions
- [ ] Email verification token generated on registration, verified via endpoint
- [ ] MFA enable returns TOTP secret + backup codes
- [ ] Login with MFA returns single-use `mfaToken` bound to Redis with unique JTI
- [ ] MFA verification consumes Redis entry and issues full session on success
- [ ] Failed MFA attempts tracked and locked after 5 failures
