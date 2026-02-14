# AI Agent Instructions for Secure Software Delivery Pipeline

This repository is a governance-first CI/CD reference. The demo workload under `app/` is a prescription portal (React + Vite frontend, Node + Express backend, PostgreSQL), but most changes should preserve supply-chain controls, policy enforcement, and auditability.

## Current Architecture Snapshot

- CI/CD is the control plane: PR quality/security checks, release gates, attestations, and GitOps promotion.
- Container artifacts are immutable and digest-addressed.
- Signing is keyless with GitHub OIDC + cosign.
- Kubernetes admission is enforced with Kyverno verification policies for signature + attestations.
- Risk acceptance is explicitly time-boxed and enforced in automation.

## Active Workflows (`.github/workflows/`)

- `ci-pr-validation.yml` (PR Validation)
  - Lint + unit tests for `app/server` and `app/client`.
  - Hadolint + Conftest (`policies/dockerfile.rego`) + Kubeconform validation on `k8s/`.
  - Gitleaks and Trivy filesystem scan with HIGH/CRITICAL gating.

- `ci-release-gate.yml` (Release)
  - Triggered by `v*.*.*` tags or manual dispatch.
  - Builds and pushes backend/frontend images and records digests.
  - Trivy image gate: fail when `CRITICAL > 0` or `HIGH > 5`.
  - ZAP baseline DAST against digest-based release compose environment.
  - On successful gates: cosign signing + Trivy/ZAP/SBOM attestations + SLSA provenance.

- `gitops-enforce.yml` (GitOps Enforcement)
  - Manual promotion workflow using a release run ID.
  - Verifies signatures and attestations before updating `k8s/overlays/prod/kustomization.yaml`.
  - Validates rendered manifests with Kyverno cluster policies.
  - Opens a PR with digest updates.

- `ci-security-deep.yml` (Daily Security Scan)
  - Nightly deep scan with Gitleaks + Trivy (code/config/SARIF + governance JSON).
  - Enforces `scripts/check-security-debt.sh` and opens an issue on failure.

- `ci-weekly-dast.yml` (DAST Scan)
  - Weekly authenticated ZAP full scan using `.zap/context.context` and `.zap/rules.tsv`.
  - Gates on high findings (and selected medium categories), publishes SARIF/artifacts.

- `sonar.yml` (Run Sonar)
  - Scheduled + manual tests with coverage and Sonar analysis.

- `snyk-snapshot.yaml` (Snyk Weekly Snapshot)
  - Weekly/manual Snyk monitor for dependencies, Docker images, IaC, and code snapshots.

- `dependabot-reviewer.yaml` (Dependabot auto-merge)
  - Auto-merges patch/minor Dependabot updates; major updates stay manual.

> `legacy/` workflow text files are reference-only and not active pipelines.

## Policy and Governance Sources of Truth

- Dockerfile policy (OPA): `policies/dockerfile.rego`
- Cluster verification policies (Kyverno): `k8s/policies/cluster/*.yaml`
- Additional K8s policies: `k8s/policies/supply-chain-policy.yaml`, `k8s/policies/pod-hardening.yaml`
- Risk acceptance ledger: `docs/security-debt.md`
- Governance + threat model: `docs/governance.md`, `docs/threat-model.md`
- Operational runbook and architecture context: `docs/runbook.md`, `docs/architecture.md`

## Delivery Invariants (Do Not Weaken)

1. Keep hard gates hard (Trivy/DAST/policy checks should fail the run when thresholds are exceeded).
2. Keep image references digest-pinned in release artifacts and `k8s/overlays/*/kustomization.yaml`.
3. Preserve keyless signing + attestations and their predicate types expected by Kyverno policies.
4. Keep secret handling file-based where designed (`/run/secrets`, `RUNNER_TEMP`); never log secrets.
5. Maintain Dockerfile hardening (non-root runtime, pinned bases, health checks, minimal runtime surface).

## Workload and Platform Paths

- Workload: `app/`
  - Frontend: `app/client/`
  - Backend: `app/server/`
  - Docker assets: `app/docker/`, `app/docker-compose*.yml`
  - Edge proxy: `app/nginx/nginx.conf`
- Kubernetes manifests:
  - Base: `k8s/base/`
  - Overlays: `k8s/overlays/dev`, `k8s/overlays/prod`
  - Policy tests: `k8s/tests/`
- DAST config: `.zap/context.context`, `.zap/rules.tsv`


## GitHub Ruleset Template Storage

Store GitHub ruleset JSON exports in a dedicated folder:

- Canonical location: `.github/rulesets/`
- Use stable, lowercase, no-space filenames (for example):
  - `.github/rulesets/branch-protection-main.json`
  - `.github/rulesets/tag-protection-release.json`

Why this location:
- Keeps governance-as-code artifacts beside workflows and repository policy controls.
- Makes ruleset templates easy to discover, review, and protect via `CODEOWNERS`.
- Avoids path/name friction in automation and shell scripts (spaces/casing differences).

If legacy files exist at the root of `.github/` (for example `branch-protection.json` or `Tag Protection.json`), treat them as migration candidates and standardize to `.github/rulesets/` in the next governance cleanup PR.

## Change Checklist for Agents

- If workflow behavior changes, update `.github/workflows/README.md`.
- If security thresholds or exception process changes, update docs and enforcement script together.
- If attestation/signature identity changes, update matching Kyverno verification policies.
- If API/auth/DAST scope changes, update `.zap/` config and related docs.
- If architecture or control intent changes, update `docs/architecture.md`, `docs/threat-model.md`, and/or `docs/governance.md`.
