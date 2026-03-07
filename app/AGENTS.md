# AGENTS.md

## Scope and Relationship to Root

This file applies only to `app/` and its subdirectories.

It **inherits the root `AGENTS.md`** and adds application-specific rules for:

- `app/client/`
- `app/server/`
- `app/docker/`
- `app/nginx/`
- `app/database/`
- `app/scripts/`
- `app/compliance/`

If this file conflicts with the root file, this file overrides the root **only for `app/**` and only for the conflicting guidance**. Otherwise, root rules remain in effect.

---

## Application Context

`app/` contains the StayHealthy prescription portal used to exercise repository governance controls.

Current architecture:

- Frontend: React + Vite SPA, typically served by Nginx
- Backend: Node.js + Express API with JWT auth, optional OIDC checks, MFA flows, audit support, metrics, and hardened middleware
- Data: PostgreSQL with Knex migrations and seeds
- Edge: Nginx reverse proxy and TLS for local/demo environments

Treat the application as security-sensitive even though it is also a reference implementation.

---

## Local Priorities

When application-specific principles conflict, prioritize in this order:

1. Security
2. Fail fast
3. KISS
4. DRY

Root governance and contract rules still apply unless explicitly overridden here.

---

## Runtime and Tooling Rules

- Use the Node runtime defined by the repo’s authoritative source for `app/`.
- If `package.json` `engines.node` is the canonical source, follow it.
- If the repo explicitly uses another authoritative runtime manifest for `app/`, follow that instead.
- Use `npm`.
- Keep `package-lock.json` in sync with dependency changes.
- Do not switch package managers.
- Prefer existing repo scripts and utilities over ad hoc commands.

If runtime declarations conflict, prefer the source used by current CI/release tooling and note the mismatch.

---

## Application Change Discipline

- Read affected modules and adjacent behavior before editing.
- Preserve existing patterns unless there is a clear reason to improve them.
- Keep diffs targeted and reviewable.
- Do not hand-edit generated outputs.
- Keep API contract behavior stable unless the task intentionally changes it.
- Preserve `/api/v1` compatibility unless versioning change is explicitly in scope.

### Required sync rules

When changing endpoints, update all affected surfaces together as applicable:

- handlers and routes,
- validation schemas,
- tests,
- OpenAPI specs,
- client integrations that depend on the endpoint.

When changing schema or persisted data behavior, update all affected surfaces together as applicable:

- migrations,
- seeds,
- server tests,
- integration or DB-backed checks,
- operational docs if behavior changes.

---

## Environment and Secret Handling

- Never commit real credentials, tokens, private keys, or populated secret files.
- Local secrets are expected under `app/secrets/` and via environment variables or `*_FILE` inputs.
- Do not log secrets, raw tokens, or sensitive payloads.

If environment names, secret wiring, or config loading changes, update the affected surfaces together, including as applicable:

- server env/config loading,
- compose files,
- setup scripts,
- developer docs,
- compliance or operational documentation.

---

## Sensitive Application Areas

Treat these files and areas with extra care:

- auth middleware and access-control logic,
- environment/config loading,
- encryption or token handling utilities,
- audit services and audit persistence,
- compose files,
- Dockerfiles,
- Nginx config,
- package manifests and lockfiles,
- backup, restore, test-db, and release scripts,
- OpenAPI specifications

For these areas:

- keep edits minimal,
- explain operational impact,
- run the most relevant validation available.

---

## Validation Expectations

Validate the smallest meaningful scope first.

### Frontend

Run as applicable from `app/client/`:

- `npm run lint`
- `npm test`
- `npm run build` when UI or build behavior is affected

### Backend

Run as applicable from `app/server/`:

- `npm run lint`
- `npm test`
- `npm run db:migrate` when schema behavior changes
- `npm run db:seed` when seed-dependent behavior changes

### Integration and DB-backed checks

Run as applicable:

- `app/scripts/test-db-compose.sh`
- `app/scripts/test-db.sh`

If a command cannot be run, say why.

If a validation step fails, classify it as:

- caused by the current change,
- pre-existing,
- environment or tooling limitation.

---

## Implementation Principles

### Secure by default

- deny by default at trust boundaries,
- minimize network and filesystem exposure,
- preserve least-privilege assumptions.

### Fail fast

- prefer explicit errors over silent fallback,
- do not silently widen permissions,
- surface invalid configuration clearly.

### KISS

- prefer clear control flow,
- avoid unnecessary abstractions,
- optimize for maintainability over cleverness.

### DRY with restraint

- small duplication is acceptable,
- extract shared utilities after repeated patterns are proven,
- do not add abstraction before it is justified.

---

## Anti-Patterns

Do not introduce:

- heavy dependencies for minor convenience,
- speculative configuration flags,
- speculative abstractions,
- hidden behavior changes inside refactors,
- silent security weakening,
- personal or sensitive data in tests or docs.

Do not:

- mix formatting-only changes with logic changes,
- bypass failing validation gates,
- rely on “ship and hope” for security-sensitive paths.

---

## When to Prefer a Larger App Change

A broader change is justified when a minimal patch would leave:

- repeated security-sensitive duplication in place,
- inconsistent API behavior across versions or routes,
- partially updated validation or contract surfaces,
- migration, seed, and test behavior out of sync,
- a harder-to-validate or harder-to-revert system state.

When taking that path, keep scope controlled and explain why a narrower fix was insufficient.

---

## Application Operational Map

These notes are repo-local guidance and should reflect the current repo state.

### Common areas

Frontend examples:

- entrypoints under `app/client/src/`
- API integration modules under `app/client/src/api/`
- user flow components under `app/client/src/components/`
- dev proxy config in `app/client/`

Backend examples:

- server entrypoints under `app/server/src/`
- route registration under `app/server/src/app/`
- versioned APIs under `app/server/src/api/`
- auth middleware under HTTP middleware paths
- env/config loading under `app/server/src/config/`
- DB code under `app/server/src/infra/db/`
- service and repository logic under core/infra paths
- audit flow and encryption utilities in their existing server locations
- OpenAPI docs under server source/docs locations

Delivery and operations examples:

- compose stacks under `app/`
- Dockerfiles under `app/docker/`
- Nginx config under `app/nginx/`
- setup, backup, restore, release, and DB helper scripts under `app/scripts/`
- compliance artifacts under `app/compliance/`

These are directional maps, not permission to ignore the actual current code layout. When repo structure differs, trust the current repository state.

---

## Preferred Handoff Format

For substantive changes in `app/`, summarize using:

1. **What changed**
2. **What did not change** (intentional scope)
3. **Why**
4. **Config or environment changes**
5. **Risk / impact**
6. **Validation performed and results**
7. **Remaining risks or unknowns**
8. **Recommended next action** (only if needed)
