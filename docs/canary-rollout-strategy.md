# Canary Rollout Strategy

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This document defines the repository's progressive delivery model for risky backend releases.

## Chosen Strategy

The repository uses one progressive delivery pattern:

- simple replica-weighted canary for the production backend

The repository does not claim support for:

- service-mesh traffic shaping
- per-request traffic weights
- automated rollout controllers
- progressive rollout for every workload in the repo

That scope boundary is intentional.

## Scope

Current rollout scope:

- `k8s/overlays/prod/backend-rollout.yaml`
- backend API traffic in the `production` namespace

Current non-scope items:

- `dev` overlay
- `frontend`
- `worker`
- mesh-based routing

Worker and frontend promotion still happen as normal digest updates.
Only the production backend uses the stable/canary split at this time.

## Manifest Model

Production defines:

- shared Service: `backend`
- direct track Services: `backend-stable`, `backend-canary`
- stable Deployment: `backend`
- candidate Deployment: `backend-canary`

Stable and canary are distinguished by:

- `delivery.stayhealthy.io/release-track`
- `delivery.stayhealthy.io/traffic-group`
- rollout annotations such as `delivery.stayhealthy.io/rollout-strategy`

The shared `backend` Service selects both tracks, so traffic share is approximated by ready replica count.

## Progression Mechanism

The progression mechanism is replica-weighted exposure:

1. `backend=3`, `backend-canary=1`
   Approximate exposure: 25% canary
2. `backend=2`, `backend-canary=2`
   Approximate exposure: 50% canary
3. promote digest to stable and scale canary down
   End state: `backend=4`, `backend-canary=0`

Because this is native-Service load balancing, the ratio is approximate rather than exact.
That limitation is accepted and documented.

## Release Flow

1. The governed Release workflow builds, scans, signs, and attests the new backend digest.
2. The GitOps enforcement workflow updates the `backend-canary` digest in `k8s/overlays/prod/kustomization.yaml`.
3. Operators validate the 25% canary using the track-specific Service, shared Service behavior, and the promotion gates in [`rollout-gates-policy.md`](rollout-gates-policy.md).
4. If evidence remains healthy, operators promote by copying the canary digest into the stable backend slot and scaling down canary.
5. If evidence degrades, operators halt promotion and roll back by restoring the prior canary digest or setting canary replicas to zero.

## Promotion and Rollback Ownership

Promotion is intentionally not implicit.

- automated release automation advances the candidate digest
- human review decides whether stable moves
- rollback is a first-class governed action, not an exceptional failure of the model

Use these companion documents during rollout:

- [`rollout-gates-policy.md`](rollout-gates-policy.md)
- [`canary-promotion-checklist.md`](canary-promotion-checklist.md)
- [`canary-rollout-walkthrough.md`](canary-rollout-walkthrough.md)
