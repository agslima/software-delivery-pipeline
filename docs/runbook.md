# Operational Runbook 📖

This runbook documents common failure scenarios, security gate rejections, and operational incidents in the Governed Software Delivery Pipeline.
Its goal is to provide clear, repeatable response steps so failures are handled consistently, audibly, and without bypassing governance controls.


---

## Scope 🎯

This runbook applies to:

CI/CD pipeline executions (GitHub Actions)

Supply chain security controls (Trivy, Cosign, SBOM, Attestations)

Policy enforcement (Kyverno)

GitOps-based Kubernetes deployments


It intentionally focuses on response actions, not tool configuration.


---

## Pipeline Failure: Security Gate (Trivy) 🚨

Symptom

CI job security-scan or container-scan fails

Exit code: 1


Error Message

CRITICAL vulnerabilities found


---

Triage Steps

1. Open the GitHub Actions job logs


2. Download the trivy-results.json artifact (if available)


3. Review:

CVE ID

Affected package

Severity

Fix version (if available)





---

Resolution Paths

✅ Scenario A: Fixable Vulnerability (Preferred)

Update the base image in Dockerfile

Upgrade the vulnerable dependency (e.g., npm update, pip upgrade)

Re-run the pipeline


Rationale: Fixing vulnerabilities preserves a clean supply chain and avoids accumulating risk.


---

⚠️ Scenario B: False Positive or Acceptable Risk

If no patch exists or the risk is deemed acceptable:

Option 1 – CVE Ignore (Temporary)

Add the CVE ID to .trivyignore

Include a justification comment explaining:

Why the risk is acceptable

Why remediation is not currently possible



Option 2 – Managed Security Debt

Create a tracking ticket

Log the issue in docs/security-debt.md

Reference the ticket ID in commit history


⚠️ Critical vulnerabilities must never be ignored without explicit justification.


---

🚨 Pipeline Failure: Supply Chain Integrity (Cosign)

Symptom

Job sign-and-attest fails


Error Message

no matching signatures found


---

Triage Steps

1. Confirm the build-and-push job completed successfully


2. Verify that the image digest exists in the registry


3. Check GitHub Actions permissions:



permissions:
  id-token: write

4. Validate registry credentials:

Docker Hub token not expired

Correct repository namespace





---

Common Root Causes

OIDC token not issued (missing permissions)

Image push failed silently

Tag mismatch vs digest signing

Registry authentication failure



---

Resolution

Fix credentials or permissions

Re-run pipeline from a clean build

Avoid re-signing old or locally cached images



---

🚨 Pipeline Failure: DAST (OWASP ZAP)

Symptom

Job dast-analysis fails


Error Message

High Vulnerabilities Found: > 0


---

Triage Steps

1. Download the zap-report.html artifact


2. Identify:

Affected endpoint

Vulnerability type

Risk level





---

Resolution Paths

✅ Legitimate Vulnerability

Fix the application logic

Common fixes include:

Input validation

Authentication enforcement

CSRF protection




---

⚠️ False Positive / Missing Security Headers

If the app is functioning correctly but headers are missing:

Update app/server/index.js

Add standard security headers (e.g., Helmet)


app.use(helmet());

Re-run DAST after remediation.


---

🚨 Policy Failure: Kyverno (CI Validation)

Symptom

Job policy-validation fails


Error Message

Policy validation failed


---

Triage Steps

1. Review Kyverno CLI output in logs


2. Identify which policy rule failed


3. Check the rendered Kubernetes manifest




---

Common Causes

Image not signed

Missing required attestation

Disallowed image registry

Policy variables not provided in CI context



---

Resolution

Fix the manifest or pipeline configuration

Do not weaken policies to unblock builds

If necessary, follow the Break-Glass process (ADR 005)



---

🚨 GitOps Deployment Failure

Symptom

Deployment PR blocked or reverted

Kubernetes workload fails after rollout



---

Triage Steps

1. Inspect the deployment manifest change


2. Verify image digest and signature


3. Review cluster events (if applicable)




---

Resolution

Roll back to last known-good image digest

Rebuild and re-attest the artifact

Merge via standard GitOps workflow



---

🧯 Emergency Procedures (Break-Glass)

Used only when availability risk outweighs governance controls.

Steps:

1. Document the incident and justification


2. Apply temporary policy exception


3. Deploy minimal fix


4. Remove exception immediately after recovery


5. Perform post-incident review




---

📌 Operational Principles

Failures are signals, not blockers

All exceptions must be auditable

Security debt must be visible and tracked

No manual changes without Git history



---

📎 Related Documents

docs/adr/002-image-signing-attestation.md

docs/adr/003-policy-enforcement-strategy.md

docs/adr/004-vulnerability-thresholds.md

docs/adr/005-break-glass.md

docs/adr/006-scanner-failure-degraded-mode.md

docs/adr/007-supply-chain-incident-response.md



