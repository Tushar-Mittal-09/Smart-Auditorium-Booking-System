# Circuit Breaker — Future Implementation
When inter-service calls are added (API Gateway -> Auth, Auth -> Event, etc.),
implement circuit breaker using `opossum` or `@nestjs/axios` with interceptors.
Pattern: CLOSED -> OPEN (after N failures) -> HALF-OPEN (probe) -> CLOSED
This prevents cascading failures across microservices.
NOT implemented in Phase 2 — no inter-service calls yet.
