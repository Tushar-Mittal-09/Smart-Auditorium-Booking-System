---
phase: 2
plan: 2
wave: 1
---

# Plan 2.2: Database Schema — PostgreSQL RBAC + MongoDB Sessions

## Objective
Create the complete database schema for RBAC in PostgreSQL (users with soft delete, token versioning, login tracking; roles; permissions; join tables) and session/audit collections in MongoDB with proper indexes (TTL, partial, compound). Encrypt sensitive fields at rest.

## Context
- .gsd/SPEC.md
- .gsd/DECISIONS.md
- libs/shared/src/database/postgres.module.ts

## Tasks

<task type="auto">
  <name>Create PostgreSQL RBAC entities with TypeORM</name>
  <files>apps/user-auth-service/src/entities/user.entity.ts, apps/user-auth-service/src/entities/role.entity.ts, apps/user-auth-service/src/entities/permission.entity.ts</files>
  <action>
    Create TypeORM entities:

    1. `user.entity.ts` — Table `users`:
       - id: UUID (PK, generated)
       - email: string (unique, not null)
       - password_hash: string (not null)
       - first_name, last_name: string
       - is_email_verified: boolean (default false)
       - is_mfa_enabled: boolean (default false)
       - mfa_secret: string (nullable) — **MUST be encrypted at rest** (see encryption note below)
       - mfa_backup_codes: string[] (nullable) — stored as argon2 hashes, never plaintext
       - google_id: string (nullable, unique) — for OAuth linking
       - is_active: boolean (default true)
       - **token_version: integer (default 0)** — **CRITICAL**: incremented on password change, logout-all, or security event. Every JWT includes this version. If JWT's tokenVersion < user.token_version, the token is rejected. This is the kill switch for invalidating ALL tokens for a user without touching Redis.
       - **last_login_at: Date (nullable)** — updated on every successful login
       - **last_login_ip: string (nullable)** — IP of most recent login, useful for suspicious activity detection
       - **deleted_at: Date (nullable)** — **SOFT DELETE** column. When set, user is "deleted" but data is preserved for audit compliance. Use TypeORM `@DeleteDateColumn()` decorator which auto-integrates with `softDelete()` and `restore()` methods. All queries automatically exclude soft-deleted rows via TypeORM's built-in filter.
       - created_at, updated_at: timestamps (use `@CreateDateColumn()` and `@UpdateDateColumn()`)
       - ManyToMany relation to Role via `user_roles` join table

       **Encryption for mfa_secret:**
       - Create `libs/shared/src/crypto/encryption.service.ts`:
         - Uses Node.js `crypto` module with AES-256-GCM
         - Reads `ENCRYPTION_KEY` from env (32-byte hex string)
         - `encrypt(plaintext): string` — returns `iv:authTag:ciphertext` as a single string
         - `decrypt(encrypted): string` — splits and decrypts
         - This is FIELD-LEVEL encryption, NOT database-level. The DB stores ciphertext.
       - Add `ENCRYPTION_KEY` to `.env`, `.env.example`, and Joi validation schema
       - Use `@BeforeInsert()` and `@BeforeUpdate()` TypeORM hooks OR a custom transformer to auto-encrypt/decrypt mfa_secret

    2. `role.entity.ts` — Table `roles`:
       - id: UUID (PK, generated)
       - name: string (unique) — STUDENT, ORGANIZER, ADMIN
       - description: string (nullable)
       - is_active: boolean (default true)
       - created_at: timestamp
       - ManyToMany relation to Permission via `role_permissions` join table

    3. `permission.entity.ts` — Table `permissions`:
       - id: UUID (PK, generated)
       - name: string (unique) — e.g. 'event:create', 'booking:manage', 'admin:dashboard'
       - description: string (nullable)
       - resource: string — e.g. 'event', 'booking', 'user', 'admin'
       - action: string — e.g. 'create', 'read', 'update', 'delete', 'manage'
       - created_at: timestamp

    **Indexes:**
    - users.email: UNIQUE
    - users.google_id: UNIQUE (WHERE google_id IS NOT NULL) — partial unique index
    - users.deleted_at: index for soft-delete queries
    - users.is_active + users.deleted_at: compound index for "active non-deleted users" queries
    - roles.name: UNIQUE
    - permissions.name: UNIQUE
    - permissions.resource + permissions.action: compound index

    Use `@JoinTable()` decorators on the owning side.
    Create barrel export `entities/index.ts`.
    Register all entities in the TypeORM module configuration.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>All TypeORM entities compile. Soft delete via @DeleteDateColumn. tokenVersion on user. mfa_secret encrypted with AES-256-GCM. last_login_at/ip tracked. Indexes and relations defined.</done>
