# Branch Protection & Governance Model

> ![Notes]
> **Objective**
> Make governance controls non-bypassable, even for contributors with write access.
> This turns GitHub itself into part of the control plane.

This model ensures that no artifact can reach production unless it passes policy-defined quality, security, and provenance requirements, enforced before, during, and after CI execution.

## Summary

This Branch Protection Model ensures that:

- CI pipelines are policy-constrained
- Releases are workflow-controlled
- Artifacts are provable, auditable, and enforceable
- Governance failures surface immediately — not after deployment

## GitHub as the Control Plane

```mermaid
flowchart TB
    %% Developers
    Dev[Developer] -->|PR| GH[GitHub Control Plane]

    %% GitHub as Control Plane
    subgraph GitHub["GitHub Control Plane"]
        BR[Branch Protection Rules]
        PR[Pull Request Workflow]
        CI["Governed CI/CD Pipeline<br/>(GitHub Actions)"]
        ENV["Protected Environments<br/>(Production)"]
        TAG[Protected Release Tags]
    end

    GH --> BR
    GH --> PR
    PR --> CI
    CI --> ENV
    CI --> TAG

    %% CI/CD Governance
    subgraph CI_GOV["Governance Pipeline"]
        S1[Secrets • SAST • SCA • Tests]
        S2[Build • Lint • Scan • DAST]
        S3[Sign • SBOM • Provenance]
    end

    CI --> S1
    S1 --> S2
    S2 --> S3

    %% Artifact Flow
    S3 --> IMG["Signed & Attested Image<br/>(Digest-based)"]
    IMG --> REG[Container Registry]

    %% GitOps & Runtime Enforcement
    REG --> GITOPS[GitOps Manifest Update]
    GITOPS --> K8S[Kubernetes Cluster]

    subgraph RUNTIME["Runtime Enforcement"]
        ADM["Admission Controller<br/>(Kyverno)"]
    end

    K8S --> ADM
    ADM -->|Verify Signature & Provenance| RUN[Running Workload]

    %% Rejection Path
    ADM -.->|Reject Unsigned / Untrusted| REJ[Deployment Blocked]
```
```mermaid
flowchart TB
    %% Actors
    Dev[Developer]
    Maintainer[Maintainer]

    %% GitHub Control Plane
    subgraph GitHub["GitHub Control Plane"]
        BR[Branch Protection Rules]
        PR[Pull Request Workflow]
        TAG_RULE[Tag Protection Rules]
        
        subgraph CI["Governed CI/CD (Actions)"]
            Check["PR Checks<br/>(Tests/SAST/Lint)"]
            Build["Release Pipeline<br/>(Build/Sign/Attest)"]
        end
    end

    %% Flow
    Dev -->|Push Code| PR
    PR -->|Triggers| Check
    Check -->|Status Pass| BR
    BR -->|Merge| Main[Main Branch]
    
    Maintainer -->|Push Tag v1.0| TAG_RULE
    TAG_RULE -->|Triggers| Build

    %% Artifact Flow
    Build -->|1. Sign & Attest| IMG["Signed Artifact"]
    IMG -->|2. Push| REG[Container Registry]

    %% Runtime
    subgraph RUNTIME["Runtime (Kubernetes)"]
        ADM["Admission Controller<br/>(Kyverno)"]
        POD[Running Workload]
    end

    REG -->|GitOps Sync| ADM
    ADM -->|3. Verify Signature| POD
    ADM -.->|Fail Verification| BLOCK[Block Deployment]

    %% Styles
    style ADM fill:#f9f,stroke:#333,stroke-width:2px
    style Build fill:#bbf,stroke:#333,stroke-width:2px
```


> Key Principle:
Governance is enforced before code merges, during artifact creation, and at runtime admission, ensuring that CI pipelines cannot be weakened without detection or enforcement failure.

---

## 1. High-Level Policy (What is Enforced)

For the default branch (`main`):

- 🚫 No direct pushes
- 🔁 All changes must go through Pull Requests
- ✅ All required quality and security checks must pass
- 🏷️ Releases occur only via protected, signed tags
- 🔐 Every artifact is cryptographically linked to:
  - A specific commit
  - A governed CI workflow
  - An SBOM and vulnerability attestations
- 🧭 Governance is enforced before CI executes user-defined logic

This directly supports the design goal:
> “The CI/CD pipeline acts as the primary control plane for quality, security, and traceability.”
---

## Branch Protection Ruleset

**Main Branch (`main`)**
**Ruleset Name: `main`**

**Pull Request Enforcement**

- ✅ Require a pull request before merging
- ✅ Minimum approvals: 1
- ✅ Dismiss stale approvals on new commits
- ⚠️ Require CODEOWNER review
(Optional, but strongly recommended for governance-sensitive files)

**Required Status Checks*"

- ✅ Require status checks to pass before merging
- ✅ Only explicitly selected jobs are allowed:
  - Code Quality & Security Gates
  - Dockerfile Linting
  - DAST (OWASP ZAP)
>❗ Release / signing jobs are intentionally excluded here and enforced via protected tags instead.

**Merge Safety**

- ✅ Require branch to be up to date before merging
- 🚫 Allow force pushes → Disabled
- 🚫 Allow deletions → Disabled
- 🚫 Allow bypassing branch protections → Disabled

**Merge Strategy**
- ❌ Merge commits disabled
- ✅ Squash merges only
  (Ensures linear history and clean provenance mapping)

## 🔐 Protected Release Tags

Tag protection ensures that release creation is not user-driven, but workflow-driven.

#### Tag Rule

- Pattern: v*
- Restrictions:
  - Only GitHub Actions may create tags
  - Optional: Repository Administrators (break-glass) 

This guarantees:
- Releases cannot be created manually
- All releases originate from governed workflows
- Provenance and attestations always map to trusted CI execution

---

## 🔐 Production Environment Rules

Environment: `production`

#### Deployment Controls

- ✅ Required reviewers:
  - Security Approver (or repository owner)
- ✅ Deployment branch restrictions:
  - Allowed ref type: Tags
  - Pattern: v*

This enforces separation of duties:

- Code authors cannot unilaterally deploy
- Production is reachable only via a release artifact

---

## CODEOWNERS

`.github/CODEOWNERS`:

```text
# Governance ownership
.github/workflows/*  @agslima
k8s/**               @agslima
docs/security-debt.md @agslima
```

#### Effect:

Prevents silent modification of governance logic
Forces explicit review for:

- CI/CD pipelines
- Runtime policies
- Risk acceptance documentation


## Threat Model Addressed

This model explicitly defends against:

- Rogue developers removing security steps from CI
- Weakening scans while still producing “valid” artifacts
- Bypassing governance via direct pushes or manual tags
- Drift between documented security posture and runtime reality
- Even if a weakened pipeline produces a signed artifact:
- Runtime admission policies enforce cryptographic proof that mandatory scans were executed.
