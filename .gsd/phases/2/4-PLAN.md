---
phase: 2
plan: 4
wave: 2
---

# Plan 2.4: RBAC Guards + Security Middleware

## Objective
Implement NestJS guards for JWT authentication (with tokenVersion check), role-based access, and permission-based access with CORRECT execution order. Add security middleware (rate limiting, CORS). Document guard stacking pattern.

## Context
- .gsd/SPEC.md
- apps/user-auth-service/src/auth/token.service.ts
- libs/shared/src/redis/redis.service.ts

## ⚠️ GUARD EXECUTION ORDER — CRITICAL ARCHITECTURE DECISION

NestJS executes guards in two layers:
1. **Global guards (APP_GUARD)** — run on EVERY request, in registration order
2. **Route guards (@UseGuards)** — run AFTER global guards, left-to-right

**CORRECT global guard order (registration order matters):**
```typescript
// In app.module.ts providers array — ORDER IS EXECUTION ORDER
providers: [
  { provide: APP_GUARD, useClass: RateLimitGuard },   // 1st: Block abusive IPs BEFORE any auth work
  { provide: APP_GUARD, useClass: JwtAuthGuard },      // 2nd: Authenticate user (skip if @Public())
  // RolesGuard and PermissionsGuard are NOT global — they are per-route
]
```

**CORRECT per-route guard stacking:**
```typescript
// RolesGuard and PermissionsGuard are NEVER global APP_GUARDs because:
// - Most routes don't need role checks (only auth)
// - They REQUIRE JwtAuthGuard to run first (user must be on request)
// - Making them global would force @Roles/@Permissions on every route

// Usage on protected routes:
@UseGuards(RolesGuard)        // reads @Roles() metadata, checks user.roles
@Roles(Role.ADMIN)
@Get('admin/users')
getUsers() {}

@UseGuards(PermissionsGuard)  // reads @Permissions() metadata, checks user.permissions
@Permissions('event:create')
@Post('events')
createEvent() {}

// Stacking both (rare — for maximum security):
@UseGuards(RolesGuard, PermissionsGuard)  // left-to-right: roles first, then permissions
@Roles(Role.ADMIN)
@Permissions('admin:manage-users')
@Delete('users/:id')
deleteUser() {}
```

**WHY THIS ORDER MATTERS:**
```
Request → RateLimitGuard (is IP blocked?) 
        → JwtAuthGuard (is token valid? is @Public()?)
        → [if @UseGuards] RolesGuard (does user have required role?)
        → [if @UseGuards] PermissionsGuard (does user have required permission?)
        → Controller handler

If JwtAuthGuard runs AFTER RolesGuard → RolesGuard sees undefined user → crash
If RateLimitGuard runs AFTER JwtAuthGuard → unauthenticated flood attacks waste auth CPU
```

## Tasks

