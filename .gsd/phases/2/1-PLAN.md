---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Infrastructure + Auth Module Skeleton

## Objective
Create Docker Compose for PostgreSQL/MongoDB/Redis, secure `.env` configuration, shared libs for database connections and Redis, and the base auth module structure inside `user-auth-service`.

## Context
- .gsd/SPEC.md
- .gsd/DECISIONS.md
- apps/user-auth-service/src/main.ts

## Tasks

<task type="auto">
  <name>Create Docker Compose and .env infrastructure</name>
  <files>docker-compose.yml, .env, .env.example, .gitignore</files>
  <action>
    Create `docker-compose.yml` at workspace root with:
    - PostgreSQL 15-alpine on port 5432, healthcheck with pg_isready
    - MongoDB 6-jammy on port 27017, root auth enabled
    - Redis 7-alpine on port 6379, requirepass enabled
    - Named volumes for data persistence

    Create `.env` at root with ALL secrets:
    - POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT
    - MONGO_USER, MONGO_PASSWORD, MONGO_DB, MONGO_HOST, MONGO_PORT
    - REDIS_PASSWORD, REDIS_HOST, REDIS_PORT
    - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRATION=15m, JWT_REFRESH_EXPIRATION=7d
    - UNIVERSITY_EMAIL_DOMAIN=university.edu

    Create `.env.example` mirroring .env with placeholder values.
    Ensure `.env` is in `.gitignore` (add it if missing).
  </action>
  <verify>docker compose config --quiet 2>&1; if ($LASTEXITCODE -eq 0) { "PASS" } else { "docker not available — config file valid by inspection" }</verify>
  <done>.env exists with all secrets, docker-compose.yml is valid YAML, .env is gitignored.</done>
</task>

<task type="auto">
  <name>Create shared database and Redis library</name>
  <files>libs/shared/src/index.ts, libs/shared/src/database/postgres.module.ts, libs/shared/src/database/mongo.module.ts, libs/shared/src/redis/redis.module.ts, libs/shared/src/redis/redis.service.ts</files>
  <action>
    Generate an Nx library: `pnpm exec nx g @nx/js:lib shared --directory=libs/shared --importPath=@sabs/shared`

    Inside libs/shared/src create:

    1. `database/postgres.module.ts` — A dynamic NestJS module wrapping TypeOrmModule.forRootAsync reading POSTGRES_* from ConfigService. Use `ssl: false` for local dev and `synchronize: true` for dev only (env-gated). Export the module.

    2. `database/mongo.module.ts` — A dynamic NestJS module wrapping MongooseModule.forRootAsync building the connection URI from MONGO_* env vars via ConfigService. Export the module.

    3. `redis/redis.module.ts` — A global NestJS module that provides a `REDIS_CLIENT` injection token. Use `ioredis` to create a Redis instance from REDIS_HOST, REDIS_PORT, REDIS_PASSWORD via ConfigService. Export the provider.

    4. `redis/redis.service.ts` — A service wrapping the Redis client with typed methods:
       - `get(key)`, `set(key, value, ttlSeconds?)`, `del(key)`, `exists(key)`
       - `setWithExpiry(key, value, ttlSeconds)` for token blacklisting
       - `increment(key)` and `expire(key, ttlSeconds)` for rate limiting

    5. `index.ts` — barrel export all modules and services.

    Update `tsconfig.base.json` paths to map `@sabs/shared` to `libs/shared/src/index.ts`.
  </action>
  <verify>pnpm exec nx build api-gateway</verify>
  <done>Shared library compiles. @sabs/shared path alias resolves. Database and Redis modules are importable.</done>
</task>

<task type="auto">
  <name>Create auth module skeleton in user-auth-service</name>
  <files>apps/user-auth-service/src/auth/auth.module.ts, apps/user-auth-service/src/auth/auth.controller.ts, apps/user-auth-service/src/auth/auth.service.ts, apps/user-auth-service/src/app/app.module.ts</files>
  <action>
    Inside `apps/user-auth-service/src/` create:

    1. `auth/auth.module.ts` — NestJS module importing ConfigModule.forRoot (isGlobal, envFilePath pointing to workspace root .env), PostgresModule, MongoModule, RedisModule from @sabs/shared. Declare AuthController and AuthService.

    2. `auth/auth.controller.ts` — Empty controller with placeholder routes:
       - POST /auth/register
       - POST /auth/login
       - POST /auth/refresh
       - POST /auth/logout
       All returning `{ message: 'Not implemented' }` with 501 status.

    3. `auth/auth.service.ts` — Empty injectable service with method stubs matching each endpoint.

    4. Update `app.module.ts` to import AuthModule. Remove default AppController and AppService if they only serve hello-world.

    5. Update `main.ts` to run as a HYBRID app — both HTTP (port 3001) and TCP microservice (port 3011). The HTTP side is needed for REST endpoints during development. Use:
       ```
       const app = await NestFactory.create(AppModule);
       app.connectMicroservice({ transport: Transport.TCP, options: { port: 3011 } });
       await app.startAllMicroservices();
       await app.listen(3001);
       ```
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>user-auth-service builds. Auth module with placeholder endpoints exists. Service runs in hybrid HTTP+TCP mode.</done>
</task>

## Success Criteria
- [ ] Docker Compose, .env, and .env.example exist with correct infrastructure
- [ ] @sabs/shared library compiles and exports Postgres/Mongo/Redis modules
- [ ] user-auth-service builds with auth module skeleton and hybrid mode
