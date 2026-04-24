---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Infrastructure + Auth Module Skeleton

## Objective
Create Docker Compose for PostgreSQL/MongoDB/Redis, secure `.env` configuration with Joi validation, shared libs for database connections (with timeout/keepalive) and Redis (with connection retry + ping timeout), global ConfigModule, structured logging, health check endpoint, global validation pipe, request ID middleware, graceful shutdown hooks, and the base auth module structure inside `user-auth-service`.

## Context
- .gsd/SPEC.md
- .gsd/DECISIONS.md
- apps/user-auth-service/src/main.ts

## Tasks

<task type="auto">
  <name>Create Docker Compose, .env with validation, and global ConfigModule</name>
  <files>docker-compose.yml, .env, .env.example, .gitignore, libs/shared/src/config/env.validation.ts, libs/shared/src/config/config.module.ts</files>
  <action>
    Install: `pnpm add joi @nestjs/config`

    1. Create `docker-compose.yml` at workspace root with:
       - PostgreSQL 15-alpine on port 5432, healthcheck with pg_isready
       - MongoDB 6-jammy on port 27017, root auth enabled
       - Redis 7-alpine on port 6379, requirepass enabled
       - Named volumes for data persistence
       - restart: unless-stopped on all services

    2. Create `.env` at root with ALL secrets:
       - NODE_ENV=development
       - POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT
       - MONGO_USER, MONGO_PASSWORD, MONGO_DB, MONGO_HOST, MONGO_PORT
       - REDIS_PASSWORD, REDIS_HOST, REDIS_PORT
       - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRATION=15m, JWT_REFRESH_EXPIRATION=7d
       - UNIVERSITY_EMAIL_DOMAIN=university.edu
       - CORS_ORIGINS=http://localhost:3000
       - LOG_LEVEL=debug

    3. Create `.env.example` mirroring .env with placeholder values (NO real secrets).

    4. Ensure `.env` is in `.gitignore` (add if missing).

    5. Create `libs/shared/src/config/env.validation.ts`:
       - Use Joi to define a STRICT validation schema for ALL env vars
       - Every var must be validated: string, number, enum (NODE_ENV), required
       - FAIL FAST on startup if any env var is missing or invalid
       - Export the validationSchema

    6. Create `libs/shared/src/config/config.module.ts`:
       - A global NestJS module wrapping ConfigModule.forRoot with:
         - isGlobal: true
         - envFilePath: path.resolve to workspace root .env
         - validationSchema from env.validation.ts
         - validationOptions: { abortEarly: true, allowUnknown: true }
       - Export this as `AppConfigModule` for all services to import once in their root AppModule
  </action>
  <verify>docker compose config --quiet 2>&1; if ($LASTEXITCODE -eq 0) { "PASS" } else { "docker not available — config file valid by inspection" }</verify>
  <done>.env exists. Joi validation schema rejects missing/malformed vars at startup. docker-compose.yml valid. .env gitignored.</done>
</task>