<task type="auto">
  <name>Implement JWT AuthGuard with token blacklist + tokenVersion check</name>
  <files>libs/shared/src/guards/jwt-auth.guard.ts, libs/shared/src/strategies/jwt.strategy.ts, libs/shared/src/decorators/current-user.decorator.ts, libs/shared/src/decorators/public.decorator.ts, libs/shared/src/interfaces/auth-user.interface.ts</files>
  <action>
    Install: `pnpm add @nestjs/passport passport passport-jwt` (if not already installed), `pnpm add -D @types/passport-jwt`

    In libs/shared/src create:

    1. `interfaces/auth-user.interface.ts`:
       - IAuthUser: { userId, email, roles: string[], permissions: string[], tokenVersion: number }
       - Used by all guards and decorators for type-safety

    2. `strategies/jwt.strategy.ts`:
       - Extends PassportStrategy(Strategy, 'jwt')
       - Extracts token from Authorization Bearer header
       - Validates against JWT_ACCESS_SECRET
       - In `validate(payload)` — run these checks IN ORDER:
         ```typescript
         async validate(payload: JwtPayload): Promise<IAuthUser> {
           // 1. Check Redis blacklist by jti
           const isBlacklisted = await this.redisService.exists(`token-blacklist:${payload.jti}`);
           if (isBlacklisted) {
             throw new UnauthorizedException('Token has been revoked');
           }

           // 2. tokenVersion check — fetch CURRENT user.token_version from DB
           //    This is the "belt" to Redis blacklist's "suspenders"
           //    Even if Redis blacklist was missed, this catches stale tokens
           const user = await this.userRepository.findOne({
             where: { id: payload.userId },
             select: ['id', 'token_version', 'is_active', 'deleted_at'],
           });

           if (!user || !user.is_active || user.deleted_at) {
             throw new UnauthorizedException('User account is inactive');
           }

           if (payload.tokenVersion < user.token_version) {
             throw new UnauthorizedException('Token version outdated — please re-login');
           }

           // 3. Return the auth user object (attached to request.user)
           return {
             userId: payload.userId,
             email: payload.email,
             roles: payload.roles,
             permissions: payload.permissions,
             tokenVersion: payload.tokenVersion,
           };
         }
         ```
       - **PERFORMANCE NOTE**: This hits the DB on every request. Mitigate with:
         - Redis cache: cache `user:{id}:version` with 60s TTL
         - On tokenVersion increment, delete the cache key
         - Check cache first, fall back to DB

    3. `guards/jwt-auth.guard.ts`:
       - Extends AuthGuard('jwt')
       - Override `canActivate()`:
         ```typescript
         canActivate(context: ExecutionContext) {
           // Check for @Public() decorator — skip auth entirely
           const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
             context.getHandler(),
             context.getClass(),
           ]);
           if (isPublic) return true;

           // Run Passport JWT strategy
           return super.canActivate(context);
         }
         ```
       - Override `handleRequest()` for better error messages:
         ```typescript
         handleRequest(err, user, info) {
           if (err || !user) {
             if (info?.name === 'TokenExpiredError') {
               throw new UnauthorizedException('Token expired — use refresh token');
             }
             if (info?.name === 'JsonWebTokenError') {
               throw new UnauthorizedException('Invalid token');
             }
             throw new UnauthorizedException(err?.message || 'Authentication required');
           }
           return user;
         }
         ```

    4. `decorators/current-user.decorator.ts`:
       - createParamDecorator extracting user from request
       - Type-safe: returns IAuthUser
       - Throws InternalServerError if user not on request (guard didn't run)

    5. `decorators/public.decorator.ts`:
       - SetMetadata('isPublic', true)
       - Used to mark routes that don't require auth

    Export all from shared index.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>JWT guard compiles. Checks blacklist + tokenVersion (with cache). @Public() skips auth. @CurrentUser() type-safe. handleRequest gives clear error messages.</done>
</task>

<task type="auto">
  <name>Implement RolesGuard and PermissionsGuard as per-route guards (NOT global)</name>
  <files>libs/shared/src/guards/roles.guard.ts, libs/shared/src/guards/permissions.guard.ts, libs/shared/src/decorators/roles.decorator.ts, libs/shared/src/decorators/permissions.decorator.ts</files>
  <action>
    **CRITICAL: These guards are per-route, NOT APP_GUARD. They DEPEND on JwtAuthGuard having already populated request.user.**

    1. `decorators/roles.decorator.ts`:
       - @Roles(Role.ADMIN, Role.ORGANIZER) — SetMetadata('roles', roles)
       - Export Role enum: STUDENT, ORGANIZER, ADMIN

    2. `guards/roles.guard.ts`:
       - Implements CanActivate
       - **MUST verify user exists on request** (guards against misconfiguration):
         ```typescript
         canActivate(context: ExecutionContext): boolean {
           const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
             context.getHandler(),
             context.getClass(),
           ]);

           // If no @Roles() decorator, allow access (no role restriction)
           if (!requiredRoles || requiredRoles.length === 0) {
             return true;
           }

           const request = context.switchToHttp().getRequest();
           const user: IAuthUser = request.user;

           // SAFETY CHECK: If user is not on request, JwtAuthGuard didn't run
           // This means either:
           // a) @Public() is on the route but @Roles() is also on it (contradiction)
           // b) Guard order is wrong
           if (!user) {
             this.logger.error(
               'RolesGuard: request.user is undefined. ' +
               'JwtAuthGuard must run BEFORE RolesGuard. ' +
               'Check guard registration order or remove @Public() from this route.'
             );
             throw new ForbiddenException('Authorization configuration error');
           }

           const hasRole = requiredRoles.some((role) => user.roles.includes(role));
           if (!hasRole) {
             throw new ForbiddenException(
               `Access denied. Required roles: [${requiredRoles.join(', ')}]. Your roles: [${user.roles.join(', ')}]`
             );
           }
           return true;
         }
         ```

    3. `decorators/permissions.decorator.ts`:
       - @Permissions('event:create', 'booking:manage') — SetMetadata('permissions', perms)

    4. `guards/permissions.guard.ts`:
       - Same pattern as RolesGuard but checks user.permissions
       - Same safety check for undefined user
       - Uses `Array.every()` — ALL listed permissions must be present (AND logic)
       - Provide clear error: "Missing permissions: [event:create]"

    5. Create `decorators/auth.decorator.ts` — **convenience composite decorator**:
       ```typescript
       // Instead of stacking 3 decorators manually:
       // @UseGuards(RolesGuard, PermissionsGuard)
       // @Roles(Role.ADMIN)
       // @Permissions('admin:manage-users')

       // Use a single composite:
       export function Auth(...roles: Role[]) {
         return applyDecorators(
           UseGuards(RolesGuard),
           Roles(...roles),
         );
       }

       export function AuthWithPermissions(roles: Role[], permissions: string[]) {
         return applyDecorators(
           UseGuards(RolesGuard, PermissionsGuard),
           Roles(...roles),
           Permissions(...permissions),
         );
       }

       // Usage:
       @Auth(Role.ADMIN)
       @Get('admin/users')
       getUsers() {}
       ```

    Export all from shared index.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>RolesGuard and PermissionsGuard compile as per-route guards. Safety check for undefined user. Composite @Auth() decorator works. Clear error messages.</done>
</task>

<task type="auto">
  <name>Implement rate limiting and register global guards in CORRECT order</name>
  <files>libs/shared/src/guards/rate-limit.guard.ts, libs/shared/src/decorators/rate-limit.decorator.ts, apps/api-gateway/src/app/app.module.ts, apps/api-gateway/src/main.ts</files>
  <action>
    Install: `pnpm add helmet @nestjs/throttler`

    1. Create `guards/rate-limit.guard.ts`:
       - Custom guard using RedisService for distributed rate limiting
       - Key pattern: `rate-limit:{ip}:{route}`
       - Default: 100 req/min/IP
       - Use @RateLimit(limit, windowSeconds) decorator for per-route config
       - Return 429 Too Many Requests with Retry-After header
       - Check for @Public() — rate limit applies to ALL routes including public ones

    2. Create `decorators/rate-limit.decorator.ts`:
       - @RateLimit(limit, windowSeconds) — SetMetadata
       - Pre-built presets:
         - @LoginRateLimit() — 5 attempts / 15min / IP
         - @StrictRateLimit() — 10 req / min / IP (for sensitive operations)

    3. **Register global APP_GUARDs in CORRECT order** in `apps/api-gateway/src/app/app.module.ts`:
       ```typescript
       import { APP_GUARD } from '@nestjs/core';

       @Module({
         providers: [
           // ⚠️ ORDER IS EXECUTION ORDER — DO NOT REARRANGE
           //
           // 1st: Rate limiting — cheapest check, blocks abusive IPs
           //      before wasting CPU on JWT validation or DB queries
           { provide: APP_GUARD, useClass: RateLimitGuard },
           //
           // 2nd: JWT Authentication — validates token, checks blacklist,
           //      checks tokenVersion, populates request.user
           //      Skips if route has @Public() decorator
           { provide: APP_GUARD, useClass: JwtAuthGuard },
           //
           // RolesGuard and PermissionsGuard are intentionally NOT here.
           // They are per-route via @UseGuards() or @Auth() decorator.
           // Making them global would require @Roles() on EVERY route.
         ],
       })
       ```

    4. Update `apps/api-gateway/src/main.ts`:
       - Configure CORS with:
         - Specific allowed origins (env var CORS_ORIGINS, split by comma)
         - credentials: true
         - Allowed methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
         - Allowed headers: Content-Type, Authorization, X-Request-ID, X-Correlation-ID

    Export rate limit guard and decorator from shared.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>Rate limiting compiles with Redis backing. APP_GUARDs registered in correct order: RateLimit → JwtAuth. RolesGuard/PermissionsGuard are per-route only. CORS configured.</done>
</task>

## Success Criteria
- [ ] JWT AuthGuard checks Redis blacklist AND tokenVersion (with DB/cache lookup)
- [ ] JWT AuthGuard gives distinct error messages: expired vs invalid vs revoked
- [ ] @Public() decorator skips JWT auth entirely
- [ ] RolesGuard and PermissionsGuard are PER-ROUTE guards (NOT global APP_GUARD)
- [ ] RolesGuard throws ForbiddenException with clear "Required vs Your roles" message
- [ ] RolesGuard has safety check: if `request.user` is undefined, logs config error and throws
- [ ] PermissionsGuard uses AND logic — all listed permissions required
- [ ] Composite @Auth(Role.ADMIN) decorator combines @UseGuards + @Roles in one
- [ ] Global APP_GUARD order is: RateLimitGuard (1st) → JwtAuthGuard (2nd), no others
- [ ] Rate limiting uses Redis for distributed state, stricter preset for login
- [ ] CORS allows X-Request-ID and X-Correlation-ID headers
</action>
