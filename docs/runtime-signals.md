# Runtime Signals for Risky Releases

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This document defines the minimum runtime signals required to make rollout and rollback decisions for risky releases.

## Goal

The repository does not require a full observability platform to demonstrate governed release decisions.
It does require enough runtime signal to answer a practical go or no-go question during rollout.

## Minimum Signal Set

The following signals are the minimum required set:

- backend error rate
- export job failure count
- migration duration and migration failure
- readiness failures
- queue depth

These signals are intentionally small in scope and map directly to risky release decisions.

## Signal Reference

### Backend Error Rate

Source:

- `/metrics` on the backend process
- `http_requests_total`

Interpretation:

- derive 5xx rate from responses labeled with 5xx status codes
- compare canary observation period to the stable baseline for the same period

Go / no-go threshold:

- continue only if there is no sustained 5xx increase attributable to the release
- stop if backend 5xx responses remain elevated for the observation window or if operators cannot separate release impact from noise

Applies to:

- phased rollout
- schema change

### Export Job Failure Count

Source:

- worker `/metrics`
- `export_job_outcomes_total{outcome="failed"}`

Interpretation:

- tracks terminal worker failures for async export processing
- use together with `export_job_depth{status="failed"}` and the worker health endpoints

Go / no-go threshold:

- continue only if failed-job count stays at zero or remains explained by pre-existing known failures
- stop if new terminal failures appear after the release and correlate with the candidate version

Applies to:

- worker introduction
- schema change

### Migration Duration and Failure

Source:

- migration job output
- `migration_run_duration_seconds`
- `migration_run_failures_total`

Interpretation:

- migration duration shows whether pre-deploy or expand steps are completing within the expected window
- migration failure is an immediate stop condition for the release sequence

Go / no-go threshold:

- continue only if the migration step completes successfully and within the expected release window
- stop immediately on migration failure
- stop for explicit review when migration duration materially exceeds the planned window and creates uncertainty about compatibility or operator timing

Applies to:

- schema change

### Readiness Failures

Source:

- backend `/api/v1/readyz`
- worker `/ready`
- `/metrics`
- `readiness_failures_total{component="backend|worker"}`

Interpretation:

- repeated readiness failures mean the new version is not stably able to serve traffic or process jobs

Go / no-go threshold:

- continue only if readiness remains stable during the observation window
- stop if readiness failures repeat after rollout starts or cluster probes begin failing persistently

Applies to:

- schema change
- worker introduction
- phased rollout

### Queue Depth

Source:

- worker `/health` and `/ready`
- worker `/metrics`
- `export_job_depth{status="queued"}`
- `export_job_oldest_queued_age_seconds`

Interpretation:

- queue depth indicates whether async work is keeping up during a risky release
- oldest queued age distinguishes a short burst from sustained backlog growth

Go / no-go threshold:

- continue only if queue depth stays stable or returns to baseline during the observation window
- stop for explicit review if queue depth grows continuously, oldest queued age keeps rising, or backlog growth cannot be explained by expected traffic

Applies to:

- worker introduction
- schema change when async processing depends on changed data

## Release-Type Minimum Checks

### Schema Change

Required runtime checks:

- migration duration and migration success
- backend readiness stability
- backend error rate
- worker failure count if async flows touch changed data

### Worker Introduction

Required runtime checks:

- worker readiness stability
- export job failure count
- queue depth
- oldest queued age

### Phased Rollout

Required runtime checks:

- backend readiness stability
- backend error rate
- direct canary health checks
- shared-service health checks

## Evidence Requirement

A risky release is not complete when CI ends.
It is complete only after the required runtime checks are observed and recorded in the release evidence record.

Use:

- [`templates/risky-release-evidence.md`](templates/risky-release-evidence.md)
- [`rollout-gates-policy.md`](rollout-gates-policy.md)
- [`canary-promotion-checklist.md`](canary-promotion-checklist.md)
