# Operational Runbook

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

This runbook documents common failure scenarios, security gate rejections, and operational incidents in the governed software delivery pipeline. Its goal is to provide clear, repeatable response steps so failures are handled consistently, auditably, and without bypassing governance controls.

## Scope

This runbook applies to:

- CI/CD pipeline executions in GitHub Actions
- supply-chain security controls such as Trivy, Cosign, SBOMs, and attestations
- policy enforcement through Kyverno
- GitOps-based Kubernetes deployments

It intentionally focuses on response actions, not tool configuration.

## Pipeline Failure: Security Gate (Trivy)

### Symptom

CI job `Security Quality Check` fails on a pull request because Trivy reported `HIGH` or `CRITICAL` findings, or release job `Trivy Scan (Digest Gate)` fails for `backend` or `frontend`.

- exit code: `1`

### Error message

- PR path: `HIGH` or `CRITICAL` vulnerabilities found in the PR scan
- release path: `⛔ Trivy Gate Failed for <image> (CRIT=<n> HIGH=<n>)`

### Triage steps

1. Open the GitHub Actions job logs.
2. Identify which path failed.
3. Review the affected CVE, package, severity, and fix version if available.

For the failing path:

- PR path: inspect the `Security Quality Check` logs for the Trivy FS/config step output and confirm whether the failing threshold was `HIGH` or `CRITICAL`.
- release path: download the relevant artifact, either `trivy-results-backend` or `trivy-results-frontend`.

### Resolution paths

#### Scenario A: Fixable vulnerability

Preferred response:

- update the base image in the Dockerfile
- upgrade the vulnerable dependency
- re-run the pipeline

Rationale: fixing vulnerabilities preserves a cleaner supply chain and avoids accumulating risk.

#### Scenario B: False positive or acceptable risk

If no patch exists or the risk is deemed acceptable:

Option 1: temporary CVE ignore

- add the CVE ID to `.trivyignore`
- include a justification comment explaining why the risk is acceptable and why remediation is not currently possible

Option 2: managed security debt

- create a tracking ticket
- log the issue in `docs/security-debt.md`
- reference the ticket ID in commit history or the related PR

Important guardrails:

- critical vulnerabilities must never be ignored without explicit justification
- high vulnerabilities are release-blocking once they exceed the documented threshold of `HIGH > 5` per image

## Pipeline Failure: Supply Chain Integrity (Cosign)

### Symptom

Job `sign-and-attest` fails.

### Error message

- `no matching signatures found`

### Triage steps

1. Confirm the build-and-push job completed successfully.
2. Verify that the image digest exists in the registry.
3. Check GitHub Actions permissions:

```yaml
permissions:
  id-token: write
```

4. Validate registry credentials:

- Docker Hub token is not expired
- correct repository namespace is being used

### Common root causes

- OIDC token not issued because of missing permissions
- image push failed silently
- tag mismatch versus digest signing
- registry authentication failure

### Resolution

- fix credentials or permissions
- re-run the pipeline from a clean build
- avoid re-signing old or locally cached images

## Pipeline Failure: DAST (OWASP ZAP)

### Symptom

Job `dast-analysis` fails.

### Error message

- `High Vulnerabilities Found: > 0`

### Triage steps

1. Download the `zap-report.html` artifact.
2. Identify:

- affected endpoint
- vulnerability type
- risk level

### Resolution paths

#### Legitimate vulnerability

- fix the application logic
- common fixes include input validation, authentication enforcement, and CSRF protection

#### False positive or missing security headers

If the application is functioning correctly but headers are missing:

- update `app/server/index.js`
- add standard security headers, for example with Helmet

```js
app.use(helmet());
```

- re-run DAST after remediation

### Local reproduction

Run the same Compose-backed full-scan path locally:

```bash
make dast-weekly-local
```

Reports are written to `app/zap-out/`.

Useful overrides:

```bash
KEEP_DAST_ENV=1 ./scripts/run-local-zap-full-scan.sh
ZAP_LOGIN_EMAIL=security@example.test ZAP_LOGIN_PASSWORD='change-me' ./scripts/run-local-zap-full-scan.sh
```
