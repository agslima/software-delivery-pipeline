# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

[Back](008-database-migration-strategy.md) // [Home](../README.md)

## ADR 009: Progressive Delivery Strategy

_Simple replica-weighted canary for the production backend_

- Status: Accepted
- Date: 2026-04-11
- Context: Software Delivery Pipeline, progressive release governance

## Context

The repository now needs to demonstrate that risky releases can be introduced gradually instead of all at once.
That requires a rollout model which is:

- visible in Git-managed Kubernetes manifests
- reviewable without a live service mesh control plane
- compatible with the repository's governance-first delivery story
- small enough to validate locally and in CI

Several rollout models were considered:

- replica-weighted canary using native Deployments and a shared Service
- service-mesh traffic splitting
- controller-driven progressive delivery such as Argo Rollouts

The more advanced options provide better traffic precision and automation, but they also add new controllers, CRDs, and operational dependencies that this repository does not otherwise use.

## Decision

The repository adopts a simple replica-weighted canary strategy for the production backend.

Specifically:

- production keeps a stable `backend` Deployment and a separate `backend-canary` Deployment
- the shared `backend` Service sends traffic to both tracks
- effective traffic share is approximated by ready replica count, not by a service mesh
- promotion from canary to stable is an explicit, reviewable manifest change

This repository does not claim to support every rollout model.
It intentionally does not introduce service-mesh traffic management or a dedicated rollout controller at this stage.

Normative operating guidance lives in [`docs/canary-rollout-strategy.md`](../canary-rollout-strategy.md).

## Rationale

### 1. Keeps the rollout model honest

Native Kubernetes Deployments plus a shared Service are enough to demonstrate gradual exposure without implying capabilities the repository does not actually operate.

### 2. Preserves reviewability and auditability

Stable and canary state are explicit in Git:

- separate Deployments
- separate digests
- track labels and annotations
- promotion as a follow-up PR or commit

That fits the repository's existing governance model better than hidden controller state.

### 3. Minimizes new trust boundaries

Adding a service mesh or rollout controller would enlarge the trust boundary with:

- new control-plane software
- extra CRDs
- extra operational policy surface

For this reference implementation, that complexity would distract from the core governance story.

## Consequences

### Positive

- phased rollout is visible directly in Kubernetes manifests
- stable and canary states are distinguishable
- promotion and rollback remain small, auditable Git changes
- the repository demonstrates progressive delivery without pretending to be a full mesh platform

### Negative and trade-offs

- traffic weighting is approximate and follows ready replica ratios
- rollout progression is manual and policy-driven, not controller-automated
- the current progressive rollout scope applies only to the production backend, not every component

These trade-offs are acceptable because the repository prioritizes correctness, auditability, and minimal control-plane complexity.

## Alternatives Considered

### 1. Service mesh traffic splitting

Rejected for now because it requires more infrastructure than this repository currently operates and would overstate runtime capabilities.

### 2. Argo Rollouts or a similar controller

Rejected for now because it introduces new CRDs and controller behavior that would need separate governance, policy coverage, and operational runbooks.

### 3. All-at-once production deployment

Rejected because it does not demonstrate controlled exposure for risky backend releases.
