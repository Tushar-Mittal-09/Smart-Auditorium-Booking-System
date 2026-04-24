---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Monorepo & Gateway Initialization

## Objective
Initialize the Nx monorepo and create the shared `API Gateway` using NestJS to proxy external requests to the microservices.

## Context
- .gsd/SPEC.md
- .gsd/DECISIONS.md

## Tasks

<task type="auto">
  <name>Initialize Nx Monorepo</name>
  <files>package.json, nx.json</files>
  <action>
    Initialize an Nx workspace for a Node.js project using `npx create-nx-workspace@latest sabs-workspace --preset=apps`.
    Move the generated workspace contents to the root directory `D:\Auditorium`.
    Install `@nestjs/cli`, `@nestjs/microservices`, and `@nestjs/core` as dependencies.
  </action>
  <verify>npx nx --version</verify>
  <done>Nx is initialized and NestJS is installed.</done>
</task>

<task type="auto">
  <name>Create API Gateway application</name>
  <files>apps/api-gateway/src/main.ts, apps/api-gateway/src/app.module.ts</files>
  <action>
    Use Nx to generate a new NestJS application named `api-gateway`.
    Configure it to start on port 3000.
    Set up basic global prefix `"api"`.
  </action>
  <verify>npx nx build api-gateway</verify>
  <done>The api-gateway NestJS app compiles successfully.</done>
</task>

## Success Criteria
- [ ] Nx workspace is functional
- [ ] API gateway builds successfully
