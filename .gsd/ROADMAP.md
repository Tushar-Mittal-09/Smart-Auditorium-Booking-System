# ROADMAP.md

> **Current Phase**: Phase 2
> **Milestone**: v1.0 (MVP)

## Must-Haves (from SPEC + PRD)
- [ ] Concurrent-safe booking with 5min lock
- [ ] QR-based entry validation
- [ ] Event lifecycle management
- [ ] Basic waitlist FIFO
- [ ] Enterprise-grade authentication & authorization
- [ ] Search & discovery (Elasticsearch)
- [ ] Notification system (Email/SMS)
- [ ] AI predictive analytics & fraud detection
- [ ] Personalized recommendation engine
- [ ] Generative AI (LLM) & RAG chatbot
- [ ] Agentic AI automation layer
- [ ] Observability & production hardening

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

---

### Phase 7: Search & Discovery + Notifications
**Status**: ⬜ Not Started
**Objective**: Implement Elasticsearch-powered event search with filters/ranking, and a multi-channel notification system (email/SMS) with AI-optimized send timing.
**Depends on**: Phase 4 (Event lifecycle), Phase 2 (Auth)
**Requirements**: SRH-01, NTF-01

**Tasks**:
- [ ] TBD (run /plan 7 to create)

**Verification**:
- Full-text event search with < 100ms latency
- Email/SMS delivery with retry and templating
- Notification preferences respected per user

---

### Phase 8: Predictive Analytics & Fraud Detection
**Status**: ⬜ Not Started
**Objective**: Build the data science foundation — ML models for attendance prediction, no-show forecasting, peak booking analysis, and bot/fraud detection.
**Depends on**: Phase 6 (Analytics dashboard), Phase 3 (Booking data)
**Requirements**: AI-PA-01, AI-FD-01

**Tasks**:
- [ ] TBD (run /plan 8 to create)

**Verification**:
- Attendance prediction accuracy > 85%
- Fraud detection flags bot patterns with < 5% false positives
- Analytics pipeline processes historical data end-to-end

---

### Phase 9: Recommendation Engine
**Status**: ⬜ Not Started
**Objective**: Implement personalized event recommendations, seat suggestions (group seating optimization), and time-based recommendations using collaborative and content-based filtering.
**Depends on**: Phase 8 (Analytics data), Phase 3 (Booking history)
**Requirements**: AI-REC-01

**Tasks**:
- [ ] TBD (run /plan 9 to create)

**Verification**:
- Personalized recommendations served per user
- Seat optimization reduces fragmentation by > 30%
- Recommendation CTR measurable via analytics

---

### Phase 10: Generative AI & RAG Chatbot
**Status**: ⬜ Not Started
**Objective**: Integrate LLM capabilities — auto-generate event descriptions, build a RAG-powered chatbot that answers user queries using real event data, and provide query-based booking assistance.
**Depends on**: Phase 7 (Search/Elasticsearch), Phase 9 (Recommendations)
**Requirements**: AI-LLM-01, AI-RAG-01

**Tasks**:
- [ ] TBD (run /plan 10 to create)

**Verification**:
- Event descriptions auto-generated from metadata
- RAG chatbot retrieves relevant context and generates accurate answers
- Chatbot response latency < 2s

---

### Phase 11: Agentic AI & Automation
**Status**: ⬜ Not Started
**Objective**: Deploy autonomous AI agents — Booking Agent (auto-book seats), Organizer Agent (schedule optimization), and Admin Agent (anomaly detection/response) — using tool-calling and API orchestration.
**Depends on**: Phase 10 (LLM), Phase 8 (Fraud/Analytics)
**Requirements**: AI-AGT-01

**Tasks**:
- [ ] TBD (run /plan 11 to create)

**Verification**:
- Booking Agent completes end-to-end booking via natural language
- Organizer Agent suggests optimal scheduling with justification
- Admin Agent detects and reports anomalies autonomously

---

### Phase 12: Observability, Scalability & Production Hardening
**Status**: ⬜ Not Started
**Objective**: Production-ready infrastructure — Prometheus/Grafana monitoring, distributed tracing, circuit breakers, auto-scaling policies, CDN integration, and load testing validation.
**Depends on**: All previous phases
**Requirements**: NFR-01, NFR-02

**Tasks**:
- [ ] TBD (run /plan 12 to create)

**Verification**:
- Prometheus metrics and Grafana dashboards live
- Circuit breakers tested under failure conditions
- Load test: 10k concurrent users with < 200ms API latency
- 99.9% uptime target validated
