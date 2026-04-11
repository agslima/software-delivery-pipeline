# Canary Rollout Walkthrough

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This walkthrough shows one successful phased backend rollout and one halted canary path.
It is an example evidence package for reviewers and operators.

## Scenario A: Successful Canary

### Change

A backend-only change ships in a new candidate digest.
The GitOps PR updates the production canary slot while keeping stable unchanged.

### Initial manifest state

- `backend`: 3 replicas on last known-good digest
- `backend-canary`: 1 replica on candidate digest
- `backend` Service selects both tracks

### Evidence reviewed

- rendered manifest shows different stable and canary backend digests
- `kubectl get deploy -n production` confirms `backend 3/3` and `backend-canary 1/1`
- `curl http://backend-canary.production.svc.cluster.local:8080/health` returns healthy
- shared-service checks through `backend` remain healthy during the observation window

### Decision

Promote after the canary window completes without rollback triggers.

### Promotion change

- copy the canary digest into the stable backend image slot
- scale `backend` to 4
- scale `backend-canary` to 0

### Example evidence artifact

```text
NAME             READY   UP-TO-DATE   AVAILABLE
backend          3/3     3            3
backend-canary   1/1     1            1

backend-canary /health -> 200
backend shared-service /health -> 200
Decision -> promote after 15m observation, no restart growth, no 5xx spike
```

## Scenario B: Bad Canary, Rollout Halted

### Change

A candidate backend digest introduces a regression that passes build-time checks but fails under partial live traffic.

### Failure signal

- canary readiness becomes intermittent
- direct checks through `backend-canary` show 503 responses
- shared-service error rate rises after canary introduction

### Decision

Stop rollout.
Do not promote the canary digest into stable.

### Rollback action

- set `backend-canary` replicas to `0`
- keep the stable digest unchanged
- attach the failed canary evidence to the PR or release record

### Example rollback evidence artifact

```text
NAME             READY   STATUS    RESTARTS
backend          3/3     Running   0
backend-canary   0/1     Running   4

backend-canary /health -> 503
backend shared-service /health -> intermittent 503
Decision -> halt rollout and revert canary exposure
```

## Operator Interpretation

Reviewers should be able to answer three questions from the evidence bundle:

- Which digest was stable?
- Which digest was under canary evaluation?
- Why was the rollout promoted or halted?
