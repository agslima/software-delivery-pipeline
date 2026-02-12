# Phase 3 To-Do (app/)

## Status

- [x] 1. Identity integration (OIDC + MFA + refresh token posture)
- [x] 2. Encryption upgrades (TLS enforcement, secrets manager, key rotation)
- [x] 3. Audit pipeline (centralized audit schema + storage)
- [x] 4. Observability (metrics, tracing, alerting)
- [x] 5. Edge security (WAF, DDoS, hardened headers)
- [x] 6. Compliance workflows (DPIA, incident response, access reviews)
- [x] 7. Backup/DR (PITR, encrypted backups, restore drills)
- [x] 8. Deployment hardening (env separation, immutable builds, SBOM/signing)

## Step 1 Breakdown: Identity Integration

- [x] Add OIDC configuration (issuer, audience, JWKS URI, claim mapping)
- [x] Implement JWKS-based token validation with caching
- [x] Map OIDC principals to local users and roles
- [x] Enforce MFA + refresh token rotation posture (OIDC MFA claims, session revocation)
- [x] Update docs/config and note operational requirements

## Step 2 Breakdown: Encryption Upgrades

- [x] Enforce TLS at the app edge (`ENFORCE_TLS`, TLSv1.2+)
- [x] Support secret sourcing via `*_FILE`, `/run/secrets/*`, and `SECRETS_JSON`
- [x] Add field-level encryption key rotation (key ids + key ring)
- [x] Document new TLS and encryption configuration

## Step 3 Breakdown: Audit Pipeline

- [x] Add audit sink config (`db`/`console`) and redaction mode
- [x] Sanitize sensitive metadata and persist `redaction_mode`
- [x] Add audit table indexes for query performance
- [x] Update docs/config notes

## Step 4 Breakdown: Observability

- [x] Add Prometheus metrics endpoint + auth
- [x] Track request counts + latency + auth failures
- [x] Document metrics configuration

## Step 5 Breakdown: Edge Security

- [x] Add basic WAF rules at Nginx edge
- [x] Add global rate limiting + tightened connection settings
- [x] Harden security headers at the edge

## Step 6 Breakdown: Compliance Workflows

- [x] Data processing inventory + system diagram
- [x] DPIA template + risk register
- [x] Incident response playbook
- [x] Vendor risk assessment template

## Step 7 Breakdown: Backup/DR

- [x] Backup and restore scripts
- [x] Backup/DR plan template
- [x] Document encryption and restore safety guardrails

## Step 8 Breakdown: Deployment Hardening

- [x] Release build script with OCI labels
- [x] Digest-pinned release compose file
- [x] SBOM/signing guidance
