# Phase 3 To-Do (app/)

## Status

- [ ] 1. Identity integration (OIDC + MFA + refresh token posture)
- [ ] 2. Encryption upgrades (TLS enforcement, secrets manager, key rotation)
- [ ] 3. Audit pipeline (centralized audit schema + storage)
- [ ] 4. Observability (metrics, tracing, alerting)
- [ ] 5. Edge security (WAF, DDoS, hardened headers)
- [ ] 6. Compliance workflows (DPIA, incident response, access reviews)
- [ ] 7. Backup/DR (PITR, encrypted backups, restore drills)
- [ ] 8. Deployment hardening (env separation, immutable builds, SBOM/signing)

## Step 1 Breakdown: Identity Integration

- [x] Add OIDC configuration (issuer, audience, JWKS URI, claim mapping)
- [x] Implement JWKS-based token validation with caching
- [x] Map OIDC principals to local users and roles
- [ ] Enforce MFA + refresh token rotation posture (OIDC MFA claims, session revocation)
- [ ] Update docs/config and note operational requirements
