# Decisions

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

## Architecture and Tooling Decisions

This document explains the key architectural and tooling decisions made in this repository. The goal is not to claim a universally optimal setup, but to make the trade-offs explicit, with an emphasis on clarity, auditability, and educational value for a governed software supply chain.

## Why GitHub Actions?

_Compared with Jenkins or GitLab CI_

### Decision

GitHub Actions was selected as the CI/CD engine for this project.

### Rationale

#### Minimize operational overhead

This repository is designed as a reference implementation. GitHub Actions removes the need to provision, secure, and maintain CI infrastructure such as agents, controllers, and plugins, allowing the focus to remain on supply-chain security and policy enforcement.

#### CI/CD as code, versioned with the application

Pipeline logic lives alongside application code, Kubernetes manifests, and policies. This provides:

- full version history
- atomic changes, so code and pipeline evolve together
- easier review and auditing

#### Native integration with OIDC and Sigstore

GitHub Actions provides first-class support for:

- OIDC identity tokens
- keyless signing with Cosign
- strong workload identity guarantees

This makes it a strong platform for demonstrating modern, identity-based supply-chain security.

### Trade-offs

- less flexibility than highly customized Jenkins setups
- GitHub-hosted runners are ephemeral and not suitable for long-running jobs

For this use case, these trade-offs are acceptable and intentional.

## Why Cosign?

_Compared with Docker Content Trust or Notary v1_

### Decision

Cosign was chosen for container image signing and attestation.

### Rationale

#### Keyless signing via OIDC

Cosign enables signing without long-lived private keys. Instead, it relies on:

- GitHub Actions OIDC identity
- short-lived certificates
- Fulcio and Rekor

This significantly reduces key-management risk.

#### First-class support for attestations

Cosign supports multiple in-toto attestations, enabling:

- vulnerability scan attestations from Trivy
- DAST attestations from ZAP
- SBOM attestations

These attestations are directly consumed by Kyverno at admission time.

#### Industry momentum and ecosystem alignment

Cosign is part of the Sigstore ecosystem and aligns with:

- SLSA
- Kubernetes admission controls
- policy engines such as Kyverno

### Trade-offs

- requires understanding of Sigstore components
- introduces more concepts than legacy Notary v1

The security and auditability benefits outweigh the added complexity.

## Why Push-Based, CI-Driven GitOps?

_Compared with Argo CD or pull-based GitOps_

### Decision

A CI-driven, push-based GitOps model was selected for this repository.

See [ADR 001](adr/001-gitops-strategy.md) for the full decision record.

### Summary rationale

This project prioritizes:

- accessibility for reviewers
- zero cluster dependency for demonstrating the flow
- clear, linear execution flow

While pull-based GitOps with Argo CD or Flux is the enterprise standard, it introduces:

- persistent cluster infrastructure
- additional controllers and CRDs
- operational complexity unrelated to the core supply-chain topic

For a reference implementation, push-based GitOps provides maximum signal with minimum noise.

## Why Trivy and OWASP ZAP?

### Decision

The pipeline integrates Trivy and OWASP ZAP as security scanners, producing signed attestations.

### Trivy

_SCA and container security_

#### Why Trivy?

- industry-standard open source scanner
- covers OS packages and application dependencies
- generates machine-readable results
- integrates natively with Cosign attestations

#### What it enforces

- no known critical or high vulnerabilities at build time beyond the documented threshold
- cryptographically verifiable vulnerability state at deploy time

### OWASP ZAP

_Dynamic application security testing_

#### Why ZAP?

- de facto open source standard for DAST
- focuses on runtime application behavior
- complements static and dependency scanning

Including DAST in the supply chain demonstrates:

- security validation after deployment
- runtime risk awareness
- attestation-based enforcement beyond static analysis

### Combined value

Together, Trivy and ZAP provide:

- shift-left coverage through dependency and image scanning
- shift-right coverage through runtime security testing
- policy-enforced deployment gates through Kyverno

## Why Expand-and-Contract Database Migrations?

_Compared with one-step, in-place schema replacement_

### Decision

This repository uses an expand-and-contract migration strategy for database schema evolution.

See [ADR 008](adr/008-database-migration-strategy.md) for the full decision record and [database-migration-strategy.md](database-migration-strategy.md) for the normative operating rules.

### Summary rationale

The project needs schema changes that remain safe during:

- rollout
- rollback
- mixed-version execution

Therefore:

- schema changes must be backward-compatible first
- application cutover must happen only after the new shape exists
- destructive cleanup must happen in a later release

This approach is slower than one-step replacement, but it is far easier to review, validate, and govern safely.

## Why Simple Canary Rollout?

_Compared with service-mesh traffic management or controller-driven rollout_

### Decision

The repository uses a simple replica-weighted canary rollout for the production backend.

See [ADR 009](adr/009-progressive-delivery-canary-strategy.md) for the full decision record and [canary-rollout-strategy.md](canary-rollout-strategy.md) for the normative operating model.

### Summary rationale

This project prioritizes:

- clear manifest-level visibility
- minimal new control-plane complexity
- auditable promotion and rollback changes

The chosen design keeps stable and canary as explicit Kubernetes resources in Git.
It does not claim service-mesh precision or automated controller-driven promotion.

## Appendix: Architecture Decision Records

The following ADRs capture the historical decision record for the main governance and delivery patterns in this repository:

- [ADR 001: CI-Driven (Push-Based) GitOps Strategy](adr/001-gitops-strategy.md)
- [ADR 002: Image Signing and Attestation Strategy (Cosign + Kyverno)](adr/002-image-signing-attestation.md)
- [ADR 003: Policy Enforcement Strategy](adr/003-policy-enforcement-strategy.md)
- [ADR 004: Vulnerability Thresholds and Risk Acceptance](adr/004-vulnerability-thresholds-risk-acceptance.md)
- [ADR 005: Break-Glass and Exception Handling Strategy](adr/005-break-glass-exception-handling.md)
- [ADR 006: Scanner Failure and Degraded Mode Strategy](adr/006-scanner-failure-degraded-mode.md)
- [ADR 007: Supply Chain Incident Response and Revocation Strategy](adr/007-supply-chain-incident-response-revocation.md)
- [ADR 008: Database Migration Strategy](adr/008-database-migration-strategy.md)
- [ADR 009: Progressive Delivery Canary Strategy](adr/009-progressive-delivery-canary-strategy.md)
