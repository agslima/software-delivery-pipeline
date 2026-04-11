# GitHub Actions Workflows

This folder contains the active GitHub Actions workflows that power CI, security scanning, release gating, and GitOps promotion for this repo.

**ci-pr-validation.yml**

- Name: PR Validation
- Triggers: `workflow_dispatch`, `pull_request` (opened, synchronize, reopened)
- Summary: Runs Node.js lint and unit tests for `server` and `client`, lints Dockerfiles with Hadolint, validates Dockerfiles with OPA Conftest, validates backend K8s manifests with Kubeconform, runs a dedicated migration safety review for schema-impacting PRs, checks governance drift and governance metadata freshness, and performs secret scanning (Gitleaks) plus Trivy FS scanning (HIGH/CRITICAL). Sends a Slack notification on Trivy failure.

**ci-pr-title.yaml**

- Name: Semantic PR
- Triggers: `pull_request_target` (opened, edited, synchronize)
- Summary: Validates pull request titles against conventional commit types using `amannn/action-semantic-pull-request`; allows optional scope, and supports bypass labels (`bot`, `ignore-semantic-check`).

**ci-release-gate.yml**

- Name: Release
- Triggers: tag push `v*.*.*`
- Summary: Resolves the release tag, builds and pushes backend/worker/frontend images, stores digest artifacts, runs Trivy image scans with a gate (CRITICAL > 0 or HIGH > 5), runs ZAP baseline DAST against an ephemeral compose environment that includes the worker, gates on ZAP High findings, then cosign-signs images and publishes Trivy/ZAP/SBOM attestations plus build provenance.

**ci-security-deep.yml**

- Name: Daily Security Scan
- Triggers: schedule daily at 02:00 UTC, manual, PR changes to this workflow file
- Summary: Runs Gitleaks and Trivy config + code scans (SARIF) plus a full governance JSON scan, uploads SARIF to Code Scanning, uploads artifacts, enforces security debt via `scripts/check-security-debt.sh`, and opens a GitHub issue on failure.

**ci-governance-settings-audit.yml**

- Name: Governance Settings Audit
- Triggers: quarterly schedule (January/April/July/October 1st at 06:00 UTC), manual
- Summary: Runs `make governance-drift-check` to verify README claims and workflow/job mappings before executing `scripts/audit-governance-settings.sh` in live mode against repository rulesets, CODEOWNERS parsing, protected tags, and production environment restrictions; supports fixture-based `fixtures-pass` and `fixtures-drift` test modes for evidence and regression checks.
- Outputs: Artifact `governance-settings-audit` containing `governance-drift-check.txt`, `summary.md`, `report.json`, and raw API responses.
- Permissions/Secrets: Uses `contents: read`; live mode requires `PAT_GITHUB` with read-only repository Administration access.
- Maintenance notes: Keep `.github/rulesets/*.json`, `.github/governance-settings-audit.json`, and `docs/governance.md` aligned when GitHub governance settings intentionally change.

**ci-governance-slo-report.yml**

- Name: Governance SLO Report
- Triggers: weekly schedule (Mondays at 05:00 UTC), manual
- Summary: Runs `scripts/report-governance-slos.py` against live GitHub Actions and issue telemetry or deterministic fixtures to produce governance SLO reporting for release-gate reliability, remediation lead time, and policy-test health.
- Outputs: Artifact `governance-slo-report` containing `summary.md` and `report.json`.
- Permissions/Secrets: Uses `contents: read`, `actions: read`, and `issues: read`; live mode uses `GITHUB_TOKEN`.

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
- Triggers: automatic on successful `Release` completion from a tag `push` (`workflow_run`) and manual `workflow_dispatch` with `run_id`
- Summary: Downloads backend/worker/frontend image digests from the Release workflow, verifies cosign signatures and Trivy/ZAP/SBOM attestations for each deployable image, advances the prod backend canary digest while fully promoting worker/frontend digests, validates rendered manifests against Kyverno policies, uploads Kyverno logs, and opens a GitOps PR to `main`.

**sonar.yml**

- Name: Run Sonar
- Triggers: schedule Saturdays at 15:30 UTC, manual
- Summary: Runs tests with coverage for `server` and `client`, uploads LCOV artifacts, then runs SonarQube/SonarCloud analysis using the downloaded coverage.

**snyk-report.yml**

- Name: Snyk Report
- Triggers: `workflow_dispatch`, weekly schedule (Sundays at 00:00 UTC)
- Summary: Runs `scripts/security/run-snyk.sh` (via `make snyk`) to produce the repository security evidence set, updates the generated marker-delimited block in `readme.md`, refreshes `docs/snyk/`, and opens a PR when the evidence changes.
- Outputs: Updated README governance evidence table in PR diff plus refreshed `docs/snyk/` artifacts.
- Permissions/Secrets: Uses `GITHUB_TOKEN` with `contents: write` and `pull-requests: write`; requires `SNYK_TOKEN`.
- Maintenance notes: `scripts/run-snyk-aggregate.sh` is the only automation that should update the README evidence markers (`<!-- [BEGIN_GENERATED_TABLE] -->` / `<!-- [END_GENERATED_TABLE] -->`).
- Alert routing: Failures are visible in the Actions run and should be triaged by the platform/security maintainers who own CI governance workflows.
- Expected result example: A weekly run updates `readme.md` and `docs/snyk/` together in PR `docs: weekly Snyk security scan update`.

## Notes

- `legacy/` contains `ci-cd.yml`, `trivy-report.yml`, and `ci-weekly-dast.yml` as historical references; it is not an active workflow and no longer owns the README evidence block.
