# SLSA L3 Sequencing Plan

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This document turns the repository's existing "L3-aligned controls in progress" statement into an execution plan with explicit sequencing, validation, and rollback expectations.

It is intentionally scoped to the build-track gaps already acknowledged in [`docs/governance.md`](governance.md#slsa-level-review-and-requirement-mapping): hermeticity, reproducibility, build isolation, and dependency provenance.

## Objective and Scope

Objective:
formalize a time-phased path from the current SLSA Build L2 posture toward L3-aligned build controls without weakening existing governance gates or release integrity.

In scope:

- release and promotion workflow controls in `.github/workflows/ci-release-gate.yml` and `.github/workflows/gitops-enforce.yml`
- build inputs that materially affect provenance trust for backend, worker, and frontend images
- pilot controls that can be validated and rolled back without bypassing existing signatures, attestations, or admission policy

Out of scope for this plan:

- claiming formal SLSA L3 certification
- replacing the current Sigstore, Kyverno, or GitOps architecture
- weakening fail-closed release or admission behavior while pilots run

## Current-State Gap Matrix

| Dimension | Current posture | Gap to L3-aligned posture | Risk if deferred | Existing evidence |
| :--- | :--- | :--- | :--- | :--- |
| Hermeticity | Release builds run on ephemeral GitHub-hosted runners with pinned workflow actions, but builds still depend on live network access for package resolution, installer downloads, registry pushes, and scanner database refreshes. | Reduce mutable network inputs during trusted build stages, define which external fetches remain allowed, and introduce a controlled path for pre-fetched or mirrored build dependencies. | Upstream package or installer drift can change build behavior between releases and make provenance harder to interpret during incidents. | `.github/workflows/ci-release-gate.yml`; `docs/governance.md`; `docs/threat-model.md` |
| Reproducibility | Artifact identity is digest-based and provenance is emitted, but the repo does not yet perform a deterministic rebuild comparison or record a reproducibility threshold. | Add a reproducibility check that rebuilds at least one target from the same source and compares digest or normalized output, with explicit tolerance criteria. | Incident response must trust a single build path; silent build drift can remain undetected until after release. | `digest-*` release artifacts; `actions/attest-build-provenance`; `docs/governance.md` |
| Build isolation | Trusted builds are tag-gated, use hosted runners, and sign only after release gates pass. However, runner hardening assumptions remain external to the repo and job-level isolation expectations are not codified as a roadmap. | Document and incrementally tighten builder trust assumptions, including action pinning, image pinning, permission minimization, and isolation expectations for future self-hosted or hardened runners. | A compromised or drifted builder environment could still produce apparently valid provenance from a weak execution context. | `.github/workflows/ci-release-gate.yml`; `.github/workflows/gitops-enforce.yml`; `docs/threat-model.md` |
| Dependency provenance | Release workflows already pin most third-party GitHub Actions by full SHA and pin the ZAP image by digest, but the repo lacks a dedicated control that continuously validates high-trust workflow input pinning or records exceptions. | Add an explicit dependency-provenance guardrail for workflow actions and OCI images, then extend it toward mirrored installers and package-source attestations. | Mutable third-party workflow inputs can weaken trust in build provenance even when artifact attestations are present. | Workflow files; `docs/adr/002-image-signing-attestation.md`; pilot evidence in [`docs/slsa-l3-pilot-retrospective.md`](slsa-l3-pilot-retrospective.md) |

## Prioritization Model

Scoring guidance:

- Risk reduction: `High`, `Medium`, or `Low` based on how much the control reduces undetected trust drift in the release path.
- Operational cost: `High`, `Medium`, or `Low` based on implementation complexity, contributor friction, and rollback effort.
- Sequencing rule: implement the highest risk-reduction items first when rollback is simple and existing controls stay intact.

| Priority | Control | Dimension | Risk reduction | Operational cost | Why it is sequenced here |
| :--- | :--- | :--- | :--- | :--- | :--- |
| P0 | High-trust workflow input provenance check for release and GitOps workflows | Dependency provenance | High | Low | It closes an immediate blind spot with no release-path behavior change and gives maintainers a concrete baseline for future hardening. |
| P1 | Action and installer exception inventory with approved mirror strategy | Dependency provenance, hermeticity | High | Medium | The repo already depends on a small number of mutable installer endpoints; cataloging and governing them is the clean next step after the pilot. |
| P2 | Rebuild-and-compare reproducibility check for one release image | Reproducibility | High | Medium | It materially increases confidence in provenance but needs clearer tolerance rules and likely longer CI time. |
| P3 | Trusted dependency prefetch or mirror path for build-time package sources | Hermeticity | Medium | High | This improves build determinism but introduces the most operational churn, so it should follow inventory and reproducibility work. |
| P4 | Hardened builder isolation profile and runner trust review | Build isolation | Medium | High | Valuable, but partially constrained by GitHub-hosted runner controls outside the repo; better sequenced after repository-native controls are in place. |

## Time-Phased Roadmap

### Phase 0: 0 to 30 days

Goal:
establish an auditable baseline for dependency provenance without changing release promotion behavior.

| Control | Owner | Dependencies | Validation method | Rollback path |
| :--- | :--- | :--- | :--- | :--- |
| Pilot high-trust workflow input provenance check | Project Maintainers | Python 3 + `PyYAML`; access to `.github/workflows/ci-release-gate.yml` and `.github/workflows/gitops-enforce.yml` | Run `python3 scripts/check-workflow-input-provenance.py`; confirm all third-party action refs are full-SHA pinned and OCI image refs are digest-pinned; regression coverage in `scripts/tests/test_workflow_input_provenance.py` | Remove the standalone script and documentation references if it creates noise or false positives; no workflow rollback is required because enforcement is not yet wired into CI. |
| Record approved exceptions for mutable installer sources | Project Maintainers with Security Reviewer sign-off | Pilot output; review of installer URLs used by release workflows | Manual review captured in roadmap approval and quarterly governance review | Revert the exception inventory entries and keep the current documented posture if the exception model is too coarse. |

### Phase 1: 30 to 60 days

Goal:
turn the pilot baseline into a governed dependency-provenance control and reduce known mutable inputs.

| Control | Owner | Dependencies | Validation method | Rollback path |
| :--- | :--- | :--- | :--- | :--- |
| Promote the workflow provenance check into `make governance-checks` and PR validation after two green pilot cycles | Project Maintainers | Stable pilot output; no unresolved false positives; maintainer approval | Local `make workflow-input-provenance-check`; PR validation now runs it as a non-blocking dry run before any required-check rollout | Remove the make/CI wiring and revert to standalone execution if contributor friction or false positives exceed the pilot thresholds. |
| Mirror or otherwise govern mutable installer downloads used in trusted workflows | Project Maintainers | Approved exception inventory; mirror location or checksum strategy | Validate mirrored source references and successful release dry run | Restore the previous installer path if mirror availability causes failed releases; document the exception and incident in governance evidence. |

### Phase 2: 60 to 90 days

Goal:
add the first reproducibility evidence and constrain mutable build inputs further.

| Control | Owner | Dependencies | Validation method | Rollback path |
| :--- | :--- | :--- | :--- | :--- |
| Add a rebuild-and-compare reproducibility job for one release image | Project Maintainers with Security Reviewer review | Phase 1 provenance guardrail; agreed reproducibility threshold; acceptable CI runtime budget | Compare rebuild digest or normalized build output from the same ref; record pass/fail evidence in workflow artifacts | Disable the extra reproducibility job and preserve artifact signing on the existing path if the comparison is too flaky or exceeds runtime budget. |
| Document allowed network egress and mutable inputs for trusted build steps | Project Maintainers | Current release workflow inventory; reproducibility pilot results | Governance doc review plus dry-run verification that the documented inputs match workflow behavior | Revert the documented constraint set if it proves materially incomplete; do not weaken existing release gates. |

### Phase 3: 90+ days

Goal:
address the highest-cost hermeticity and build-isolation gaps once baseline provenance and reproducibility controls are stable.

| Control | Owner | Dependencies | Validation method | Rollback path |
| :--- | :--- | :--- | :--- | :--- |
| Introduce pre-fetched or mirrored package-source path for trusted release builds | Project Maintainers | Phase 2 network-input inventory; operational owner for the mirror/cache path | Release dry run from tag; compare artifact outputs and release duration before and after the change | Revert to live upstream package resolution if the mirror path becomes unavailable or materially delays recovery. |
| Formal builder trust review and hardened isolation profile | Project Maintainers with Security Reviewer review | Phase 2 evidence; decision on GitHub-hosted vs. hardened builder model | ADR or roadmap addendum plus successful release rehearsal under the hardened profile | Revert to the current hosted-runner model if the hardened profile reduces delivery reliability without clear risk-reduction gain. |

## Pilot Control Definition

Pilot control:
`scripts/check-workflow-input-provenance.py`

Purpose:
verify that the highest-trust workflows already align with a minimum dependency-provenance baseline by requiring full-SHA pinning for third-party GitHub Actions and digest pinning for OCI image references.

Pilot scope:

- `.github/workflows/ci-release-gate.yml`
- `.github/workflows/gitops-enforce.yml`

Success criteria:

- the script passes on the current trusted workflows
- the script clearly fails when a mutable action ref or tagged OCI image is introduced
- maintainers can run the pilot locally without network access

Failure criteria:

- false positives require broad exception handling
- the script cannot distinguish trusted installer exceptions from actionable provenance drift
- contributors cannot run the check with the repo’s current local test tooling

Rollback criteria:

- remove the standalone script and documentation references if the pilot produces sustained false positives or maintainers conclude the signal is too weak for future CI integration

## Approval Record

Roadmap status:
drafted and ready for maintainer approval

Approval evidence expected:

- approving PR review from project maintainers
- linked issue or quarterly governance review entry that accepts the sequencing order and named owners

Approval placeholders:

- Approver:
- Approval date (UTC):
- Linked PR / issue:
- Notes:
