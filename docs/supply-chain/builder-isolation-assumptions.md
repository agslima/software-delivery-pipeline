# Builder Isolation Assumptions

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-05-13)

This document records the repository's current builder-isolation assumptions for trusted release and promotion workflows.

It is not a claim that the repository already satisfies SLSA Build L3 hardened-build requirements. It is the current control statement for what the repository does rely on, what it verifies directly, and what remains an accepted external dependency.

Use [`docs/build-l3-checklist-and-patch-plan.md`](/docs/supply-chain/build-l3-checklist-and-patch-plan.md) for the repository-specific patch sequence that follows from these assumptions.

## Scope

Trusted workflow set:

- `.github/workflows/ci-release-gate.yml`
- `.github/workflows/release-build-push-dual-registry.yml`
- `.github/workflows/release-static-risk.yml`
- `.github/workflows/release-dast.yml`
- `.github/workflows/gitops-enforce.yml`

## Current Assumptions

The repository currently assumes:

- trusted build and promotion jobs run on ephemeral GitHub-hosted runners
- runner images and base tooling remain part of the GitHub trust boundary, not a repository-managed boundary
- workflow identity is constrained by GitHub OIDC and verified again before promotion or deployment
- mutable workflow inputs are reduced through SHA pinning, digest pinning, checksum verification, or explicit exception tracking
- signing and provenance are issued only after release-path gates or builder-specific generator steps complete

## Repository-Enforced Isolation Controls

The repository directly enforces or verifies these builder-isolation-adjacent controls:

| Control area | Current enforcement | Evidence |
| :--- | :--- | :--- |
| Workflow immutability | Third-party actions in trusted workflows are pinned and checked by `scripts/check-workflow-input-provenance.py` | provenance check output; trusted workflow files |
| Outbound network visibility | `step-security/harden-runner` runs in release, scanning, reproducibility-pilot, and GitOps promotion jobs with `egress-policy: audit` | workflow steps in trusted workflows |
| Artifact identity | Promotion and deployment use digest-pinned images only | `digest-*` artifacts; GitOps promotion workflow; Kyverno policy |
| Builder identity verification | GitOps verifies SLSA provenance, workflow path, source tag, and builder identity before promotion | `.github/workflows/gitops-enforce.yml`; `k8s/policies/cluster/verify-slsa.yaml` |
| Permission minimization | Trusted workflows declare scoped GitHub token permissions per job rather than relying on broad defaults | workflow `permissions:` blocks |

## Explicit Non-Claims

The repository does not currently claim that it can prove all of the following:

- one build run cannot influence another build run at the platform level
- provenance-signing material is completely inaccessible to user-defined steps under all hosted-runner failure modes
- trusted builds are hermetic
- trusted builds are fully reproducible for every release image

These remain roadmap items for L3-aligned maturity, not current-state guarantees.

## Residual Builder-Isolation Risks

Residual risks accepted today:

- GitHub-hosted runner compromise or platform-level cross-tenant failure
- live network dependencies during trusted builds and scans
- toolchain installers that still depend on trusted upstream release assets
- nondeterminism from package-manager and base-image update behavior that is not yet fully normalized

Current mitigations:

- fail-closed release and promotion verification
- provenance and attestation verification before promotion
- runtime admission verification
- mutable-input inventory and targeted hardening work

## Strengthening Path

Near-term strengthening steps:

1. The release workflow will keep all jobs under `step-security/harden-runner` egress audit or block when possible.
2. replacing mutable installer behavior with checksum verification or mirrored sources
3. use reproducibility pilots to identify nondeterministic build inputs
4. document a future decision on whether L3 pursuit requires a stronger builder model than `ubuntu-latest`

## Review Checklist

When this document is reviewed, confirm:

- trusted workflows still use scoped `permissions:`
- `step-security/harden-runner` remains present in trusted workflows
- GitOps builder-identity verification still matches the active release provenance path
