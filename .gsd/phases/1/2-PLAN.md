---
phase: 1
plan: 2
wave: 1
---

# Plan 1.2: Core Microservices Scaffolding

## Objective
Generate the `User Authentication`, `Event Management`, and `Booking Service` as independent NestJS microservices within the Nx monorepo.

## Context
- .gsd/SPEC.md
- .gsd/DECISIONS.md

## Tasks

<task type="auto">
  <name>Generate User Auth Service</name>
  <files>apps/user-auth-service/src/main.ts</files>
  <action>
    Use Nx to generate a NestJS app named `user-auth-service`.
    Configure it as a microservice using `Transport.TCP` on port 3001.
  </action>
  <verify>npx nx build user-auth-service</verify>
  <done>User auth service compiles successfully.</done>
</task>

<task type="auto">
  <name>Generate Event Service</name>
  <files>apps/event-service/src/main.ts</files>
  <action>
    Use Nx to generate a NestJS app named `event-service`.
    Configure it as a microservice using `Transport.TCP` on port 3002.
  </action>
  <verify>npx nx build event-service</verify>
  <done>Event service compiles successfully.</done>
</task>

<task type="auto">
  <name>Generate Booking Service</name>
  <files>apps/booking-service/src/main.ts</files>
  <action>
    Use Nx to generate a NestJS app named `booking-service`.
    Configure it as a microservice using `Transport.TCP` on port 3003.
  </action>
  <verify>npx nx build booking-service</verify>
  <done>Booking service compiles successfully.</done>
</task>

## Success Criteria
- [ ] All 3 backend microservices build successfully in the Nx workspace.
