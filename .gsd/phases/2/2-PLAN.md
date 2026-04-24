---
phase: 2
plan: 2
wave: 1
---

# Plan 2.2: Database Schema — PostgreSQL RBAC + MongoDB Sessions

## Objective
Create the complete database schema for RBAC in PostgreSQL (users, roles, permissions, join tables) and session/audit collections in MongoDB with proper indexes.

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
       - mfa_secret: string (nullable) — encrypted TOTP secret
       - google_id: string (nullable, unique) — for OAuth linking
       - is_active: boolean (default true)
       - created_at, updated_at: timestamps
       - ManyToMany relation to Role via `user_roles` join table

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

    Use `@JoinTable()` decorators on the owning side. Add proper indexes on email, google_id, role name, permission name.
    Create barrel export `entities/index.ts`.
    Register all entities in the TypeORM module configuration.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>All TypeORM entities compile. Relations defined. Indexes specified.</done>
</task>

<task type="auto">
  <name>Create MongoDB session and audit schemas</name>
  <files>apps/user-auth-service/src/schemas/session.schema.ts, apps/user-auth-service/src/schemas/login-attempt.schema.ts, apps/user-auth-service/src/schemas/audit-log.schema.ts</files>
  <action>
    Create Mongoose schemas:

    1. `session.schema.ts` — Collection `sessions`:
       - userId: string (indexed)
       - refreshTokenHash: string — bcrypt hash of the refresh token
       - deviceInfo: embedded { userAgent: string, ip: string, device: string }
       - isActive: boolean (default true, indexed)
       - lastUsedAt: Date
       - expiresAt: Date (indexed with TTL — MongoDB auto-deletes)
       - createdAt: Date

    2. `login-attempt.schema.ts` — Collection `login_attempts`:
       - email: string (indexed)
       - ip: string (indexed)
       - success: boolean
       - failureReason: string (nullable)
       - userAgent: string
       - attemptedAt: Date (default now, indexed)
       Create compound index on { ip: 1, attemptedAt: 1 } for brute-force queries.

    3. `audit-log.schema.ts` — Collection `audit_logs`:
       - userId: string (indexed)
       - action: string — LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT, ROLE_CHANGE, MFA_ENABLE, MFA_FAILURE, PASSWORD_RESET, etc.
       - metadata: Schema.Types.Mixed (flexible payload)
       - ip: string
       - userAgent: string
       - timestamp: Date (default now, indexed)

    Create barrel export `schemas/index.ts`.
    Register schemas in AuthModule using MongooseModule.forFeature.
  </action>
  <verify>pnpm exec nx build user-auth-service</verify>
  <done>All Mongoose schemas compile. Indexes defined. Schemas registered in AuthModule.</done>
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
- [ ] MongoDB schemas for sessions, login_attempts, audit_logs with TTL and compound indexes
- [ ] Seed service creates default RBAC data idempotently
