# AI Agent Instructions for Secure Software Delivery Pipeline

This codebase implements a **governed CI/CD pipeline** where security and supply chain integrity are enforced at every stage. Focus on understanding the security controls, pipeline architecture, and risk management philosophy rather than application-level features.

## Architecture Overview

**What This Project Is:** A reference implementation of a **production-grade software delivery pipeline**, not a business application. The prescription management app is intentionally minimal—it's a delivery vehicle to demonstrate governance patterns.

**Core Design Principles:**
- **CI/CD as Control Plane:** GitHub Actions enforces all quality/security gates before artifacts are created
- **Fail-Fast Model:** Builds stop immediately on any policy violation; no container is built/pushed unless ALL gates pass
- **Keyless Signing (OIDC):** No long-lived private keys; signatures bound to ephemeral GitHub Actions OIDC identity
- **Risk Acceptance Philosophy:** Security is not binary—Medium/Low vulnerabilities can be documented as managed debt, tracked in `docs/security-debt.md`, and reviewed every 30 days

## The Four-Stage Pipeline

```
CODE QUALITY → DOCKER LINTING → DAST (OWASP ZAP) → RELEASE & SIGNING
```

### Stage 1: Code Quality & Security (`code-quality` job)
**File:** [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml#L20-L60)  
**Triggers:** Every push, PR, and tag

- **Jest Unit Tests** (`npm test`) — fails if tests don't pass
- **Gitleaks** — detects hardcoded secrets in commit history
- **Snyk SAST/SCA** — scans source code and `package-lock.json` for vulnerabilities
- **Risk Acceptance Policy** (`scripts/check-security-debt.sh`) — Medium/Low CVEs must be acknowledged in `docs/security-debt.md` with the commit hash, or build fails

**Key Pattern:** Snyk results are converted to SARIF and uploaded to GitHub Security tab. The risk acceptance script (`check-security-debt.sh`) enforces policy by searching for the current git commit hash in the debt ledger.

### Stage 2: Docker Linting (`docker-lint` job)
**File:** [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml#L61-L68)

- **Hadolint** enforces Dockerfile best practices:
  - Pin all base image versions (not `latest`)
  - Run as non-root user (enforced in [app/Dockerfile](app/Dockerfile#L31): `USER node`)
  - Minimize layer count for security scanning efficiency

**Key Pattern:** Hadolint failures block the entire pipeline. See [app/Dockerfile](app/Dockerfile) for the reference implementation—note the explicit `--chown=node:node`, `npm ci --only=production`, and `USER node` directives.

### Stage 3: DAST (OWASP ZAP)
**File:** [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml#L69-L118)  
**Triggers:** Main branch and tags only (disabled on PRs to save time)

- Builds the container locally, starts it on port 3000
- Waits for app to respond; **logs container output on failure** (critical for debugging)
- Runs OWASP ZAP baseline scan against the live app

**Key Pattern:** The wait-for-readiness logic uses `timeout 60s bash -c 'until curl -s -f http://localhost:3000'` with explicit `docker logs` dump on failure—this pattern is worth copying for any infrastructure debugging.

### Stage 4: Release, Signing & Attestation
**File:** [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml#L119-end)  
**Triggers:** Tags matching `v*.*.*` only

**Four Sub-Jobs:**

1. **build-push:** Docker build → push to Docker Hub with SHA, `:latest`, and semver tags
   - Uses `docker/build-push-action` with GitHub Actions cache
   - Exports image digest (SHA256) to artifact file for downstream signing
   - Runs Trivy scan post-push (only High/Critical failures allowed)

2. **sign-and-attest:** Signs the immutable digest using keyless cosign
   - Downloads digest artifact from build-push job
   - Signs image: `cosign sign --yes $IMAGE`
   - Verifies signature with OIDC issuer: `https://token.actions.githubusercontent.com`
   - **Generates SBOM** (Syft) in SPDX format
   - **Attests** SBOM to image: `cosign attest --type spdx`
   - **SLSA Provenance:** Uses `actions/attest-build-provenance` to link artifact to exact Git commit and workflow run

3. **Kyverno Policy Validation:** Validates [k8s/deployment.yaml](k8s/deployment.yaml) against [k8s/cluster-policy.yaml](k8s/cluster-policy.yaml)

4. **GitOps Update:** Replaces image tag in deployment manifest with immutable digest (best practice for production)

## Developer Workflows

### Running Locally

```bash
# Start the server (port 8080)
cd app/server
npm ci
npm start

# Run tests
npm test
npm run test:watch
```

**Environment:** Node >=18.0.0. The app loads `.env` via `dotenv` and expects `PORT` (defaults to 8080).

### Building the Docker Image

```bash
docker build --load -t software-delivery-pipeline ./app
docker run -p 3000:8080 --name app-under-test software-delivery-pipeline
```

The Dockerfile uses multi-layer caching. Changes to source code (layer 4) rebuild quickly; dependency changes (layer 3) trigger a full rebuild.

### Testing Security Debt

Edit [docs/security-debt.md](docs/security-debt.md) to acknowledge vulnerabilities:

```markdown
### ID: RISK-2026-001 (BusyBox CVE-2025-46394)
...
Commit: <git-hash>
```

Run `scripts/check-security-debt.sh` manually to validate:

```bash
snyk test --severity-threshold=high --json-file-output=snyk-results.json
./scripts/check-security-debt.sh snyk-results.json
```

## Security Controls & Threat Model

See [docs/threat-model.md](docs/threat-model.md) for deep technical analysis. Key scenarios:

- **Dependency Poisoning:** Snyk SCA blocks High/Critical; Medium/Low require risk documentation
- **Code Injection:** SAST + unit tests catch most issues
- **Artifact Tampering:** Immutable SHA256 digest + Cosign signature prevents registry hijacking
- **Rogue Deployments:** Kyverno policy enforces Cosign signature verification in the cluster
- **Compromised Keys:** Keyless OIDC signing eliminates long-lived private key risk

## Project Structure

```
.github/
  workflows/ci-cd.yml          ← Main pipeline definition
docs/
  threat-model.md              ← Detailed security analysis
  security-debt.md             ← Managed vulnerability ledger
scripts/
  check-security-debt.sh       ← Risk acceptance policy enforcement
app/
  Dockerfile                   ← Multi-stage build with security best practices
  server/
    app.js                     ← Express app (helmet, rate limiting, helmet)
    index.js                   ← Entry point (dotenv, server.listen)
    package.json               ← Node >=18, Express, Passport, bcryptjs, etc.
    tests/                     ← Jest test suites
  public/                      ← Static frontend files
k8s/
  deployment.yaml              ← Kubernetes manifest (updated by GitOps)
  cluster-policy.yaml          ← Kyverno policies enforcing signature verification
```

## Common Patterns to Preserve

1. **Fail-Fast Philosophy:** Always exit non-zero on policy violations. No warnings or soft fails.
2. **Immutable Deployment:** Use SHA256 digests, not tags, in production manifests.
3. **Risk as First-Class Citizen:** Medium/Low CVEs are OK if documented; High/Critical block releases.
4. **Explicit Over Implicit:** The pipeline logs every decision. See the `Enforce Risk Acceptance Policy` step—it's verbose intentionally.
5. **Keyless Signing:** Never commit private keys. OIDC tokens are ephemeral and safer.

## Red Flags

- ❌ Modifying `.only=production` in npm ci without updating Hadolint rules
- ❌ Removing the `docker logs` dump in DAST (makes debugging infrastructure failures hard)
- ❌ Accepting Critical/High vulns without updating threat-model.md
- ❌ Using mutable tags (`:latest`) in production deployments
- ❌ Committing long-lived signing keys or credentials to `.env`

## Questions for Iteration

When implementing features, ask:
1. **Does this change the threat model?** If so, update `docs/threat-model.md`.
2. **Should this be a security gate?** Add it before the build-push job.
3. **Is the risk documented?** If not, add it to `docs/security-debt.md`.
4. **Does this break Kyverno policies?** Run `kyverno apply` to validate manifest changes.
