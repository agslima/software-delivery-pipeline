# GitHub Actions Workflows

This folder contains the active GitHub Actions workflows that power CI, security scanning, release gating, and GitOps promotion for this repo.

**ci-pr-validation.yml**
- Name: PR Validation
- Triggers: `workflow_dispatch`, `pull_request` (opened, synchronize, reopened)
- Summary: Runs Node.js lint and unit tests for `server` and `client`, lints Dockerfiles with Hadolint, validates Dockerfiles with OPA Conftest, validates backend K8s manifests with Kubeconform, and performs secret scanning (Gitleaks) plus Trivy FS scanning (HIGH/CRITICAL). Sends a Slack notification on Trivy failure.

**ci-pr-title.yaml**
- Name: Semantic PR
- Triggers: `pull_request_target` (opened, edited, synchronize)
- Summary: Validates pull request titles against conventional commit types using `amannn/action-semantic-pull-request`; allows optional scope, and supports bypass labels (`bot`, `ignore-semantic-check`).

**ci-release-gate.yml**
- Name: Release
- Triggers: tag push `v*.*.*`, manual with `tag` input
- Summary: Resolves the release tag, builds and pushes backend/frontend images, stores digest artifacts, runs Trivy image scans with a gate (CRITICAL > 0 or HIGH > 5), runs ZAP baseline DAST against an ephemeral compose environment, gates on ZAP High findings, then cosign-signs images and publishes Trivy/ZAP/SBOM attestations plus build provenance.

**ci-security-deep.yml**
- Name: Daily Security Scan
- Triggers: schedule daily at 02:00 UTC, manual, PR changes to this workflow file
- Summary: Runs Gitleaks and Trivy config + code scans (SARIF) plus a full governance JSON scan, uploads SARIF to Code Scanning, uploads artifacts, enforces security debt via `scripts/check-security-debt.sh`, and opens a GitHub issue on failure.

**ci-weekly-dast.yml**
- Name: DAST Scan
- Triggers: schedule Sundays at 04:00 UTC, manual
- Summary: Spins up the app via Docker Compose with file-based secrets, mints a JWT for auth, runs ZAP full scan for frontend, uses OpenAPI discovery for backend API scan (fallback to full scan), gates on High (confidence >= Medium) and selected Medium categories, generates a summary and SARIF, uploads artifacts, opens an issue on failure, and cleans up.

**dependabot-reviewer.yaml**
- Name: Auto-merge for dependabot
- Triggers: `pull_request`
- Summary: For Dependabot PRs, fetches metadata and auto-merges patch/minor updates via `gh pr merge --auto --squash`. Major updates are left for manual review.

**gitops-enforce.yml**
- Name: GitOps Enforcement
- Triggers: manual `workflow_dispatch` with `run_id` (the `workflow_run` trigger is commented out)
- Summary: Downloads image digests from the Release workflow, verifies cosign signatures and Trivy/ZAP/SBOM attestations, updates prod kustomize image digests, validates rendered manifests against Kyverno policies, uploads Kyverno logs, and opens a GitOps PR to `main`.

**sonar.yml**
- Name: Run Sonar
- Triggers: schedule Saturdays at 15:30 UTC, manual
- Summary: Runs tests with coverage for `server` and `client`, uploads LCOV artifacts, then runs SonarQube/SonarCloud analysis using the downloaded coverage.

**snyk-snapshot.yaml**
- Name: Snyk Weekly Snapshot
- Triggers: schedule Mondays at 08:00 UTC, manual
- Summary: Runs `snyk monitor` for dependencies and Dockerfiles, plus IaC and code scans (both continue-on-error) to report results to Snyk.

**Notes**
- `legacy/` contains `ci-cd.txt` and `ci-weekly-dast.txt` as historical references, not active workflows.
