# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

## ADR 003: Policy Enforcement Strategy

_CI validation versus cluster admission control_

- Status: Accepted
- Date: 2026-01-07
- Context: Software Delivery Pipeline, policy enforcement design

## Context

This project enforces multiple governance and security controls using Kyverno policies, including:

- image signature verification
- vulnerability scan attestations from Trivy and ZAP
- digest-pinned images for immutable deployments

A key architectural decision is where and how these policies should be enforced across the delivery lifecycle.

Two primary enforcement points exist:

1. CI-time validation
   CI policies are evaluated using the Kyverno CLI during GitHub Actions and applied to Kubernetes manifests before they are merged or promoted.
2. Cluster-time admission control
   Policies are enforced by Kyverno admission controllers running inside the Kubernetes cluster, where requests are allowed or denied at runtime.

Each approach provides different guarantees, visibility, and trade-offs.

## Decision

The project adopts a dual-scope policy enforcement strategy.

### CI scope

_Preventive controls_

Kyverno policies are evaluated during CI to validate:

- manifest structure
- digest pinning
- baseline security posture

`verifyImages` rules are acknowledged as non-enforceable in the Kyverno CLI and treated as informational in CI.

### Cluster scope

_Authoritative controls_

Full enforcement of image signature verification and attestation validation occurs at cluster admission time using Kyverno.

These controls act as the final security gate before workloads run.

This separation is intentional and explicitly documented.

## Rationale

### 1. Kyverno CLI and admission controller capabilities differ

Kyverno CLI is designed for static analysis of manifests and does not fully resolve:

- remote registry lookups
- Cosign signature verification
- attestation verification with live transparency logs

Attempting to treat CI-based Kyverno execution as equivalent to admission control leads to false failures and brittle pipelines.

Therefore:

- CI validation focuses on what can be deterministically evaluated
- runtime verification is delegated to the cluster

### 2. Shift left without over-claiming enforcement

CI enforcement provides:

- early feedback to developers
- fast failure before merge
- policy-as-code validation

But it does not replace runtime enforcement.

This avoids the common anti-pattern:

> Security theater in CI, no real enforcement in production.

### 3. Clear trust boundaries

| Layer | Responsibility |
| :--- | :--- |
| CI pipeline | Build integrity, signing, attestations, and manifest correctness |
| Git repository | Declarative source of truth |
| Kubernetes admission | Runtime trust verification |
| Runtime | Execution only of verified artifacts |

This aligns with Zero Trust and SLSA principles.

## Implementation Details

### CI scope in GitHub Actions

Kyverno CLI is executed with:

- structural validation
- digest enforcement

Expected behavior:

- `verifyImages` rules are expected to be skipped
- skipped rules are treated as informational, not failures

Example CI log interpretation:

```text
Notice: verifyImages rules skipped by Kyverno CLI (expected in CI).
Policy validation passed (CI scope).
```

This behavior is explicitly handled in pipeline logic.

### Cluster scope in Kubernetes

In a real deployment, Kyverno runs as:

- admission controller
- background controller, optionally

At this stage, Kyverno authoritatively enforces:

- Cosign image signatures
- Trivy vulnerability attestations
- ZAP DAST attestations
- immutable image digests

A workload will not be admitted if these conditions fail.

## Consequences

### Positive

- accurate security guarantees because policies are enforced where they are technically valid
- reduced CI noise because registry and attestation resolution limitations do not become false negatives
- clear operational model where CI validates and the cluster enforces
- production-grade pattern that mirrors real Kyverno usage

### Negative and trade-offs

- some controls, especially signature and attestation failures, are enforced only at admission time rather than in CI
- full guarantees depend on Kyverno being installed and properly configured in the cluster
- the distinction requires documentation to avoid confusion

This ADR explicitly addresses that documentation need.

## Alternatives Considered

### 1. CI-only enforcement

Rejected because:

- Kyverno CLI cannot reliably enforce `verifyImages`
- security guarantees would be incomplete
- it creates a high risk of false confidence

### 2. Cluster-only enforcement with no CI validation

Rejected because:

- developers would receive feedback too late
- simple errors such as mutable tags could reach production-facing workflows
- developer experience and delivery speed would degrade
