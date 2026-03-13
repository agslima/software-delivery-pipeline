# Governance SLOs

## Governance Metadata

- **Owner:** Project Maintainers
- **Review cadence:** Quarterly
- **Last reviewed:** 2026-03-13

## Purpose

This document defines the measurable governance service-level objectives (SLOs) for the repository and the reporting path used to review them.

These SLOs are intentionally limited to signals that already exist in repository telemetry or durable artifacts:

- GitHub Actions workflow and job history
- `docs/security-debt.md`
- GitHub issue metadata linked from the security debt registry

## SLO Definitions

| SLO | Objective | Measurement source | Window | Owner |
| :--- | :--- | :--- | :--- | :--- |
| Release-gate reliability | `>= 95%` successful completion rate for the last `20` completed `Release` workflow runs | `.github/workflows/ci-release-gate.yml` workflow conclusions from the GitHub Actions runs API | Last 20 completed release runs | Project Maintainers |
| Remediation lead time | `p80 <= 30 days` from linked GitHub issue creation to resolved debt entry date | `docs/security-debt.md` resolved entries plus GitHub issue `created_at` timestamps | All resolved debt entries with GitHub issue links | Project Maintainers |
| Policy-test health | `>= 95%` success rate for backend `Infra Hygiene` jobs in the last `20` completed `CI` workflow runs | `.github/workflows/ci-pr-validation.yml` jobs API for `Infra Hygiene (backend)` | Last 20 completed CI runs | Project Maintainers |

## Why These Are Measurable

- Release-gate reliability uses existing `Release` workflow run conclusions; no new application telemetry is required.
- Remediation lead time uses the already-maintained `docs/security-debt.md` registry and linked GitHub issue dates.
- Policy-test health uses the existing `Infra Hygiene` backend job, which already includes Kyverno tests and other policy enforcement checks.

## Reporting Path

The automated report path is:

- Workflow: `.github/workflows/ci-governance-slo-report.yml`
- Script: `scripts/report-governance-slos.py`
- Artifact: `governance-slo-report`
- Files:
  - `summary.md`
  - `report.json`

The workflow supports:

- `live`: report against the current repository telemetry in GitHub
- `fixtures-pass`: deterministic passing sample output
- `fixtures-breach`: deterministic failing sample output

## Report Schema

`report.json` uses this structure:

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `schema_version` | string | Report format version |
| `repository` | string | Audited repository |
| `mode` | string | `live` or `fixture` |
| `generated_at` | string | UTC report generation time |
| `overall_status` | string | `pass`, `breach`, or `insufficient_data` |
| `slos[]` | array | Per-SLO entries with `id`, `name`, `target`, `actual`, `unit`, `samples`, `status`, `source`, `owner`, and `breach_response` |

## Breach Response

### Release-gate reliability

- Review the failing `Release` runs within 2 business days.
- Classify the cause as governance enforcement, tooling failure, or platform instability.
- If the breach is tooling/platform-driven, record the incident and remediation in the governance evidence trail before the next release.

### Remediation lead time

- Review the linked debt tickets within 2 business days.
- Reassign or escalate stale items to an accountable owner.
- If the queue cannot be reduced promptly, update the quarterly governance review with the reason and corrective plan.

### Policy-test health

- Treat a breach as governance regression risk.
- Inspect failing backend `Infra Hygiene` jobs within 2 business days.
- Restore green status or document a temporary, time-bound exception in the same audit cycle.

## Review Expectations

At least once per quarter:

- attach the latest `governance-slo-report/summary.md` or `report.json` to the governance review record
- confirm the SLO targets still reflect acceptable operational expectations
- update this document when job names, telemetry sources, or debt workflow expectations change