</task>

<task type="auto">
  <name>Create MongoDB session and audit schemas</name>
  <files>apps/user-auth-service/src/schemas/session.schema.ts, apps/user-auth-service/src/schemas/login-attempt.schema.ts, apps/user-auth-service/src/schemas/audit-log.schema.ts</files>
  <action>
    Create Mongoose schemas:

    1. `session.schema.ts` — Collection `sessions`:
       - **sessionId: string (UUID v4, unique, indexed)** — **CRITICAL**: The primary identifier for this session. This is what goes into the JWT refresh token payload (`sub: userId, sid: sessionId`). Using MongoDB's `_id` in JWTs leaks internal DB structure. A UUID is opaque, portable, and safe to expose in tokens. Generate via `uuid.v4()` on session creation.
       - userId: string (indexed)
       - **tokenVersion: number** — mirrors the user's tokenVersion at time of session creation. On refresh, compare with current user.token_version. If stale, reject and force re-login.
       - refreshTokenHash: string — **argon2 hash** of the refresh token (NOT bcrypt — argon2 is more resistant to GPU attacks)
       - **refreshTokenFamily: string** — UUID identifying the token chain. On rotation, new token inherits the family. If a token from the same family is reused after rotation, ALL sessions in that family are revoked (token theft detection).
       - deviceInfo: embedded object:
         - userAgent: string — raw user-agent string (for display in "active sessions" UI)
         - **userAgentHash: string** — SHA-256 hash of the user-agent. On every refresh request, hash the incoming user-agent and compare to stored hash. If mismatch, the token may have been stolen and replayed from a different browser/device. Action: log audit (SESSION_FINGERPRINT_MISMATCH), optionally revoke session depending on security policy. This is a lightweight session-binding mechanism.
           ```typescript
           import { createHash } from 'crypto';
           const userAgentHash = createHash('sha256').update(userAgent).digest('hex');
           ```
         - ip: string
         - device: string (parsed from user-agent — e.g. 'Chrome 120 / Windows 11')
         - **location: string (nullable)** — geo-approximation from IP (future enhancement)
       - isActive: boolean (default true)
       - **revokedAt: Date (nullable)** — when the session was explicitly revoked (null = active)
       - **revokedReason: string (nullable)** — 'LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGE', 'TOKEN_THEFT', 'ADMIN_REVOKE', 'FINGERPRINT_MISMATCH'
       - lastUsedAt: Date
       - expiresAt: Date — **TTL index confirmed:**
         ```typescript
         @Prop({ type: Date, index: true, expires: 0 })
         // expires: 0 means MongoDB uses the expiresAt field value itself as expiration time
         // MongoDB TTL monitor runs every 60 seconds and auto-deletes expired docs
         expiresAt: Date;
         ```
       - createdAt: Date

       **Indexes:**
       - `{ sessionId: 1 }` — **unique index** — primary lookup for refresh token validation
       - **Composite index for active user sessions:**
         ```typescript
         SessionSchema.index(
           { userId: 1, isActive: 1, createdAt: -1 }
         );
         // Covers: "list all active sessions for user, newest first"
         // This is the most frequent query (session list page, logout-all, token refresh)
         ```
       - **Partial index for active sessions only (storage-efficient):**
         ```typescript
         SessionSchema.index(
           { userId: 1 },
           { partialFilterExpression: { isActive: true, revokedAt: null } }
         );
         // Much smaller than full index — most sessions are expired/revoked
         ```
       - **Composite index for token family lookups:**
         ```typescript
         SessionSchema.index(
           { refreshTokenFamily: 1, isActive: 1 }
         );
         // Covers: "find all active sessions in this token family" (theft detection)
         ```
       - `{ expiresAt: 1 }` — TTL index (MongoDB auto-deletes)

    2. `login-attempt.schema.ts` — Collection `login_attempts`:
       - email: string (indexed)
       - ip: string (indexed)
       - success: boolean
       - failureReason: string (nullable)
       - userAgent: string
       - attemptedAt: Date (default now, indexed)
       - **TTL index on attemptedAt with expireAfterSeconds: 86400 (24h)** — auto-cleanup old attempts
       Create compound index on { ip: 1, attemptedAt: 1 } for brute-force queries.
       Create compound index on { email: 1, success: 1, attemptedAt: 1 } for per-user failure rate.

    3. `audit-log.schema.ts` — Collection `audit_logs`:
       - userId: string (indexed)
       - action: string — LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, ROLE_CHANGE, MFA_ENABLE, MFA_FAILURE, PASSWORD_RESET, TOKEN_THEFT_DETECTED, etc.
       - metadata: Schema.Types.Mixed (flexible payload)
       - ip: string
       - userAgent: string
       - **correlationId: string (nullable)** — links to X-Correlation-ID from request for distributed tracing
       - timestamp: Date (default now, indexed)
       Create compound index on { userId: 1, action: 1, timestamp: -1 } for user activity queries.

    Create barrel export `schemas/index.ts`.
    Register schemas in AuthModule using MongooseModule.forFeature.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>All Mongoose schemas compile. Session has sessionId (UUID, unique). userAgentHash for session binding. tokenVersion + refreshTokenFamily. TTL index confirmed. Partial + composite indexes optimized. Login attempts auto-cleanup at 24h.</done>
