# Project Alignment and Remediation Plan

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

This plan is an implementation-aware review of repository alignment against the commitments in `README.md`, the documented governance model, and the active CI/CD controls.

It is intentionally task-oriented so maintainers can execute and audit remediation incrementally.

## Alignment Review

### Objective A: Documentation Alignment and Validation

| Area | Current state | Alignment verdict | Why this verdict matters |
| :--- | :--- | :--- | :--- |
| README governance claims are mapped to enforcement points | Claim-to-control mapping exists in `docs/governance-evidence-index.md` and is linked from governance docs | Mostly aligned | The repository can trace claims to workflows and policies, but the audit burden remains high when workflows or artifacts evolve. |
| Governance model reflects trusted-path assumptions | `docs/governance.md` clearly defines trust boundaries and required GitHub settings | Aligned | This is strong governance evidence and supports auditability of external controls. |
| Runtime policy claims for signed and attested deployment | README, governance docs, and the Kyverno policy set document and enforce signature and attestation checks | Aligned | This is the project's strongest integrity boundary and should remain fail-closed. |
| Operational evidence narrative | README posture table is generated from Snyk evidence, while release enforcement is driven by Trivy and ZAP | Partially aligned, clarified but fragile | The boundary is documented, but multiple evidence streams can still confuse contributors and reviewers without stronger guardrails. |
| Local developer onboarding promises | Root README includes the command map and points to `app/readme.md` and package-level flow | Aligned | Onboarding is substantially improved and reproducible for core local tasks. |

### Objective B: Critical Project Analysis

#### Architecture integrity

Strengths:

- clear control-plane separation across PR gate, release gate, GitOps enforcement, and runtime admission
- layered supply-chain controls including digest pinning, signatures, attestations, and policy verification
- explicit governance assumptions and required settings

Primary integrity risks:

- some controls depend on external GitHub configuration and secrets, which creates drift risk if not continuously validated
- durable retention of attestation-verification outcomes remains incomplete, leaving evidence too workflow-log-centric for long-horizon audits

#### Process efficiency

Strengths:

- good fail-fast sequencing across release and promotion
- existing automation for governance drift, metadata freshness, and SLO reporting

Primary efficiency risks:

- overlapping security evidence channels increase review overhead
- remediation tracking is spread across docs, workflows, and issues and can be hard to prioritize operationally

#### Sustainability

Strengths:

- quarterly metadata cadence and the evidence index establish governance hygiene
- the SLO framework provides a path to measurable program health

Primary sustainability risks:

- ownership fields in remediation and governance artifacts remain under-specified in places
- long-term roadmap items such as durable evidence storage and SLSA L3 sequencing are acknowledged but not yet execution-ready

### Objective C: Scope Fit

#### Deficient and needs remediation now

1. Durable, queryable storage for signature and attestation verification outcomes.
2. Stronger anti-drift automation between README claims, governance index rows, and workflow or job names.
3. Clear owner and accountability mapping for unresolved strategic epics.

#### Exceeds baseline expectations and should be retained as strengths

1. Governance-settings audit workflow for external GitHub controls.
2. Governance metadata freshness checks integrated into CI.
3. Governance SLO reporting automation with fixture modes for deterministic validation.

## Prioritized Execution Plan

### Milestone M0: 0 to 30 days

Goal: remove the highest residual ambiguity between documented governance commitments and auditable implementation evidence.

#### Epic M0-E1: Harden README claim drift detection

- Priority: P0
- Problem: claim mapping exists, but verification remains reviewer-heavy and susceptible to silent drift when workflow or job names change

Tasks:

- [ ] Add an automated check that validates all top-level README governance claims have corresponding rows in `docs/governance-evidence-index.md`.
- [ ] Add a CI check for broken references to workflow files and jobs used in the evidence index.
- [ ] Fail with actionable guidance explaining which claim or row is missing or stale.

Deliverables:

- drift-check script and CI integration
- runbook update for handling failures

Acceptance criteria:

- [ ] A renamed or deleted workflow job causes deterministic CI failure with clear remediation text.
- [ ] Quarterly governance review includes automated drift-check output.

Evidence required:

- workflow run link showing pass and fail examples
- drift-check script reference

#### Epic M0-E2: Finalize trust-boundary validation evidence

- Priority: P0
- Problem: the tag-only trust boundary is documented and implemented, but end-to-end evidence closure is still incomplete in remediation history

Tasks:

- [ ] Execute a full tag-triggered release and GitOps enforcement cycle and archive evidence links in this document.
- [ ] Capture Kyverno policy-test evidence for tag-signed images in both positive and negative paths.
- [ ] Close remaining open validation checkboxes inherited from earlier remediation items.

Deliverables:

- evidence appendix with immutable run and artifact references

Acceptance criteria:

- [ ] An auditor can follow one complete governed release path without ambiguity.

Evidence required:

- release run URL
- GitOps run URL
- Kyverno logs or artifacts

#### Epic M0-E3: Define accountable ownership for governance backlog

