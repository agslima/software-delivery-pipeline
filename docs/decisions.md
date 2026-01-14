# Decisions

Architecture & Tooling Decisions

This document explains the key architectural and tooling decisions made in this repository. The goal is not to claim a universally optimal setup, but to make the trade-offs explicit, focusing on clarity, auditability, and educational value for a governed software supply chain.


---

1. Why GitHub Actions?

(vs Jenkins, GitLab CI)

Decision

GitHub Actions was selected as the CI/CD engine for this project.

Rationale

Minimize operational overhead
This repository is designed as a reference implementation. GitHub Actions removes the need to provision, secure, and maintain CI infrastructure (agents, controllers, plugins), allowing the focus to remain on supply-chain security and policy enforcement.

CI/CD as code, versioned with the application
Pipeline logic lives alongside application code, Kubernetes manifests, and policies. This ensures:

Full version history

Atomic changes (code + pipeline evolve together)

Easier review and auditing


Native integration with OIDC & Sigstore
GitHub Actions provides first-class support for:

OIDC identity tokens

Keyless signing (Cosign)

Strong workload identity guarantees


This makes it an ideal platform for demonstrating modern, identity-based supply chain security.

Trade-offs

Less flexibility than highly customized Jenkins setups

GitHub-hosted runners are ephemeral and not suitable for long-running jobs


For this use case, these trade-offs are acceptable and intentional.


---

2. Why Cosign?

(vs Docker Content Trust / Notary v1)

Decision

Cosign was chosen for container image signing and attestation.

Rationale

Keyless signing via OIDC
Cosign enables signing without long-lived private keys. Instead, it relies on:

GitHub Actions OIDC identity

Short-lived certificates

Fulcio + Rekor transparency log


This drastically reduces key management risk.

First-class support for attestations
Cosign supports multiple in-toto attestations, enabling:

Vulnerability scan attestations (Trivy)

DAST attestations (ZAP)

SBOM attestations


These attestations are directly consumed by Kyverno at admission time.

Industry momentum & ecosystem alignment
Cosign is part of the Sigstore ecosystem and aligns with:

SLSA

Kubernetes admission controls

Policy engines like Kyverno


Trade-offs

Requires understanding of Sigstore components

More concepts than legacy Notary v1


The security and auditability benefits outweigh the added complexity.


---

3. Why Push-Based (CI-Driven) GitOps?

(vs ArgoCD / Pull-Based GitOps)

Decision

A CI-driven (push-based) GitOps model was selected for this repository.

> See ADR 001 below for the full decision record.



Summary Rationale

This project prioritizes:

Accessibility for reviewers

Zero cluster dependency

Clear, linear execution flow


While pull-based GitOps (ArgoCD/Flux) is the enterprise standard, it introduces:

Persistent cluster infrastructure

Additional controllers and CRDs

Operational complexity unrelated to the core supply-chain topic


For a reference implementation, push-based GitOps provides maximum signal with minimum noise.


---

4. Why Trivy and OWASP ZAP?

Decision

The pipeline integrates Trivy and OWASP ZAP as security scanners, producing signed attestations.

Trivy (SCA + Container Security)

Why Trivy?

Industry-standard open source scanner

Covers OS packages and application dependencies

Generates machine-readable results

Integrates natively with Cosign attestations


What it enforces

No known critical/high vulnerabilities at build time

Cryptographically verifiable vulnerability state at deploy time


OWASP ZAP (DAST)

Why ZAP?

De-facto open source standard for DAST

Focuses on runtime application behavior

Complements static and dependency scanning


Why include DAST in the supply chain? Most pipelines stop security checks at build time. Including ZAP demonstrates:

Security validation after deployment

Runtime risk awareness

Attestation-based enforcement beyond static analysis


Combined Value

Together, Trivy and ZAP provide:

Shift-left (dependency & image scanning)

Shift-right (runtime security testing)

Policy-enforced deployment gates via Kyverno



---

Appendix: Architecture Decision Records

The following ADR is included verbatim to preserve historical and architectural context.


- ADR 001 – CI-Driven (Push-Based) GitOps Strategy
- ADR 002 – Image Signing & Attestation Strategy (Cosign + Kyverno)
- docs/adr/003-policy-enforcement-strategy.md
- docs/adr/004-vulnerability-thresholds-risk-acceptance.md
