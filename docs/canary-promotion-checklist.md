# Canary Promotion Checklist

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

Use this checklist when reviewing a backend canary rollout.

## Before Canary Exposure

- [ ] Confirm `k8s/overlays/prod/kustomization.yaml` identifies different stable and canary backend digest slots when a new release is under evaluation.
- [ ] Confirm stable `backend` and candidate `backend-canary` render in `kubectl kustomize k8s/overlays/prod`.
- [ ] Confirm the candidate digest already passed release gates for Trivy, ZAP, SBOM, signature, and provenance.
- [ ] Confirm the release is safe for mixed backend versions and does not require a hidden all-at-once dependency cutover.

## During Canary Observation

- [ ] Record the current replica split and expected canary exposure.
- [ ] Check `backend-canary` readiness and liveness state.
- [ ] Check shared-service health through `backend`.
- [ ] Review restart counts and recent logs for canary pods.
- [ ] Record the observation window start and end time.

## Promote

- [ ] Copy the canary digest into the stable backend image slot.
- [ ] Scale canary down only after stable is updated.
- [ ] Record the final promoted digest and the evidence used for approval.

## Stop and Roll Back

- [ ] Halt promotion immediately if rollback triggers in [`rollout-gates-policy.md`](rollout-gates-policy.md) are met.
- [ ] Scale down canary or revert the canary digest to the last known-good value.
- [ ] Record the trigger, impact, and rollback action in the release record or PR.
