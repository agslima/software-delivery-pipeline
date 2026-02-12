# Phase 3 Design Plan: Infrastructure & Compliance Overhaul

This plan hardens the `/app` system to meet real-world healthcare expectations for security, compliance, and operational resilience. It complements Phase 2 by focusing on identity, encryption, auditing, monitoring, and deployment readiness.

---

## 1) Compliance & Governance

### Target Frameworks

- **HIPAA Security Rule**: administrative, physical, and technical safeguards.
- **GDPR**: data minimization, lawful basis, and right-to-access/erasure workflows.
- **SOC 2 (Type II)**: security, availability, confidentiality (as an optional future target).

### Required Artifacts

- Data processing inventory (PHI/PII classification + system diagram).
- DPIA template and risk register.
- Incident response playbook (breach notification process and timelines).
- Vendor risk assessment for any third-party services.

---

## 2) Identity & Access Management (IAM)

### Strategy

Adopt **OAuth 2.0 + OpenID Connect** with a managed IdP (e.g., Auth0/Okta/Keycloak).

### Controls

- MFA for all clinical users, optional but recommended for patients.
- Short-lived access tokens (10–15 minutes) with refresh token rotation.
- RBAC and policy-based access control (PBAC) at API layer:
  - **Doctors**: access only patients tied to active encounters or assigned facilities.
  - **Patients**: access only self data.
  - **Admins**: audit-only privileges.

### Implementation Notes

- Validate tokens via JWKS (asymmetric signing preferred).
- Add device/session management for logout across devices.
- Store refresh tokens server-side (hashed) for revocation.

### OIDC Config Notes (Phase 3)

- OIDC is controlled by env vars and expects JWTs signed by the IdP JWKS:
  - `OIDC_ENABLED=true` to accept OIDC tokens.
  - `OIDC_REQUIRED=true` to reject non‑OIDC tokens.
  - `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URI` must match the IdP.
  - Claims: `OIDC_EMAIL_CLAIM` is used to map to local users (default `email`).
  - MFA enforcement for clinical roles:
    - `OIDC_MFA_REQUIRED_ROLES` (default `doctor,admin`)
    - `OIDC_REQUIRED_AMR` (default `mfa`)
    - `OIDC_REQUIRED_ACR` (optional list)
  - `OIDC_CLOCK_TOLERANCE_SECONDS` handles small time drift.
- Local user provisioning is required:
  - OIDC users must exist in `v2.users` and be mapped by email claim.
  - Local roles are authoritative; OIDC role claims are not used for authorization.

---

## 3) Encryption & Data Protection

### In Transit

- Enforce TLS 1.2+ end-to-end (Nginx or upstream load balancer).
- Strict HSTS headers with preload (post-validation).

### At Rest

- Database encryption using managed disk encryption (cloud-managed or LUKS).
- Field-level encryption for high-risk PHI (e.g., diagnoses, medications).
- Secrets stored in a centralized secrets manager (AWS Secrets Manager, Vault).

### Key Management

- Use KMS/HSM for key lifecycle.
- Rotate keys on a defined schedule (e.g., 90 days).

### App Config Notes (Phase 3)

- TLS enforcement:
  - `ENFORCE_TLS=true` rejects non‑HTTPS requests (requires a TLS‑terminating proxy).
  - When running the API directly with TLS, set `TLS_CERT_PATH` + `TLS_KEY_PATH` (min TLS 1.2 enforced).
- Field‑level encryption key rotation:
  - `DATA_ENCRYPTION_KEY_ID` selects the primary key for new writes.
  - `DATA_ENCRYPTION_KEYS` can hold a key ring as `keyId:secret,keyId2:secret2`.
  - Legacy ciphertext without a key id remains decryptable.
- Secrets manager integration (runtime):
  - Secrets may be provided via `*_FILE`, `/run/secrets/*`, or `SECRETS_JSON` (JSON map).

---

## 4) Audit Logging & Monitoring

### Audit Log Requirements

Log the following for **all PHI access**:
- Actor (user ID, role)
- Action (read/write/export)
- Subject (patient ID, prescription ID)
- Timestamp, IP address, user-agent
- Outcome (success/failure)

