# Phase 2 To-Do (app/)

## Current Status

- ✅ Schema & migrations (normalized `v2` tables)
- ✅ Doctor APIs
- ✅ Patient portal APIs/UI
- ✅ Audit logging (doctor + patient)
- ✅ Hardening (TLS, rate limits, field encryption, cache headers, HSTS)
- ✅ Auth upgrades: refresh tokens + MFA (enroll, verify, status, enforced login)
- ✅ Update client login flow to handle `mfaRequired` and MFA verify UI
- ✅ Run migrations and seeds (inside container, since runtime image has no `npm`):
  - `docker compose exec backend node ./node_modules/knex/bin/cli.js migrate:latest --knexfile src/config/knexfile.js`
  - `docker compose exec backend node ./node_modules/knex/bin/cli.js seed:run --knexfile src/config/knexfile.js`

## Remaining To Finish Phase 2

- [ ] Verify Phase 2 demo flows end-to-end:
  - Doctor: login → MFA (if enabled) → patient search → summary → encounter → create prescription
  - Patient: login → list prescriptions → view detail

## Ops Notes

- Use **Compose v2** commands: `docker compose ...` (v1 `docker-compose` may crash on logs).
