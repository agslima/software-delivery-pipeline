# Risky Release Evidence Template

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

Use this template for releases that carry elevated delivery risk, especially:

- schema changes
- worker introduction or major worker behavior changes
- phased backend rollout

Complete the sections that apply.
If a section does not apply, say `Not applicable` instead of leaving it blank.

## Release Identity

- Change summary:
- Release ref or PR:
- Risk type:
  Choose one or more: `schema-change`, `worker-introduction`, `phased-rollout`
- Owner:
- Planned release window:

## Why This Release Is Risky

- Risk statement:
- Expected blast radius:
- Customer or operator impact if it degrades:
- Dependencies or compatibility assumptions:

## Change-Specific Expectations

### Schema Change

- Migration phase: `expand`, `cutover`, `cleanup`, or `Not applicable`
- Compatibility impact:
- Rollback compatibility note:
- Pre-deploy or post-deploy steps:

### Worker Introduction

- Queue or job impact:
- Backlog risk:
- Retry or poison-job impact:
- Safe disable or drain path:

### Phased Rollout

- Stable digest:
- Candidate digest:
- Initial rollout ratio:
- Promotion decision point:
- Rollback trigger summary:

## Approval Points

- Required reviewers:
- Manual approval gate:
- Promotion authority:
- Stop or rollback authority:

## Validation and Evidence

- Required checks:
- Smoke tests:
- Health checks:
- Runtime observations:
  - Backend error rate observation:
  - Worker failure count observation:
  - Migration duration / failure observation:
  - Readiness failure observation:
  - Queue depth observation:
- Evidence links:
  - Release workflow run:
  - GitOps or deployment PR:
  - Manifest render or diff:
  - Health output or dashboard:
  - Metrics output or dashboard:
  - Runbook or walkthrough used:

## Rollback / Remediation Plan

- Last known-good version or digest:
- Rollback action:
- Rollback compatibility constraints:
- Remediation owner:
- Communication expectation if rollback is needed:

## Decision Record

- Ready for promotion: `yes` / `no`
- Decision time:
- Decided by:
- Notes:
