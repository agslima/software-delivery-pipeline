
# StayHealthy Architecture

## 3. High-Level Architecture 🏗

The system is composed of four primary runtime components:

### 1. Frontend (Client)

- React-based Single Page Application
- Served as static assets via Nginx
- Proxies API requests to the backend

### 2. Backend (Server)

- Stateless Node.js / Express API
- Handles authentication, request validation, and business logic
- Exposes REST endpoints under `/api/v1` and `/api/v2`

### 3. Background Worker

- Separate runtime for asynchronous prescription export generation
- Claims queued export jobs from the database
- Handles retries and completion state outside the user request path
- Exposes `/health` and `/ready` on port `8090` for orchestrator probes

### 4. Database

- PostgreSQL instance
- Persistent storage for prescription and user data
- Managed via versioned Knex.js migrations
- Stores async export job state for the worker

## Key Capabilities

- JWT auth with HttpOnly refresh-token cookies
- Optional OIDC validation with AMR/ACR checks
- MFA enrollment and verification
- Audit pipeline (DB or console sinks)
- Asynchronous prescription export generation via a queue-backed worker
- Documented partial-failure recovery story for async worker retry behavior
- Field-level encryption with key rotation
- TLS enforcement middleware (behind proxy)
- Rate limiting and hardened headers
- Metrics endpoint (Prometheus format)