</task>

<task type="auto">
  <name>Create database seed script for default roles and permissions</name>
  <files>apps/user-auth-service/src/database/seed.ts</files>
  <action>
    Create a seed script or NestJS OnModuleInit hook in a SeedService that:

    1. Creates default roles if they don't exist:
       - STUDENT (default for registration)
       - ORGANIZER
       - ADMIN

    2. Creates default permissions:
       - event:read, event:create, event:update, event:delete
       - booking:create, booking:read, booking:manage
       - user:read, user:update
       - admin:dashboard, admin:manage-users, admin:approve-events
       - audit:read

    3. Maps permissions to roles:
       - STUDENT: event:read, booking:create, booking:read, user:read, user:update
       - ORGANIZER: all STUDENT + event:create, event:update, booking:manage
       - ADMIN: all permissions

    Use `upsert` or `INSERT ... ON CONFLICT DO NOTHING` to make it idempotent.
    Register SeedService in AuthModule, run on app bootstrap.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>Seed service compiles. Default RBAC data created on bootstrap. Idempotent — safe to run multiple times.</done>
</task>

## Success Criteria
- [ ] PostgreSQL entities for users, roles, permissions with proper relations and indexes
- [ ] User entity has `deleted_at` soft delete via @DeleteDateColumn — queries auto-exclude deleted rows
- [ ] User entity has `token_version` (integer, default 0) — the global kill switch for token invalidation
- [ ] User entity has `last_login_at` and `last_login_ip` — updated on every successful login
- [ ] `mfa_secret` is encrypted at rest with AES-256-GCM via EncryptionService in @sabs/shared
- [ ] `mfa_backup_codes` stored as argon2 hashes, never plaintext
- [ ] Session has `sessionId` (UUID v4, unique index) — goes into JWT payload, never exposes MongoDB `_id`
- [ ] Session has `userAgentHash` (SHA-256) — compared on refresh to detect token replay from different browser
- [ ] Session has `tokenVersion` mirroring user's version at creation time
- [ ] Session has `refreshTokenFamily` for token theft detection across rotation chain
- [ ] Session has `revokedAt` + `revokedReason` for explicit revocation tracking
- [ ] TTL index on `expiresAt` confirmed with `expires: 0` — MongoDB auto-deletes expired sessions
- [ ] Composite index `{ userId: 1, isActive: 1, createdAt: -1 }` for active session listing
- [ ] Partial index on `{ userId: 1 }` WHERE `isActive=true AND revokedAt=null` — smaller, faster
- [ ] Composite index `{ refreshTokenFamily: 1, isActive: 1 }` for theft detection
- [ ] Login attempts have 24h TTL auto-cleanup
- [ ] Audit logs include `correlationId` for distributed tracing
- [ ] Seed service creates default RBAC data idempotently
