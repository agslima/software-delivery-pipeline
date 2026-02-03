# AI Agent Instructions for Secure Software Delivery Pipeline

This repo is a governed CI/CD reference. The application under `app/` is a demo full-stack system (React SPA + Node API + Postgres). Prioritize pipeline, policy, and security controls over feature work.

## Architecture Overview

- CI/CD acts as the control plane: PR checks, release gates, attestations, and GitOps promotion.
- Artifacts are immutable: images are addressed by digest and only trusted after signing and attestations.
- Keyless signing: cosign uses GitHub OIDC; policies enforce issuer and workflow identity.
- Risk acceptance is time-boxed and audited.

## CI/CD Workflows and Gates

### PR Validation (`.github/workflows/ci-pr-validation.yml`)

- Code quality matrix for `app/server` and `app/client`: `npm ci --ignore-scripts`, lint, unit tests.
- Infra hygiene: Hadolint on `app/docker/Dockerfile.server` and `app/docker/Dockerfile.client`, Conftest with `policies/dockerfile.rego`, Kubeconform on `k8s/`.
- Security scan: Gitleaks, Trivy filesystem scan (HIGH/CRITICAL).

### Release Gate (`.github/workflows/ci-release-gate.yml`)

Triggered by tags `v*.*.*` or manual dispatch.

1. Build and push backend and frontend images (digest is the identity).
2. Trivy gate per image: fail if CRITICAL > 0 or HIGH > 5.
3. DAST baseline on digest-based compose (`app/docker-compose.yml` + `app/docker-compose.release.yml`), gate on High > 0.
4. Sign and attest only after gates:
   - cosign sign (OIDC)
   - Trivy attestation predicate type `https://security.sigstore.dev/attestations/vuln/trivy/v1`
   - ZAP attestation predicate type `https://security.sigstore.dev/attestations/dast/zap/v1`
   - SBOM attestation (SPDX)
   - SLSA provenance via `actions/attest-build-provenance`

### Security Deep Scan (`.github/workflows/ci-security-deep.yml`)

Nightly: Gitleaks + Trivy infra and code scans (SARIF) + governance JSON, enforced risk acceptance via `scripts/check-security-debt.sh`. Creates a triage issue on failure. Includes lightweight ZAP baseline.

### Weekly DAST (`.github/workflows/ci-weekly-dast.yml`)

Full ZAP scans with auth:

- Uses `.zap/context.context` and `.zap/rules.tsv`.
- Generates SARIF and gates High findings (confidence >= Medium) and selected Medium categories.

### GitOps Enforcement (`.github/workflows/gitops-enforce.yml`)

Manual promotion:

- Downloads digest artifacts from release.
- Verifies cosign signature plus Trivy/ZAP/SBOM attestations.
- Updates `k8s/overlays/prod/kustomization.yaml` digests.
- Validates rendered manifests with Kyverno (`k8s/policies/cluster/*.yaml`) and opens a PR.

### Sonar (`.github/workflows/sonar.yml`)

Scheduled test+coverage matrix and SonarQube scan.

## Risk Acceptance and Governance

- `scripts/check-security-debt.sh` enforces MEDIUM/LOW Trivy findings:
  - Add to `docs/security-debt.md` with an expiry date, or
  - Add to `.trivyignore` with a comment: `# allow-until: YYYY-MM-DD ...`
- Keep expiry dates current; no permanent exceptions.

## Local Development

Backend:

```bash
cd app/server
npm ci
npm test
npm run dev
```

Frontend:

```bash
cd app/client
npm ci
npm run dev
```

Full stack with compose (expects secrets in `./secrets` or `SECRETS_PATH`):

```bash
cd app
docker compose up --build
```

- Frontend: `http://localhost:4173`
- Backend health: `http://localhost:8080/health`

## Project Structure

```
.github/workflows/
  ci-pr-validation.yml     PR gates
  ci-release-gate.yml      Release build/sign/attest
  ci-security-deep.yml     Nightly governance scan
  ci-weekly-dast.yml       Authenticated DAST
  gitops-enforce.yml       GitOps promotion
  sonar.yml                SonarQube scan
policies/
  dockerfile.rego          OPA policy for Dockerfile
docs/
  security-debt.md         Risk acceptance ledger
  threat-model.md          Threat model
app/
  docker/Dockerfile.server
  docker/Dockerfile.client
  docker-compose.yml
  docker-compose.release.yml
  server/                  Express API
  client/                  React SPA
k8s/
  overlays/prod/           Digest-pinned prod overlay
  policies/cluster/        Kyverno verify policies
.zap/
  context.context          ZAP context
  rules.tsv                ZAP rules
```

## Common Patterns to Preserve

1. Hard gates stay hard: fail fast on policy violations; do not soften exit codes.
2. Digest-pinned images in build, release, and kustomize overlays.
3. Keyless signing plus attestations (predicate types and issuer must match Kyverno policies).
4. Secret handling is file-based (Compose secrets, `RUNNER_TEMP`) and never logged.
5. Dockerfile hardening (pinned base image digests, non-root runtime, remove npm in runtime, healthchecks).

## Release Checklist

- Tag uses semver (`vX.Y.Z`) and points at the intended commit.
- `ci-release-gate.yml` passes (build/push, Trivy gate, DAST, sign/attest).
- Digest artifacts exist for backend and frontend and are used in GitOps promotion.
- `k8s/overlays/prod/kustomization.yaml` is updated via the GitOps PR.
- Cosign/Kyverno identity and predicate types still match (`ci-release-gate.yml`, OIDC issuer, Trivy/ZAP/SBOM/SLSA).

## Red Flags

- Removing digest pins or using mutable tags in `k8s/overlays/prod/kustomization.yaml`.
- Weakening Trivy/DAST gates or deleting output validation checks.
- Changing predicate types or OIDC identity without updating `k8s/policies/cluster/*.yaml`.
- Bypassing risk acceptance (edits to `docs/security-debt.md` or `.trivyignore` without expiry).
- Logging or persisting secrets in repo or CI output.

## Questions for Iteration

1. Does this change the threat model or governance? Update `docs/threat-model.md` or `docs/governance.md`.
2. Should this be a PR or release gate? Add it to the relevant workflow.
3. Do Kyverno policies need updates for new attestations, image names, or environments?
4. Does DAST scope or auth change? Update `.zap/context.context` and `.zap/rules.tsv`.
