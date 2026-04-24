# Governance Evidence Index

## Governance Metadata

- **Owner:** Project Maintainers
- **Review cadence:** Quarterly
- **Last reviewed:** 2026-03-22

## Summary

This index is the single-page traceability map for the repository's top-level README claims. Use it to trace each claim to:

- workflow enforcement
- policy or repository enforcement
- durable evidence or artifact locations
- accountable owner and review cadence

When workflow job names, policy files, artifact names, or governance wording change, update this page together with `README.md` and `docs/governance.md`.

## Workflow and Evidence Mapping

### README Claim Traceability

| README claim | Workflow job enforcement | Policy / repository enforcement | Evidence / artifact path | Owner | Review cadence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CI/CD is treated as part of the system's control plane | `.github/workflows/ci-pr-validation.yml` → `code-quality`, `infra-lint`, `governance-and-security-scan`; `.github/workflows/ci-release-gate.yml` → `build-push`, `trivy-scan`, `dast-analysis`; `.github/workflows/gitops-enforce.yml` → `verify-context`, `gitops` | GitHub branch protection on `main`; `.github/CODEOWNERS`; `.github/workflows/ci-governance-settings-audit.yml`; Kyverno CLI validation before promotion PR creation | `.github/workflows/ci-governance-settings-audit.yml`; `governance-settings-audit/governance-drift-check.txt`; `governance-settings-audit/report.json`; `governance-settings-audit/summary.md`; `docs/governance.md` | Project Maintainers | Quarterly |
| Security checks produce verifiable evidence, not only workflow logs | `.github/workflows/ci-release-gate.yml` → `trivy-scan`, `dast-analysis`; `.github/workflows/ci-security-deep.yml` → `security-governance`; `.github/workflows/snyk-report.yml` → `snyk-report` | `docs/security-debt.md`; release thresholds in `.github/workflows/ci-release-gate.yml`; `scripts/check-security-debt.sh` | `trivy-results-backend`; `trivy-results-worker`; `trivy-results-frontend`; `zap-results`; `sbom-*`; `docs/snyk/index.md`; `docs/snyk/html/`; SARIF uploads from `ci-security-deep.yml` | Project Maintainers | Quarterly |
| Container images are signed, attested, and validated through policy before deployment | `.github/workflows/ci-release-gate.yml` → `build-push-*`, `generate-slsa-provenance-*-docker`, `generate-slsa-provenance-*-ghcr`; `.github/workflows/gitops-enforce.yml` → `gitops` | `k8s/policies/cluster/verify-signature.yaml`; `k8s/policies/cluster/verify-trivy.yaml`; `k8s/policies/cluster/verify-zap.yaml`; `k8s/policies/cluster/verify-sbom.yaml`; `k8s/policies/cluster/verify-slsa.yaml` | Release artifacts `digest-backend`, `digest-worker`, `digest-frontend`, `sbom-*`, `trivy-results-*`, `zap-results`; GitOps artifact `kyverno-gitops-log`; `docs/threat-model.md` | Project Maintainers | Quarterly |
| The delivery path is designed to make governance bypass difficult, visible, and auditable | `.github/workflows/ci-pr-validation.yml` → `governance-and-security-scan`; `.github/workflows/gitops-enforce.yml` → `verify-context`, `gitops`; `.github/workflows/ci-governance-settings-audit.yml` → `governance-settings-audit` | GitHub branch/tag/environment protections; `.github/CODEOWNERS`; `k8s/policies/cluster/break-glass-policy.yaml`; `docs/adr/005-break-glass-exception-handling.md`; `scripts/check-governance-drift.sh`; `scripts/check-governance-metadata-freshness.sh` | `governance-settings-audit/governance-drift-check.txt`; `governance-settings-audit/report.json`; `governance-settings-audit/summary.md`; PR status checks from `ci-pr-validation.yml`; `docs/runbook.md`; `docs/governance.md` | Project Maintainers | Quarterly |

## Governance Operations and Audit

### Reviewer Sign-Off

Record reviewer sign-off in the PR or audit trail using this format:

- Reviewer: `@<github-handle>`
- Date (UTC): `YYYY-MM-DD`
- Scope: `governance evidence index wording / traceability`
- Evidence: link to this document and the relevant workflow run or PR review comment
