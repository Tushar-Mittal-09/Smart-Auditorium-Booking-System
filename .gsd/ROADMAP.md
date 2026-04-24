# ROADMAP.md

> **Current Phase**: Phase 2
> **Milestone**: v1.0 (MVP)

## Must-Haves (from SPEC)
- [ ] Concurrent-safe booking with 5min lock
- [ ] QR-based entry validation
- [ ] Event lifecycle management
- [ ] Basic waitlist FIFO
- [ ] Enterprise-grade authentication & authorization

## Phases

### Phase 1: Foundation & Core Services
**Status**: ✅ Complete
**Objective**: Establish the microservice backbone and user authentication.
**Requirements**: USR-01, SYS-01
**Deliverable**: Shared auth service, project scaffolding, and environment setup.

### Phase 2: Authentication & Authorization
**Status**: 🔄 In Progress
**Objective**: Build enterprise-grade auth with JWT rotation, RBAC, MFA, session management, and security hardening.
**Requirements**: USR-01, SYS-01
**Deliverable**: Complete auth system with registration, login, token rotation, RBAC guards, rate limiting, MFA, and audit logging.

### Phase 3: Booking Engine & Concurrency
**Status**: ⬜ Not Started
**Objective**: Implement the high-concurrency seat booking and reservation logic.
**Requirements**: BOK-01, BOK-02, COM-01
**Deliverable**: Working seat map with Redis locks and Real-time updates.

### Phase 4: Waitlist & Life Cycle
**Status**: ⬜ Not Started
**Objective**: Automate the waitlist and event state transitions.
**Requirements**: WTL-01, EVT-01
**Deliverable**: Fully automated FIFO promotion and event state machine.

### Phase 5: Entry Validation & QR
**Status**: ⬜ Not Started
**Objective**: Implement secure QR generation and scanning logic.
**Requirements**: VAL-01, PAY-01
**Deliverable**: Booking-to-Entry workflow with payment integration.

### Phase 6: Face Recognition & Analytics
**Status**: ⬜ Not Started
**Objective**: Implement biometric entry and the dashboard.
**Requirements**: VAL-02, ANA-01
**Deliverable**: Face ID entry fallback and live analytics dashboard.
