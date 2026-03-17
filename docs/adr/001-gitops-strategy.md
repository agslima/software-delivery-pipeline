# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

## ADR 001: CI-Driven (Push-Based) GitOps Strategy

- Status: Accepted
- Date: 2026-01-07
- Context: Software Delivery Pipeline design

## Context

The project requires an automated mechanism to update Kubernetes manifests with the immutable image digest of a newly built artifact. The goal is to ensure that cluster state remains declaratively versioned in Git, preventing configuration drift and improving auditability.

Two primary architectural patterns exist for this workflow:

- pull-based GitOps: an in-cluster operator such as Argo CD or Flux monitors the Git repository and synchronizes changes to the cluster
- push-based, CI-driven GitOps: the CI pipeline updates the infrastructure repository or promotion manifests directly

## Decision

The repository adopts a CI-driven, push-based GitOps workflow in which the CI pipeline updates the deployment manifests and opens a pull request against `main`.

## Rationale

While pull-based GitOps is the enterprise standard for large-scale clusters, the push-based model was chosen for this reference implementation because of the following constraints.

### Operational simplicity

A pull-based approach requires persistent infrastructure, including a running cluster and GitOps controller, to demonstrate the full path. The push-based approach keeps the reference implementation accessible to anyone cloning the repository with only GitHub Actions and the repo itself.

### Architecture visibility

By keeping the logic within GitHub Actions, the full flow from build to manifest update remains visible in a single linear execution path, which simplifies debugging and traceability for this use case.

### Portability

This approach minimizes external dependencies, allowing supply-chain topics such as signing, attestations, SBOMs, and governance to remain the focus rather than cluster control-plane operations.

## Consequences

### Positive

- zero infrastructure overhead for a permanent GitOps control plane
- immediate feedback when manifest validation or policy checks fail before merge
- easier reproduction of the governed delivery flow in a standalone repository

### Negative and risks

- the CI system requires write access to the Git repository, which is a broader trust boundary than in a pull-based model
- without an active in-cluster reconciler, direct manual cluster changes are not automatically reverted

The second risk is acceptable here because the repository focuses on delivery governance and promotion integrity rather than full runtime reconciliation.