<task type="auto">
  <name>Create shared database and Redis library with production guards</name>
  <files>libs/shared/src/index.ts, libs/shared/src/database/postgres.module.ts, libs/shared/src/database/mongo.module.ts, libs/shared/src/redis/redis.module.ts, libs/shared/src/redis/redis.service.ts</files>
  <action>
    Generate an Nx library: `pnpm exec nx g @nx/js:lib shared --directory=libs/shared --importPath=@sabs/shared`

    Inside libs/shared/src create:

    1. `database/postgres.module.ts` — A dynamic NestJS module wrapping TypeOrmModule.forRootAsync:
       - Read POSTGRES_* from ConfigService
       - **CRITICAL**: `synchronize` MUST be gated by NODE_ENV:
         ```typescript
         synchronize: configService.get('NODE_ENV') === 'development',
         // NEVER true in production — use migrations instead
         ```
       - ssl: configService.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false
       - logging: configService.get('NODE_ENV') === 'development'
       - autoLoadEntities: true
       - retryAttempts: 5
       - retryDelay: 3000
       - **Timeout + KeepAlive** — add `extra` options to prevent idle connection drops:
         ```typescript
         extra: {
           connectionTimeoutMillis: 5000,   // fail fast if PG unreachable
           idleTimeoutMillis: 30000,         // close idle connections after 30s
           max: 20,                          // connection pool max
           keepAlive: true,                  // TCP keepalive to prevent firewall drops
           keepAliveInitialDelayMillis: 10000,
         },
         ```
       - Export the module.

    2. `database/mongo.module.ts` — A dynamic NestJS module wrapping MongooseModule.forRootAsync:
       - Build connection URI from MONGO_* env vars via ConfigService
       - connectionFactory: add error/connected event listeners for logging
       - retryAttempts: 5
       - retryDelay: 3000
       - Export the module.

    3. `redis/redis.module.ts` — A global NestJS module providing `REDIS_CLIENT` injection token:
       - Use `ioredis` to create a Redis instance
       - **Connection retry strategy** — configure `retryStrategy` in ioredis options:
         ```typescript
         retryStrategy(times: number) {
           const delay = Math.min(times * 500, 5000); // exponential backoff, max 5s
           logger.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
           if (times > 10) {
             logger.error('Redis max retries reached. Giving up.');
             return null; // stop retrying
           }
           return delay;
         }
         ```
       - Add `error`, `connect`, `ready`, `close` event listeners with Logger
       - enableReadyCheck: true
       - maxRetriesPerRequest: 3
       - **connectTimeout: 5000** — fail fast if Redis is unreachable on startup
       - **commandTimeout: 3000** — prevent hanging on slow Redis commands
       - Export the provider.

    4. `redis/redis.service.ts` — A service wrapping the Redis client with typed methods:
       - `get(key)`, `set(key, value, ttlSeconds?)`, `del(key)`, `exists(key)`
       - `setWithExpiry(key, value, ttlSeconds)` for token blacklisting
       - `increment(key)` and `expire(key, ttlSeconds)` for rate limiting
       - `ping()` — for health checks with **timeout protection**:
         ```typescript
         async ping(): Promise<boolean> {
           try {
             const result = await Promise.race([
               this.client.ping(),
               new Promise((_, reject) =>
                 setTimeout(() => reject(new Error('Redis ping timeout')), 2000)
               ),
             ]);
             return result === 'PONG';
           } catch (err) {
             this.logger.error(`Redis ping failed: ${err.message}`);
             return false;
           }
         }
         ```
       - Wrap all methods in try/catch with structured logging on failure

    5. `index.ts` — barrel export all modules and services.

    Update `tsconfig.base.json` paths to map `@sabs/shared` to `libs/shared/src/index.ts`.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>Shared library compiles. synchronize is env-gated. Redis has retry strategy. @sabs/shared path resolves.</done>
</task>

