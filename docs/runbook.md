# Operational Runbook

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This runbook documents common failure scenarios, security gate rejections, and operational incidents in the governed software delivery pipeline. Its goal is to provide clear, repeatable response steps so failures are handled consistently, auditably, and without bypassing governance controls.

## Scope

This runbook applies to:

- CI/CD pipeline executions in GitHub Actions
- supply-chain security controls such as Trivy, Cosign, SBOMs, and attestations
- policy enforcement through Kyverno
- GitOps-based Kubernetes deployments

It intentionally focuses on response actions, not tool configuration.

## Schema Change Rollout Order

Database releases must model three distinct phases:

- pre-deploy migration job
- application release job
- post-deploy cleanup job in a later release

Use [`schema-change-deployment-procedure.md`](schema-change-deployment-procedure.md) as the canonical deployment sequence and [`database-migration-demo-prescription-status.md`](database-migration-demo-prescription-status.md) as the worked example.

Operational rule:

- run additive expand migrations before deploying code that depends on them
- deploy only application versions that remain compatible with the expanded schema
- delay destructive cleanup until a later release after compatibility evidence exists

If a proposed release cannot follow that sequence, treat it as an exception and stop for explicit review before deployment.

## Async Export Worker: Retry, Failure, and Poison Jobs

The prescription export worker uses bounded retry with terminal failure visibility.

Operational rules:

- transient worker failures are retried automatically with backoff
- known non-retryable failures move directly to `failed`
- jobs that exhaust `max_attempts` also move to `failed`
- failed jobs remain visible via `GET /api/v2/exports/{jobId}` and in `v2.export_jobs`
- re-submitting the same export request is the supported operator-safe requeue path for a failed job

### Symptoms

- export job remains `queued` or `processing` longer than expected
- export job status is `failed`
- worker logs show repeated retry scheduling for the same job id

### Triage steps

1. Query the job status endpoint or inspect `v2.export_jobs`.
2. Check `status`, `attempt_count`, `max_attempts`, `lease_expires_at`, and `last_error`.
3. Determine whether the failure was transient or non-retryable.
4. Confirm whether the worker is healthy through `/health` and `/ready`.

### Response

For transient failures:

- allow the bounded retry policy to continue
- intervene only if the same class of failure is affecting multiple jobs

For terminal `failed` jobs:

- fix the underlying cause first
- re-submit the same export request to requeue the failed job under the same idempotency key
- do not insert manual duplicate rows into `v2.export_jobs`

### Duplicate delivery assumption

Assume at-least-once delivery.

That means:

- duplicate job claims must not corrupt exported state
- duplicate request submissions should reuse or requeue the same logical job
- operators should prefer replay through the API flow, not ad hoc database edits

## Async Export Worker: Partial Failure Recovery Story

Use [`async-failure-scenario-worker-retry.md`](async-failure-scenario-worker-retry.md) as the canonical worked example.

Scenario summary:

- API returns `202 Accepted`
- worker claims the job
- worker crashes before completion
- job remains visible in `v2.export_jobs`
- lease expires
- restarted worker retries and completes the same job

### Expected operator interpretation

- `processing` with a non-expired lease means the worker may still legitimately own the job
- `processing` with an expired lease means the job is recoverable and should be reclaimed by a healthy worker
- missing `last_error` does not imply success when the worker dies abruptly; it can simply mean the process exited before recording an application-level error

### Expected response

1. Check worker health through `/ready`.
2. Inspect `lease_expires_at` and `attempt_count`.
3. Restore worker availability if needed.
4. Allow the retry path to reclaim the stale job.
5. Confirm the final transition to `completed`.

Preferred operator action is recovery through worker restart and normal retry behavior, not direct queue mutation.

## Production Backend Canary Rollout

Use [`canary-rollout-strategy.md`](canary-rollout-strategy.md) for the rollout model, [`rollout-gates-policy.md`](rollout-gates-policy.md) for promotion rules, and [`canary-rollout-walkthrough.md`](canary-rollout-walkthrough.md) for example evidence.

### Expected steady-state model

- `backend` carries the trusted stable digest
- `backend-canary` carries the candidate digest
- `backend` Service sends traffic to both tracks based on ready replica count

### Triage steps during rollout

1. Render `kubectl kustomize k8s/overlays/prod` and confirm the stable and canary digests.
2. Check `kubectl get deploy,po,svc -n production -l app=backend`.
3. Probe `backend-canary` directly and the shared `backend` Service.
4. Review restart counts, readiness state, and recent errors during the observation window.

### Promote

Promote only when the canary gates are satisfied and the evidence bundle is complete.
Promotion means moving the candidate digest into the stable slot and then scaling canary down.

### Halt and roll back

Stop rollout when rollback triggers in [`rollout-gates-policy.md`](rollout-gates-policy.md) fire.
Preferred rollback is to remove canary exposure while preserving the last known-good stable digest.

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

## Pipeline Failure: Governance Evidence Drift

### Symptom

Job `Governance & Security Quality Check` fails at `Governance Drift Check (docs/workflow refs)` or the quarterly `Governance Settings Audit` fails while generating `governance-drift-check.txt`.

### Error message

Typical failures include:

- `README claim '<claim>' does not have a matching row in docs/governance-evidence-index.md`
- `claim '<claim>' references missing workflow file '<path>'`
- `claim '<claim>' references workflow job '<job>' in '<path>', but that job was not found`

### Triage steps

1. Open the failed workflow run and inspect the `Governance Drift Check (docs/workflow refs)` step log.
2. For quarterly review runs, download artifact `governance-settings-audit` and open `governance-drift-check.txt`.
3. Determine which class of drift occurred:
   - README claim added or edited without a corresponding row in `docs/governance-evidence-index.md`
   - workflow file renamed or removed
   - workflow job id/name changed without updating the evidence index
4. Compare the referenced workflow file under `.github/workflows/` with the affected row in `docs/governance-evidence-index.md`.

### Resolution

- If the README claim is intentional, add or update the matching row in `docs/governance-evidence-index.md`.
- If a workflow or job was renamed intentionally, update the `Workflow job enforcement` column to the active file and job id(s).
- If the workflow/job removal was accidental, restore the governance control or revert the change before merging.
- Re-run `make governance-drift-check` locally before pushing the fix.

### Evidence handling

For quarterly review records, attach both of the following:

- the workflow run URL for the `Governance Settings Audit` execution
- `governance-drift-check.txt` from the uploaded artifact or workflow summary

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
