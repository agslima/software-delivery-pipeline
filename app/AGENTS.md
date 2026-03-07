# AGENTS.md (app/)

## Scope

Applies only to `app/` and its subdirectories (`client/`, `server/`, `docker/`, `nginx/`, `database/`, `scripts/`, `compliance/`).
This file **overrides root `AGENTS.md`** for files inside `app/**`.

---

## Project Context (app)

`app/` is the StayHealthy prescription portal used to exercise repository governance controls.

- Frontend: React + Vite SPA (`app/client/`), typically served by Nginx.
- Backend: Node.js + Express API (`app/server/`) with JWT auth, optional OIDC checks, MFA flows, audit support, metrics, and hardened middleware.
- Data: PostgreSQL with Knex migrations/seeds.
- Edge: Nginx reverse proxy and TLS for local/demo environments.

Treat this as a security-sensitive workload even though it is a reference implementation.

---

## Runtime & Tooling Constraints

- Use the repo-declared Node runtime: `24.13.0` (`app/client/package.json`, `app/server/package.json`).
- Use **npm** and keep `package-lock.json` in sync when dependencies change.
- Prefer existing scripts before inventing new commands.
- Do not switch package managers.

---

## Key Paths (Current)

### Frontend

- Entry: `app/client/src/main.jsx`, `app/client/src/App.jsx`
- APIs: `app/client/src/api/prescriptionApi.js`, `app/client/src/api/patientPortalApi.js`
- Patient flows: `app/client/src/components/PatientLogin.jsx`, `app/client/src/components/PatientPortal.jsx`
- Dev proxy: `app/client/vite.config.js`

### Backend

- Entrypoints: `app/server/src/server.js`, `app/server/src/app/server.js`
- Routing: `app/server/src/app/routes.js`, `app/server/src/app/routesV2.js`
- APIs: `app/server/src/api/v1/**`, `app/server/src/api/v2/**`
- Auth middleware: `app/server/src/api/http/middleware/auth.js`
- Config/env loading: `app/server/src/config/env.js`
- DB + migrations/seeds: `app/server/src/infra/db/**`
- V2 services/repos: `app/server/src/core/v2/**`, `app/server/src/infra/v2/**`
- Audit flow: `app/server/src/core/v2/audit.service.js`, `app/server/src/infra/v2/audit.repository.js`
- Field encryption: `app/server/src/utils/fieldEncryption.js`
- OpenAPI docs (keep aligned):
  - `app/server/src/docs/openapi.yaml`
  - `app/server/docs/openapi.yaml`

### Delivery/Operations inside app

- Compose stacks: `app/docker-compose.yml`, `app/docker-compose.release.yml`, `app/docker-compose.test-db.yml`, `app/docker-compose.quick.yml`
- Dockerfiles: `app/docker/Dockerfile.server`, `app/docker/Dockerfile.client`
- Nginx config: `app/nginx/nginx.conf`
- Ops scripts: `app/scripts/setup-dev.sh`, `app/scripts/backup-db.sh`, `app/scripts/restore-db.sh`, `app/scripts/build-release-images.sh`, `app/scripts/pin-release-images.sh`, `app/scripts/test-db.sh`
- Compliance artifacts: `app/compliance/**`

---

## Environment & Secrets

- Never commit real credentials, tokens, private keys, or populated secret files.
- Local secrets are expected under `app/secrets/` and via env vars/`*_FILE` inputs.
- If env names or secret wiring changes, update all affected surfaces together:
  - `app/server/src/config/env.js`
  - compose files in `app/`
  - `app/scripts/setup-dev.sh`
  - relevant docs (`app/readme.md`, compliance docs as needed)

---

## Required Change Discipline

- Read affected modules before editing; preserve existing patterns.
- Make targeted, minimal diffs.
- Do not hand-edit generated outputs.
- Keep API contract behavior stable unless intentional and documented.
- Keep `/api/v1` compatibility unless the task explicitly includes versioning changes.
- When changing endpoints, update:
  - handlers/routes,
  - validation schemas,
  - tests,
  - OpenAPI specs.
- When changing schema, add a migration and adjust seeds/tests.

---

## Validation Expectations

Validate smallest meaningful scope first.

### Frontend (`app/client`)

- `npm run lint`
- `npm test`
- `npm run build` (when UI/build behavior is affected)

### Backend (`app/server`)

- `npm run lint`
- `npm test`
- `npm run db:migrate` / `npm run db:seed` (when schema/data behavior changes)

### Integration/DB helpers

- `app/scripts/test-db-compose.sh` and `app/scripts/test-db.sh` for test-db backed checks.

If you cannot validate, state why clearly. If failures occur, classify as change-caused, pre-existing, or environment limitation.

---

## Implementation Principles

These principles guide implementation decisions.

### Secure by default

- deny-by-default boundaries
- never log secrets or raw tokens
- minimize network and filesystem exposure

### Fail fast

- prefer explicit errors over silent fallback
- never silently widen permissions

### KISS

- prefer clear control flow
- avoid unnecessary abstractions

### DRY with the rule of three

- small duplication is acceptable
- extract shared utilities only after repeated patterns

> When principles conflict, prioritize: **Security → Fail Fast → KISS → DRY**.

---

## Anti-Patterns (Do Not)

Avoid introducing:

- heavy dependencies for minor convenience
- speculative configuration flags
- speculative abstractions
- silent security policy weakening
- behavior changes hidden inside refactor commits

Do not:

- mix formatting-only changes with logic changes
- bypass failing validation gates
- include personal or sensitive data in tests or docs

---

## Rapid Iteration Guardrails

When iterating quickly:

- keep commits small and reversible
- validate assumptions with code search
- favor deterministic behavior
- avoid “ship and hope” on security-sensitive paths

If uncertain:
leave an explicit **TODO with verification context** rather than hidden assumptions.

---

## Files Requiring Extra Care in `app/`

- `app/server/src/config/env.js`
- `app/server/src/api/http/middleware/auth.js`
- `app/server/src/utils/fieldEncryption.js`
- `app/server/src/core/v2/audit.service.js`
- `app/server/src/infra/v2/audit.repository.js`
- `app/docker-compose*.yml`
- `app/docker/Dockerfile.*`
- `app/nginx/nginx.conf`
- `app/server/package.json`, `app/client/package.json`, lockfiles
- backup/restore/release scripts under `app/scripts/`

For these files: keep edits minimal, explain operational impact, and run relevant validation.

---

## Handoff Template

When ending work or handing off changes include:

1. **What changed**
2. **What did not change** (intentional scope)
3. **Why**
4. **Config or environment changes**
5. **Validation performed and results**
6. **Remaining risks or unknowns**
7. **Recommended next action**