<task type="auto">
  <name>Create auth module skeleton with health check, metrics, security hardening, validation pipe, request ID, and graceful shutdown</name>
  <files>apps/user-auth-service/src/auth/auth.module.ts, apps/user-auth-service/src/auth/auth.controller.ts, apps/user-auth-service/src/auth/auth.service.ts, apps/user-auth-service/src/health/health.controller.ts, apps/user-auth-service/src/health/health.module.ts, apps/user-auth-service/src/metrics/metrics.controller.ts, apps/user-auth-service/src/metrics/metrics.module.ts, libs/shared/src/middleware/request-id.middleware.ts, apps/user-auth-service/src/app/app.module.ts, apps/user-auth-service/src/main.ts</files>
  <action>
    Install: `pnpm add @nestjs/terminus class-validator class-transformer uuid helmet compression express-prom-bundle prom-client`
    Install dev: `pnpm add -D @types/uuid @types/compression`

    Inside `apps/user-auth-service/src/` create:

    1. `health/health.controller.ts` — Health check endpoint:
       - GET /health — @Public() decorated, no auth required
       - Returns JSON with:
         - status: 'ok' | 'error'
         - postgres: connection state (use TypeORM DataSource.isInitialized)
         - mongodb: connection state (use mongoose.connection.readyState)
         - redis: connection state (use RedisService.ping())
         - uptime: process.uptime()
         - timestamp: new Date().toISOString()
       - Use @nestjs/terminus HealthCheckService with TypeOrmHealthIndicator, MongooseHealthIndicator
       - Return 200 if all healthy, 503 if any service down

    2. `health/health.module.ts` — Module importing TerminusModule, TypeOrmModule, MongooseModule, RedisModule

    3. `auth/auth.module.ts` — NestJS module importing:
       - AppConfigModule from @sabs/shared (global config with env validation)
       - PostgresModule, MongoModule, RedisModule from @sabs/shared
       - Declare AuthController and AuthService

    4. `auth/auth.controller.ts` — Empty controller with placeholder routes:
       - POST /auth/register
       - POST /auth/login
       - POST /auth/refresh
       - POST /auth/logout
       All returning `{ message: 'Not implemented' }` with 501 status.
       - Use NestJS Logger for each request: `this.logger.log('Register request received')`

    5. `auth/auth.service.ts` — Empty injectable service with method stubs matching each endpoint. Use NestJS Logger.

    6. **Request ID / Correlation ID Middleware** — Create `libs/shared/src/middleware/request-id.middleware.ts`:
       - NestJS middleware implementing NestMiddleware
       - On every request:
         - Check for incoming `X-Request-ID` header (from upstream proxy/gateway)
         - Also check `X-Correlation-ID` for distributed tracing across microservices
         - If missing, generate one using `uuid.v4()`
         - Attach to `req.requestId` and `req.correlationId`
         - Set `X-Request-ID` and `X-Correlation-ID` response headers
         - **Correlation ID in ALL logs**: Attach to NestJS Logger context so every log line for that request includes `[requestId=<uuid>]`
         - When forwarding requests to other microservices, pass `X-Correlation-ID` header to maintain the trace chain
       - Export from @sabs/shared barrel
       - Apply globally via `app.module.ts` using `configure(consumer) { consumer.apply(RequestIdMiddleware).forRoutes('*') }`

    7. **Prometheus Metrics Endpoint** — Create `apps/user-auth-service/src/metrics/`:
       - `metrics.controller.ts`:
         - GET /metrics — @Public(), returns Prometheus-formatted text
         - Uses `prom-client` default registry
         - Exposes: http_request_duration_seconds, http_requests_total, nodejs_heap_size_bytes, etc.
       - `metrics.module.ts` — imports prom-client
       - In `main.ts`, register `express-prom-bundle` middleware:
         ```typescript
         import promBundle from 'express-prom-bundle';
         app.use(promBundle({
           includeMethod: true,
           includePath: true,
           includeStatusCode: true,
           promClient: { collectDefaultMetrics: {} },
         }));
         ```
       - This auto-collects HTTP request metrics with zero code changes per route

    8. Update `app.module.ts`:
       - Import AuthModule, HealthModule, and MetricsModule
       - Implement NestModule interface, apply RequestIdMiddleware globally
       - Remove default AppController and AppService if they only serve hello-world

    9. Update `main.ts` — HYBRID app with full production hardening:
       ```typescript
       import helmet from 'helmet';
       import compression from 'compression';
       import { json, urlencoded } from 'express';
       import promBundle from 'express-prom-bundle';

       const app = await NestFactory.create(AppModule, {
         logger: ['error', 'warn', 'log', 'debug', 'verbose'],
       });

       // --- Security Headers (Helmet) ---
       app.use(helmet({
         contentSecurityPolicy: process.env.NODE_ENV === 'production',
         crossOriginEmbedderPolicy: false, // allow embedding in dev
       }));

       // --- Compression (gzip) ---
       app.use(compression({
         threshold: 1024, // only compress responses > 1KB
       }));

       // --- Request Body Size Limit ---
       app.use(json({ limit: '10kb' }));        // JSON payloads max 10KB
       app.use(urlencoded({ extended: true, limit: '10kb' }));

       // --- Global API Prefix ---
       app.setGlobalPrefix('api/v1', {
         exclude: ['health', 'metrics'], // health + metrics stay at root
       });

       // --- Prometheus Metrics Middleware ---
       app.use(promBundle({
         includeMethod: true,
         includePath: true,
         includeStatusCode: true,
         promClient: { collectDefaultMetrics: {} },
       }));

       // --- Global Validation Pipe ---
       app.useGlobalPipes(new ValidationPipe({
         whitelist: true,             // strip properties not in DTO
         forbidNonWhitelisted: true,  // throw on unknown properties
         transform: true,             // auto-transform payloads to DTO instances
         transformOptions: {
           enableImplicitConversion: true,
         },
         disableErrorMessages: process.env.NODE_ENV === 'production',
       }));

       // --- Microservice ---
       app.connectMicroservice<MicroserviceOptions>({
         transport: Transport.TCP,
         options: { host: '0.0.0.0', port: 3011 },
       });

       // --- Graceful Shutdown ---
       app.enableShutdownHooks();
       process.on('SIGTERM', () => {
         Logger.log('SIGTERM received — shutting down gracefully...', 'Bootstrap');
       });
       process.on('SIGINT', () => {
         Logger.log('SIGINT received — shutting down gracefully...', 'Bootstrap');
       });

       await app.startAllMicroservices();
       await app.listen(3001);
       Logger.log('🚀 User Auth Service — HTTP :3001 | TCP :3011', 'Bootstrap');
       Logger.log('📊 Metrics available at /metrics', 'Bootstrap');
       Logger.log('💚 Health check at /health', 'Bootstrap');
       ```

    10. **Circuit Breaker (Future-Ready)**:
        - Add a TODO comment block in `libs/shared/src/resilience/README.md`:
          ```
          # Circuit Breaker — Future Implementation
          When inter-service calls are added (API Gateway -> Auth, Auth -> Event, etc.),
          implement circuit breaker using `opossum` or `@nestjs/axios` with interceptors.
          Pattern: CLOSED -> OPEN (after N failures) -> HALF-OPEN (probe) -> CLOSED
          This prevents cascading failures across microservices.
          NOT implemented in Phase 2 — no inter-service calls yet.
          ```
        - This is a placeholder. Actual implementation happens when RabbitMQ/inter-service communication is added.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>user-auth-service builds. Helmet + compression + 10KB body limit active. Global prefix api/v1. Health at /health, metrics at /metrics. Global ValidationPipe. Request ID + Correlation ID on every request/log. Graceful shutdown. Hybrid HTTP+TCP mode.</done>
