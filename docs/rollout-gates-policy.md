# Rollout Gates Policy

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This document defines promotion gates for backend canary rollout in production.

## Policy Goal

Governance must cover the state where a release is in progress, not only the final fully promoted state.

## Required Health Checks

The canary must remain healthy at both the pod and service level.

Required checks:

- Kubernetes readiness probe on `/api/v1/readyz`
- Kubernetes liveness probe on `/health`
- direct canary Service check through `backend-canary`
- shared production Service check through `backend`

Minimum evidence expectation before promotion:

- canary pods stay `Ready`
- no sustained restart loop
- no sustained 5xx increase attributable to canary
- no rollback-triggering alert during the observation window

## Evidence Expectations

Promotion review must capture evidence that is easy to audit later.

Required evidence types:

- rendered prod manifest showing stable and canary digests
- `kubectl get deploy,po,svc -n production -l app=backend`
- direct `curl` or synthetic health checks against `backend-canary`
- shared-service health checks against `backend`
- runtime signal review from [`runtime-signals.md`](runtime-signals.md), especially backend error-rate and readiness observations
- operator note recording the start time, observation window, and decision

The evidence may be attached to a PR, change ticket, or release record, but it must identify:

- the stable digest
- the canary digest
- the replica ratio under observation
- the promotion or rollback decision
- who made the decision and when

Audit trail expectation:

- record the decision in the PR, change ticket, or release note
- keep links to the evidence bundle and manifest diff
- make the final promote or stop decision traceable to a named reviewer or operator

## Manual Approval Point

The repository already uses the protected `production` GitHub environment for release-sensitive steps.
That reviewer gate is the manual approval point before trusted release artifacts are produced.

For rollout promotion itself, maintainers should require a second explicit review on the manifest change that moves the canary digest into stable.

## Promotion and Rollback Authority

Authority is intentionally explicit:

- promotion from canary to full rollout requires an approving project maintainer or release reviewer tied to the production change record
- stop or rollback authority belongs to the operator actively supervising the rollout and to project maintainers
- when evidence is ambiguous, the default decision is to stop the rollout and preserve stable

## Promotion Rules

Promotion from canary to stable is allowed only when:

- release provenance, signature, and attestation gates already passed
- canary-specific health checks pass for the planned observation window
- no open rollback trigger is active
- the promotion checklist in [`canary-promotion-checklist.md`](canary-promotion-checklist.md) is complete

## Rollback Triggers

Stop rollout and roll back when any of the following is true:

- canary pods fail readiness or liveness checks repeatedly
- the shared Service shows a sustained error increase after canary introduction
- the canary-specific Service fails health checks
- a schema-compatibility or downstream dependency issue appears during the observation window
- operators cannot explain the observed degradation with sufficient confidence to continue safely

## Rollback Action

Preferred rollback actions, in order:

1. scale `backend-canary` to zero if the stable digest is still healthy
2. restore the previous canary digest if the candidate was already advanced
3. if a mistaken promotion already happened, revert the stable digest to the last known-good value

Rollback must preserve evidence of:

- what trigger fired
- what manifest change was made
- which digest remained trusted as stable
