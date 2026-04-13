# SLSA L3 Pilot Retrospective

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This retrospective records the first SLSA L3-aligned pilot defined in [`docs/slsa-l3-sequencing-plan.md`](slsa-l3-sequencing-plan.md).

## Pilot Summary

- Pilot control: `scripts/check-workflow-input-provenance.py`
- Objective: establish an auditable dependency-provenance baseline for the two highest-trust workflows before promoting the control into CI enforcement
- Scope: `.github/workflows/ci-release-gate.yml`, `.github/workflows/gitops-enforce.yml`
- Run date (UTC): 2026-04-11
- Operator: Codex local workspace run

## Success, Failure, and Rollback Criteria

### Success criteria

- Current workflow files pass without requiring behavioral changes to the release path.
- Unit tests prove the check fails for mutable action refs and mutable OCI tags.
- The control remains standalone so rollback is documentation-and-script only.

### Failure criteria

- The control flags current workflows incorrectly.
- Exceptions are needed for a broad set of workflow inputs, making the signal too noisy.
- The check cannot run with the repo's existing local test setup.

### Rollback criteria

- Remove `scripts/check-workflow-input-provenance.py`, its tests, and roadmap references if maintainers decide not to integrate it after pilot review.
- Do not modify release, GitOps, signing, attestation, or admission controls as part of rollback.

## Execution Notes

Validation commands executed locally:

```bash
python3 scripts/check-workflow-input-provenance.py
pytest scripts/tests/test_workflow_input_provenance.py
python3 scripts/check-docs-metadata.py
```

Observed result summary:

- The provenance check passed on the current `Release` and `GitOps Enforcement` workflows.
- The test suite confirmed expected failures for mutable GitHub Action refs and mutable OCI image tags.
- The pilot did not change workflow behavior or required checks, so there was no release-path disruption during evaluation.

## Pilot Outcome

| Evaluation area | Result | Notes |
| :--- | :--- | :--- |
| Signal quality | Pass | The pilot is intentionally narrow and focuses on the highest-value mutable workflow inputs. |
| Operational cost | Low | Local execution is fast and does not require network access. |
| Risk reduction | Moderate to High | It does not make builds hermetic, but it closes a clear dependency-provenance visibility gap for trusted workflow inputs. |
| Rollback complexity | Low | The pilot is not wired into CI yet, so rollback is a small documentation and script revert. |

## Retrospective Findings

What worked:

- The repo already pins most trusted workflow dependencies tightly enough that a provenance guardrail can pass immediately.
- The pilot gives maintainers a concrete baseline for future CI integration rather than a generic "pin dependencies" recommendation.

What did not change:

- No changes were made to release signing, attestations, Kyverno policy, or GitOps promotion logic.
- The pilot does not yet address package-manager hermeticity, reproducible rebuilds, or hardened runner isolation.

Follow-up recommendation:

- The pilot has been promoted into PR validation as a non-blocking dry run. Keep it advisory for at least two maintainer-reviewed cycles, then decide whether to make it part of the required governance check set.

## Retrospective Record

Retrospective status:
completed

Evidence expected for closure:

- maintainer acknowledgement in the approving roadmap PR
- linked issue comment or quarterly governance review note confirming whether the pilot graduates, iterates, or is retired

Retrospective placeholders:

- Reviewer:
- Review date (UTC):
- Decision:
- Notes:
