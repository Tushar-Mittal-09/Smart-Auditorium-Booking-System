# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
The Smart Auditorium Booking System (SABS) is a high-concurrency, distributed platform that automates the end-to-end lifecycle of university events, ensuring zero seat conflicts and secure entry через QR and Face Recognition.

## Goals
1. **Strong Consistency**: Zero overbooking through Redis-based locking and PostgreSQL ACID transactions.
2. **Seamless Scalability**: Microservices architecture capable of handling 10,000+ concurrent users during peak booking windows.
3. **Automated Operations**: Real-time seat maps, waitlist FIFO promotion, and automated event lifecycle management.
4. **Secure Access**: Dual-factor entry validation using encrypted QR codes and privacy-conscious face embedding matching.

## Non-Goals (Out of Scope)
- **Physical Hardware**: Implementation of actual entry gate hardware (focus is on the software/API layer).
- **Complex UI Builder**: A drag-and-drop tool for creating auditorium layouts (layouts will be defined via JSON/Config in V1).
- **Secondary Market**: User-to-user seat reselling or transfers.

## Users
- **Internal Students**: Book free events using 2FA university credentials; use Face ID for fast entry.
- **External Users**: Paid event access via integrated payment gateway.
- **Organizers**: Manage event metadata, monitor live booking status, and approve entries.
- **Admins**: System-wide oversight, event approval, and analytics access.

## Constraints
- **Performance**: API latency must remain < 200ms; real-time updates < 1s via WebSockets.
- **Concurrency**: Must handle the "thundering herd" problem when high-demand events go live.
- **Privacy**: Face data must be stored as mathematical embeddings, never raw images.

## Success Criteria
- [ ] 100% prevention of double-booked seats in load testing (10k concurrent).
- [ ] Successful waitlist promotion cycle (Release -> Promote -> Notify).
- [ ] Entry validation time < 2s for both QR and Face Recognition.
- [ ] < 0.1% booking failure rate due to system exceptions.
