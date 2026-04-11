# Failure Scenario: Canary Health Degrades

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This walkthrough shows governance behavior during a stressed phased rollout, not only during the happy path.

## Scenario

A backend candidate digest is released through the canary path in production.
Build-time checks, signatures, and attestations passed, but health degrades once the canary receives limited live traffic.

## Detection

Signals that detect the issue:

- `backend-canary` readiness becomes intermittent
- direct checks through `backend-canary` return 503
- shared-service checks through `backend` begin showing elevated error rate after canary introduction
- operator review of pod restarts shows the canary is unstable relative to stable

## Stop Condition

Stop the rollout when any of the following is true:

- canary readiness or liveness fails repeatedly
- canary-specific health checks fail during the observation window
- shared-service health worsens in a way that correlates with canary exposure
- operators cannot explain the degradation well enough to continue safely

## Immediate Response

1. Halt further promotion.
2. Record the current stable digest, canary digest, and replica split.
3. Capture deployment state, health output, and recent canary pod events.
4. Remove canary exposure by scaling `backend-canary` to `0`.

If the candidate digest was advanced again by mistake, restore the last known-good canary value before any new evaluation window begins.

## Rollback or Remediation

Preferred rollback path:

- preserve the stable `backend` Deployment on the last known-good digest
- scale the canary to zero
- keep worker and frontend unchanged unless separate evidence shows they are involved

Remediation options after rollback:

- fix the backend regression and produce a new candidate digest
- reduce the initial exposure ratio only if the issue is understood and the release owner explicitly approves another attempt
- widen scope only after a fresh evidence record is prepared

## Evidence Captured

Attach or link:

- rendered prod manifest showing stable and canary digests
- `kubectl get deploy,po,svc -n production -l app=backend`
- direct `backend-canary` health output
- shared-service health output through `backend`
- operator note with the stop decision time, approver, and rollback action

## Governance Value Demonstrated

This scenario shows why governance is especially valuable during hard releases:

- release evidence distinguishes stable from candidate state
- a human decision point exists before full promotion
- stop and rollback authority are explicit
- the audit trail explains not just that rollout stopped, but why
