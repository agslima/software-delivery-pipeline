# GitHub Actions Workflows

## Pull Request

- `ci-pr-validation.yml` (`CI - PR Validation`): PR checks for app quality, container/policy validation, governance checks, and security scanning.
- `ci-pr-title.yaml` (`Semantic PR`): Enforces semantic PR titles.

## Release and Promotion

- `ci-release-gate.yml` (`Release`): Tag-based release orchestration and gating.
- `release-build-push-dual-registry.yml` (`Release - Build and Push Dual Registry`): Builds and publishes release images.
- `release-trivy.yml` (`Release - Trivy Scan & Attest`): Release image vulnerability scan and attestation.
- `release-dast.yml` (`Release - DAST Analysis (Digest-based)`): Release DAST gate.
- `gitops-enforce.yml` (`GitOps Enforcement`): Verifies release evidence and promotes pinned digests through GitOps.

## Governance and Security

- `ci-security-deep.yml` (`Daily Security Scan`): Scheduled deep security scanning and reporting.
- `ci-weekly-dast.yml` (`DAST Scan`): Scheduled runtime DAST.
- `ci-governance-settings-audit.yml` (`Governance Settings Audit`): Audits repository governance controls.
- `ci-governance-slo-report.yml` (`Governance SLO Report`): Reports governance SLO metrics.
- `snyk-report.yml` (`Snyk Report`): Scheduled Snyk evidence refresh/reporting.
- `ossf.yaml` (`Scorecard`): Scheduled OSSF Scorecard analysis.
- `sonar.yml` (`Run Sonar`): Scheduled Sonar analysis.