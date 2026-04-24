---
phase: 2
plan: 4
wave: 2
---

# Plan 2.4: RBAC Guards + Security Middleware

## Objective
Implement NestJS guards for JWT authentication, role-based access, and permission-based access. Add security middleware (Helmet, CORS, rate limiting).

## Context
- .gsd/SPEC.md
- apps/user-auth-service/src/auth/token.service.ts
- libs/shared/src/redis/redis.service.ts

## Tasks

<task type="auto">
  <name>Implement JWT AuthGuard with token blacklist check</name>
  <files>libs/shared/src/guards/jwt-auth.guard.ts, libs/shared/src/strategies/jwt.strategy.ts, libs/shared/src/decorators/current-user.decorator.ts</files>
  <action>
    Install: `pnpm add @nestjs/passport passport passport-jwt` (if not already installed), `pnpm add -D @types/passport-jwt`

    In libs/shared/src create:

    1. `strategies/jwt.strategy.ts`:
       - Extends PassportStrategy(Strategy, 'jwt')
       - Extracts token from Authorization Bearer header
       - Validates against JWT_ACCESS_SECRET
       - In validate(): check Redis blacklist (`token-blacklist:{jti}` key). If blacklisted, throw UnauthorizedException.
       - Return payload as the user object

    2. `guards/jwt-auth.guard.ts`:
       - Extends AuthGuard('jwt')
       - Override handleRequest to provide better error messages
       - Check for @Public() decorator to skip auth on certain routes

    3. `decorators/current-user.decorator.ts`:
       - createParamDecorator extracting user from request
       - Type-safe with IAuthUser interface

    4. `decorators/public.decorator.ts`:
       - SetMetadata('isPublic', true)
       - Used to mark routes that don't require auth

    5. `interfaces/auth-user.interface.ts`:
       - userId, email, roles: string[], permissions: string[]

    Export all from shared index.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>JWT guard compiles. Checks blacklist. @Public() decorator works. @CurrentUser() extracts user.</done>
</task>

<task type="auto">
  <name>Implement RolesGuard and PermissionsGuard</name>
  <files>libs/shared/src/guards/roles.guard.ts, libs/shared/src/guards/permissions.guard.ts, libs/shared/src/decorators/roles.decorator.ts, libs/shared/src/decorators/permissions.decorator.ts</files>
  <action>
    1. `decorators/roles.decorator.ts`:
       - @Roles('ADMIN', 'ORGANIZER') — SetMetadata with role names
       - Export Role enum: STUDENT, ORGANIZER, ADMIN

    2. `guards/roles.guard.ts`:
       - CanActivate guard
       - Reads required roles from @Roles() metadata via Reflector
       - If no roles specified, allow access
       - Checks user.roles from request against required roles
       - Throw ForbiddenException with clear message on mismatch

    3. `decorators/permissions.decorator.ts`:
       - @Permissions('event:create', 'booking:manage') — SetMetadata

    4. `guards/permissions.guard.ts`:
       - CanActivate guard
       - Reads required permissions from @Permissions() metadata via Reflector
       - If no permissions specified, allow access
       - Checks user.permissions from request against required permissions
       - Throw ForbiddenException on mismatch

    Export all from shared index.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>RolesGuard and PermissionsGuard compile. Decorators work. Guards check user metadata.</done>
</task>

<task type="auto">
  <name>Implement rate limiting and security middleware</name>
  <files>libs/shared/src/guards/rate-limit.guard.ts, apps/api-gateway/src/main.ts</files>
  <action>
    Install: `pnpm add helmet @nestjs/throttler`

    1. Create `guards/rate-limit.guard.ts`:
       - Custom guard using RedisService for distributed rate limiting
       - Key pattern: `rate-limit:{ip}:{route}`
       - Default: 100 req/min/IP
       - Login-specific: 5 attempts/15min/IP (stricter)
       - Use @RateLimit(limit, windowSeconds) decorator for per-route config
       - Return 429 Too Many Requests with Retry-After header

    2. Update `apps/api-gateway/src/main.ts`:
       - Add `app.use(helmet())` for security headers
       - Configure CORS with:
         - Specific allowed origins (env var CORS_ORIGINS)
         - credentials: true
         - Allowed methods and headers
       - Add global validation pipe with:
         - whitelist: true (strip unknown fields)
         - forbidNonWhitelisted: true (throw on unknown fields)
         - transform: true (auto-transform DTOs)
       - Register JWT AuthGuard as APP_GUARD globally
       - Register RateLimitGuard as APP_GUARD globally

    Export rate limit guard and decorator from shared.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>Rate limiting guard compiles with Redis backing. Helmet and CORS configured. Global guards registered.</done>
</task>

## Success Criteria
- [ ] JWT AuthGuard validates tokens and checks Redis blacklist
- [ ] RolesGuard and PermissionsGuard enforce RBAC on routes
- [ ] Rate limiting uses Redis for distributed state, stricter on login
- [ ] Helmet, CORS, and global validation pipe configured on API gateway
