# AGENTS.md (app/)

## Scope

Applies only to `app/` and its subdirectories (`client/`, `server/`, `docker/`, `nginx/`, `database/`). This is a demo prescription portal (see `app/INSTRUCTION.md`).

## Architecture Summary

- Frontend: React + Vite SPA in `app/client/`, built and served by Nginx.
- Backend: Node.js + Express API in `app/server/`, stateless, JWT auth, rate limiting.
- Database: PostgreSQL (Docker Compose), migrations/seeds via Knex.
- Edge: Nginx reverse proxy in `app/nginx/nginx.conf` routes `/api/v1/*` to the backend.

## Key Paths

- Frontend entry: `app/client/src/main.jsx`, `app/client/src/App.jsx`.
- Frontend API wrapper: `app/client/src/api/prescriptionApi.js` (calls `/api/v1`).
- Patient portal UI: `app/client/src/components/PatientLogin.jsx`, `app/client/src/components/PatientPortal.jsx`, `app/client/src/api/patientPortalApi.js`.
- Vite dev proxy: `app/client/vite.config.js` (proxies `/api` to `http://localhost:8080`).
- Backend entry: `app/server/src/server.js` -> `app/server/src/app/server.js`.
- Routes: `app/server/src/app/routes.js`, `app/server/src/api/v1/**`.
- Phase 2 routes: `app/server/src/app/routesV2.js`, `app/server/src/api/v2/**`.
- Phase 2 services/repos: `app/server/src/core/v2`, `app/server/src/infra/v2`.
- Audit logging: `app/server/src/core/v2/audit.service.js`, `app/server/src/infra/v2/audit.repository.js`, `app/server/src/api/v2/audit/**`.
- Validation schemas: `app/server/src/api/v1/**/**.schemas.js`.
- Auth middleware: `app/server/src/api/http/middleware/auth.js`.
- Demo data: `app/server/src/modules/prescription/prescription.service.js`.
- DB access: `app/server/src/infra/db/knex.js`.
- Migrations/Seeds: `app/server/src/infra/db/migrations`, `app/server/src/infra/db/seeds`.
- Phase 2 schema: `v2` (normalized tables in `app/server/src/infra/db/migrations/20260203_phase2_tables.js`).
- OpenAPI spec: `app/server/src/docs/openapi.yaml` and `app/server/docs/openapi.yaml` (keep in sync).
- Docker: `app/docker-compose.yml`, `app/docker/`, `app/nginx/nginx.conf`.
- Nginx TLS: frontend exposes `https://localhost:8443` with a self-signed cert (demo only).

## Local Dev Setup (Docker)

- Initialize secrets and `.env` once: `./scripts/setup-dev.sh`.
- Start stack: `docker-compose up --build` (run from `app/`).
- Stop stack: `docker-compose down`.

## Local Dev Setup (Node)

- Frontend (from `app/client/`):
  - `npm install`
  - `npm run dev`
  - `npm run lint`
  - `npm test`
- Backend (from `app/server/`):
  - `npm install`
  - `npm run dev`
  - `npm run lint`
  - `npm test`
  - `npm run db:migrate`, `npm run db:seed`

## Environment and Secrets

- Backend config is in `app/server/src/config/env.js` and reads from env or `/run/secrets/*`.
- Docker Compose expects `app/.env` plus `app/secrets/` files (`db_pass.txt`, `admin_pass.txt`, `jwt_secret.txt`, `data_encryption_key.txt`).
- Field-level encryption uses `DATA_ENCRYPTION_KEY` (see `app/server/src/utils/fieldEncryption.js`) and `app/secrets/data_encryption_key.txt` in Docker.
- Optional TLS for API server: set `TLS_CERT_PATH` and `TLS_KEY_PATH` in the backend environment.
- API responses set `Cache-Control: no-store` to reduce PHI caching risk.
- Demo/test credentials are no longer hardcoded; seeds and tests generate values or require env vars (see `app/server/tests/helpers/testCredentials.js`).
- If you change env names or add secrets, update:
  - `app/server/src/config/env.js`
  - `app/docker-compose.yml`
  - `app/scripts/setup-dev.sh`

## Change Guidelines

- Keep API path versioned under `/api/v1`. If you change it, update:
  - `app/nginx/nginx.conf`
  - `app/client/src/api/prescriptionApi.js`
  - `app/client/vite.config.js`
  - `app/server/src/app/routes.js`
- When adding or altering endpoints, update validation schemas and tests.
- When changing DB schema, add a migration and update seeds; if Docker init data is needed, update `app/database/script/db-init.sql`.
- Keep OpenAPI specs in both `app/server/src/docs/openapi.yaml` and `app/server/docs/openapi.yaml` aligned with code.

## Testing Notes

- Server tests are Jest under `app/server/tests`.
- Client tests are Vitest under `app/client/src`.
- Prefer updating or adding tests when changing auth, API responses, or UI flows.
- Integration tests for audit storage can auto-start a Postgres container via `app/docker-compose.test-db.yml`.
- Helper scripts:
  - `app/scripts/test-db.sh` (spin up test DB, run audit repo integration test)
  - `app/scripts/test-db-compose.sh` (manage test DB container)
