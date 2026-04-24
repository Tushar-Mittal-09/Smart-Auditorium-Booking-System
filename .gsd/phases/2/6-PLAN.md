---
phase: 2
plan: 6
wave: 3
---

# Plan 2.6: Google OAuth + Audit Logging + Security Hardening

## Objective
Implement Google OAuth SSO, comprehensive audit logging service, and final security hardening across the auth system.

## Context
- .gsd/SPEC.md
- apps/user-auth-service/src/auth/auth.service.ts
- apps/user-auth-service/src/schemas/audit-log.schema.ts

## Tasks

<task type="auto">
  <name>Implement Google OAuth SSO</name>
  <files>apps/user-auth-service/src/auth/oauth.service.ts, apps/user-auth-service/src/auth/dto/google-auth.dto.ts, apps/user-auth-service/src/auth/auth.controller.ts</files>
  <action>
    Install: `pnpm add google-auth-library`

    1. Create `oauth.service.ts`:
       - Inject Google OAuth2Client with GOOGLE_CLIENT_ID from env

       - `authenticateWithGoogle(idToken, deviceInfo)`:
         - Verify Google ID token using google-auth-library
         - Extract email, name, googleId from payload
         - Check if user exists by google_id:
           a) If exists: login flow (create session, generate tokens)
           b) If not exists but email exists: LINK accounts (set google_id on existing user)
           c) If not exists at all: CREATE new user with:
              - google_id set
              - is_email_verified = true (Google verified it)
              - password_hash = null (no password for OAuth-only accounts)
              - Assign STUDENT role
         - Create session in MongoDB
         - Generate token pair
         - Log audit (GOOGLE_LOGIN or GOOGLE_ACCOUNT_LINKED or GOOGLE_REGISTRATION)
         - Return { accessToken, refreshToken, isNewUser }

    2. Create dto:
       - google-auth.dto.ts: { idToken: @IsString }

    3. Controller endpoint:
       - POST /auth/google — @Public(), accepts { idToken }

    4. Add GOOGLE_CLIENT_ID to .env and .env.example.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Google OAuth compiles. Account linking works. New user creation works. Session created.</done>
</task>

<task type="auto">
  <name>Implement centralized audit logging service</name>
  <files>apps/user-auth-service/src/auth/audit.service.ts</files>
  <action>
    1. Create `audit.service.ts`:
       - Injectable service using AuditLog Mongoose model

       - `log(params: AuditLogParams)`:
         - Accepts: userId, action (from AuditAction enum), metadata, ip, userAgent
         - Creates AuditLog document in MongoDB
         - Fire-and-forget (don't await — non-blocking logging)

       - AuditAction enum:
         - LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, LOGOUT_ALL_DEVICES
         - REGISTRATION, EMAIL_VERIFIED
         - TOKEN_REFRESH, REFRESH_TOKEN_REUSE, TOKEN_THEFT_DETECTED
         - PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED
         - MFA_ENABLED, MFA_DISABLED, MFA_VERIFIED, MFA_FAILURE, MFA_LOCKED
         - ROLE_CHANGE, PERMISSION_CHANGE
         - GOOGLE_LOGIN, GOOGLE_REGISTRATION, GOOGLE_ACCOUNT_LINKED
         - BRUTE_FORCE_BLOCKED

       - `getAuditLogs(userId, filters?)`:
         - Query with pagination
         - Filter by action, date range
         - Only accessible by ADMIN or the user themselves

    2. Refactor ALL existing audit logging calls across auth.service, mfa.service, oauth.service to use this centralized service.

    3. Controller endpoint:
       - GET /auth/audit-logs — requires auth + @Roles('ADMIN') or own userId
       - Query params: page, limit, action, startDate, endDate
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Centralized audit service compiles. All auth flows use it. Admin can query audit logs.</done>
</task>

<task type="auto">
  <name>Security hardening and final integration</name>
  <files>apps/user-auth-service/src/auth/auth.module.ts, apps/api-gateway/src/app/app.module.ts</files>
  <action>
    1. Secure cookie configuration (for refresh tokens via cookie alternative):
       - Add cookie-parser middleware
       - Configure secure cookie options: httpOnly, secure (prod only), sameSite: 'strict', path: '/auth/refresh'

    2. Input sanitization:
       - Add global interceptor to strip any HTML/script tags from string inputs
       - Ensure all DTOs use class-validator with strict validation

    3. Error handling:
       - Create global exception filter that:
         - Never leaks internal error details in production
         - Returns consistent error response format: { statusCode, message, error, timestamp }
         - Logs full error internally

    4. Final AuthModule cleanup:
       - Ensure all providers are properly registered
       - Ensure all guards, strategies, services are in correct module scope
       - ConfigModule is global, JWT module configured once

    5. API Gateway integration:
       - Import shared modules (RedisModule for blacklist checking, JwtStrategy)
       - Register global guards (JwtAuthGuard, RateLimitGuard)
       - Ensure gateway can proxy /auth/* to user-auth-service

    6. Create comprehensive health check endpoint:
       - GET /health — @Public(), returns { status, postgres, mongodb, redis } connection states
  </action>
  <verify>pnpm exec nx build user-auth-service; pnpm exec nx build api-gateway</verify>
  <done>Both services build. Security hardening complete. Gateway proxies auth routes. Health check works.</done>
</task>

## Success Criteria
- [ ] Google OAuth SSO with account creation/linking
- [ ] Centralized audit logging used across all auth operations
- [ ] Security hardening: sanitization, error handling, secure cookies
- [ ] API Gateway integrates guards and proxies to auth service
- [ ] Health check endpoint verifies all DB connections