### Audit Pipeline Notes (Phase 3)

- `AUDIT_SINK=db` stores audit events in `v2.audit_events` (default).
- `AUDIT_SINK=console` sends audit events to structured logs for external aggregation.
- `AUDIT_PII_REDACTION` can be `none` or `strict` to redact nested metadata.
- Audit events capture `redaction_mode` and include indexed access paths for search.

### Observability Stack

- Structured logs (JSON) to centralized log sink (ELK, Datadog, CloudWatch).
- Metrics with Prometheus + Grafana (request latency, auth failures, error rates).
- Tracing with OpenTelemetry for API and DB calls.

### Observability Notes (Phase 3)

- Metrics endpoint: `METRICS_ENABLED=true` exposes `METRICS_PATH` (default `/metrics`).
- Optional auth: set `METRICS_AUTH_TOKEN` for bearer protection.

### Alerts & Detection

- Alert on anomalous access patterns (burst reads, access outside facility).
- Alert on repeated authentication failures or MFA bypass attempts.

---

## 5) Infrastructure & Deployment

### Environment Separation

Maintain **dev**, **staging**, and **production** with isolated data stores.

### Deployment Model

- Containerized deployment with orchestration (Kubernetes or ECS).
- Zero-downtime rolling updates.
- Immutable builds with provenance tracking (SBOM, artifact signing).

### Configuration Management

- 12-factor env vars for non-secrets.
- Secrets pulled at runtime from secrets manager.
- No hardcoded credentials in code or image layers.

### Deployment Hardening Notes (Phase 3)

- Build release images with OCI labels for provenance (`build-release-images.sh`).
- Use digest-pinned images via `docker-compose.release.yml`.
- Generate SBOMs with `syft` and sign images with `cosign` when publishing.

---

## 6) Security Controls (Application & Edge)

### Edge Security

- WAF rules: IP reputation, rate limiting, geo-fencing if required.
- DDoS mitigation (cloud-native or managed service).

### Edge Security Notes (Phase 3)

- Nginx edge adds basic WAF checks (method allowlist, path traversal, UA blocks).
- Global rate limiting + per-endpoint limits provide baseline DDoS protection.
- Hardened security headers are enforced at the edge.

### API Security

- Request validation + schema enforcement.
- Strict CORS policies.
- Rate limiting per endpoint and role.
- Secure headers (CSP, X-Content-Type-Options, Referrer-Policy).

### App Security
- Dependency scanning (SCA) with automated alerts.
- SAST integrated in CI pipeline.
- Regular penetration testing and vulnerability assessments.

---

## 7) Backup, DR, and Business Continuity

### Backup Strategy
- Point-in-time recovery for PostgreSQL.
- Daily encrypted backups stored in separate account/bucket.
- Quarterly restore drills.

### DR Objectives
- RPO: < 15 minutes
- RTO: < 1 hour

### Backup/DR Notes (Phase 3)

- Backup scripts: `app/scripts/backup-db.sh` and `app/scripts/restore-db.sh`.
- `BACKUP_REQUIRE_ENCRYPTION=true` enforces encrypted backups.
- Restore requires `CONFIRM_RESTORE=true` to avoid accidental data loss.

---

## 8) Phase 3 Implementation Plan

1. **Identity integration**
   - OIDC integration, token validation, MFA support.
2. **Encryption upgrades**
   - TLS enforcement, secrets manager integration, field-level encryption.
3. **Audit pipeline**
   - Centralized logging + audit event schema + storage.
4. **Observability**
   - Metrics, tracing, alerting.
5. **Edge security**
   - WAF + DDoS + hardened headers.
6. **Compliance workflows**
   - DPIA + incident response + access reviews.

---

## 9) Definition of Done (Phase 3)

- OIDC authentication with MFA and refresh token rotation.
- TLS enforced with HSTS and secure headers.
- Centralized audit logs for all PHI access.
- Monitoring and alerting deployed with tracing enabled.
- Backups, restore drills, and DR objectives met.
- Compliance documentation completed and reviewed.