- Priority: P0
- Problem: program-level placeholders reduce operational accountability

Tasks:

- [ ] Assign a named role or owner for each open epic.
- [ ] Add an escalation contact for policy bypass or release integrity incidents.
- [ ] Add an owner review SLA for unresolved P0 and P1 remediation items.

Deliverables:

- updated ownership metadata block in this plan

Acceptance criteria:

- [ ] Every open epic has an owner, review date, and escalation path.

Evidence required:

- PR review acknowledgement by assigned owners

### Milestone M1: 30 to 90 days

Goal: improve evidence usability and reduce operational overhead without weakening controls.

#### Epic M1-E1: Normalize security evidence narratives across docs

- Priority: P1
- Problem: multiple scanners serve different purposes, but this distinction is easy to misread

Tasks:

- [ ] Add a canonical control-intent matrix reused by README, governance, and threat-model docs.
- [ ] Add an automated docs consistency check for key control terms such as `release-blocking`, `managed debt`, and `posture evidence`.
- [ ] Ensure Snyk section language consistently points to Trivy and ZAP for admission decisions.

Deliverables:

- shared control-intent matrix
- docs consistency guardrail

Acceptance criteria:

- [ ] No conflicting scanner-role wording across README, governance, and threat-model docs in CI checks.

Evidence required:

- docs consistency check output

#### Epic M1-E2: Improve remediation program operability

- Priority: P1
- Problem: the current plan mixes completed historical items with future work, making execution tracking noisy

Tasks:

- [ ] Split historical completed epics into an archived changelog section.
- [ ] Keep active epics in a concise execution-board format with status, owner, due date, and dependency.
- [ ] Add dependency mapping for cross-epic blockers.

Deliverables:

- cleaner remediation tracking structure optimized for execution

Acceptance criteria:

- [ ] Maintainers can identify active priorities in under five minutes.

Evidence required:

- updated remediation board format committed in docs

#### Epic M1-E3: Expand governance-settings audit coverage

- Priority: P1
- Problem: external control drift detection exists, but drift scenarios and expected responses can be broadened

Tasks:

- [ ] Add additional fixture scenarios such as CODEOWNERS enforcement off, tag pattern drift, and environment reviewer drift.
- [ ] Map each drift scenario to explicit response steps and severity.
- [ ] Add quarterly trend summary output by drift type.

Deliverables:

- enhanced fixtures
- drift response taxonomy

Acceptance criteria:

- [ ] Audit workflow can classify drift by category and severity.

Evidence required:

- fixture run artifacts and summary sample

### Milestone M2: 90+ days

Goal: strengthen long-term resilience, audit durability, and maturity toward higher-assurance supply-chain posture.

#### Epic M2-E1: Durable attestation-verification evidence pipeline

- Priority: P1
- Problem: verification outcomes are mostly ephemeral workflow artifacts and logs

Tasks:

- [ ] Define a durable evidence store and retention policy for signature and attestation verification results.
- [ ] Implement signed or tamper-evident export of verification summaries per release.
- [ ] Add a retrieval and query runbook for audits and incident response.

Deliverables:

- durable verification evidence architecture and implementation

Acceptance criteria:

- [ ] Auditors can query verification outcomes across historical releases without replaying old workflow runs.

Evidence required:

- storage design doc
- sample query output

#### Epic M2-E2: SLSA L3-aligned sequencing plan with pilots

- Priority: P2
- Problem: L3-aligned posture is acknowledged, but control sequencing and rollback strategy are not yet formalized

Tasks:

- [ ] Build a gap matrix for hermeticity, reproducibility, build isolation, and dependency provenance.
- [ ] Prioritize controls by risk reduction versus operational cost.
- [ ] Run one pilot control with explicit success, failure, and rollback criteria.

Deliverables:

- time-phased roadmap
- pilot report

Acceptance criteria:

- [ ] Each control has an owner, dependency, validation method, and rollback path.

Evidence required:

- approved roadmap
- pilot retrospective

#### Epic M2-E3: Governance SLO operationalization

- Priority: P2
- Problem: SLO definitions exist, but operational response loops can be tightened

Tasks:

- [ ] Add alert thresholds and owner paging or escalation for SLO breaches.
- [ ] Add a quarterly trend review template covering breach reasons, corrective action, and closure status.
- [ ] Link SLO breach outcomes to remediation backlog updates.

Deliverables:

- closed-loop SLO operations process

Acceptance criteria:

- [ ] Every SLO breach generates traceable corrective action within the same review cycle.

Evidence required:

- quarterly SLO review record with linked remediation updates

## Execution Metadata

- Program owner: _TBD, assign in M0-E3_
- Security reviewer: _TBD, assign in M0-E3_
- Review cadence: Quarterly
- Tracking convention: one issue per epic with linked task checklist and evidence links

### Global Definition of Done

- [ ] Implementation merged
- [ ] Validation evidence attached
- [ ] Documentation synchronized, including `README.md`, governance docs, and this plan where applicable
- [ ] Security and governance reviewer approval recorded