</task>

## Success Criteria
- [ ] Docker Compose, .env, and .env.example exist with correct infrastructure
- [ ] Joi env validation FAILS FAST if any required var is missing
- [ ] synchronize is NEVER true in production (gated by NODE_ENV)
- [ ] PostgreSQL has connectionTimeout (5s), idleTimeout (30s), keepAlive, pool max (20)
- [ ] Redis has exponential backoff retry strategy with max 10 attempts
- [ ] Redis has connectTimeout (5s) and commandTimeout (3s)
- [ ] Redis ping() has 2s timeout protection — never hangs health checks
- [ ] ConfigModule is global — imported once, available everywhere
- [ ] GET /health returns postgres, mongodb, redis connection states
- [ ] GET /metrics returns Prometheus-formatted metrics (request duration, counts, heap)
- [ ] Helmet sets security headers (CSP, X-Frame-Options, etc.)
- [ ] Compression enabled for responses > 1KB
- [ ] Request body limited to 10KB (prevents payload DoS)
- [ ] Global prefix api/v1 on all routes except /health and /metrics
- [ ] Global ValidationPipe strips unknown fields, throws on non-whitelisted, auto-transforms
- [ ] Every request has X-Request-ID + X-Correlation-ID headers (generated or forwarded)
- [ ] Correlation ID appears in ALL log lines for distributed tracing
- [ ] Graceful shutdown via enableShutdownHooks() — closes DB pools and Redis on SIGTERM/SIGINT
- [ ] Circuit breaker documented as future TODO with implementation guide
- [ ] Structured logging with NestJS Logger in all services
- [ ] @sabs/shared library compiles and exports all modules
- [ ] user-auth-service builds with auth module skeleton and hybrid mode
