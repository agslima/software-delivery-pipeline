# Project Alignment & Remediation Plan

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-14)

This plan is a critical, implementation-aware review of repository alignment against the commitments in `readme.md`, the documented governance model, and active CI/CD controls.

It is intentionally task-oriented (epics/milestones) so maintainers can execute and audit remediation incrementally.

---

## 1) Alignment Review (README Claims vs Current State)

### Objective A — Documentation Alignment & Validation

| Area | Current state | Alignment verdict | Why this verdict matters |
| :--- | :--- | :--- | :--- |
| README governance claims are mapped to enforcement points | Claim-to-control mapping exists in `docs/governance-evidence-index.md` and is linked from governance docs | **Mostly aligned** | The repository can trace claims to workflows/policies, but the audit burden remains high when workflows/artifacts evolve. |
| Governance model reflects trusted-path assumptions | `docs/governance.md` clearly defines trust boundaries and required GitHub settings | **Aligned** | This is strong governance evidence and supports auditability of external (non-git) controls. |
| Runtime policy claims for signed/attested deployment | README + governance + Kyverno policy set document and enforce signature/attestation checks | **Aligned** | This is the project’s strongest integrity boundary and should remain fail-closed. |
| Operational evidence narrative | README posture table is generated from Snyk evidence, while release enforcement is Trivy/ZAP | **Partially aligned (clarified but fragile)** | Boundary is documented, but multi-source evidence can still confuse contributors/reviewers without stronger guardrails. |
| Local developer onboarding promises | Root README includes command map + pointer to `app/readme.md` and package-level flow | **Aligned** | Onboarding is significantly improved and reproducible for core local tasks. |

### Objective B — Critical Project Analysis

#### Architecture Integrity

- **Strengths**
  - Clear control-plane separation: PR gate, release gate, GitOps enforcement, runtime admission.
  - Supply-chain controls are layered (digest pinning, signatures, attestations, policy verification).
  - Governance assumptions and required settings are explicitly documented.

- **Primary integrity risks**
  - Some controls depend on external GitHub configuration and secrets (e.g., governance settings audit token), creating drift risk if not continuously validated.
  - Durable retention of attestation-verification outcomes remains incomplete; evidence is still too workflow-log-centric for long-horizon audits.

#### Process Efficiency

- **Strengths**
  - Good fail-fast sequencing across release and promotion.
  - Existing automation for governance drift, metadata freshness, and SLO reporting.

- **Primary efficiency risks**
  - Overlapping security evidence channels (Trivy/ZAP release gates + Snyk posture stream + deep scans) increase review overhead.
  - Remediation tracking is spread across docs/workflows/issues and can be hard to prioritize operationally.

#### Sustainability

- **Strengths**
  - Quarterly metadata cadence and evidence index establish governance hygiene.
  - SLO framework provides a path to measurable program health.

- **Primary sustainability risks**
  - Ownership fields in remediation/governance program artifacts are still under-specified in places.
  - Long-term roadmap items (durable evidence storage, SLSA L3 sequencing) are known but not yet execution-ready.

### Objective C — Scope Fit (Deficient vs Exceeds)

- **Deficient / needs remediation now**
  1. Durable, queryable storage for signature/attestation verification outcomes.
  2. Stronger anti-drift automation between README claims, governance index rows, and workflow/job names.
  3. Clear owner/accountability mapping for unresolved strategic epics.

- **Exceeds baseline expectations (retain as strengths)**
  1. Governance-settings audit workflow for external GitHub controls.
  2. Governance metadata freshness checks integrated in CI.
  3. Governance SLO reporting automation with fixture modes for deterministic validation.

---

## 2) Prioritized Execution Plan (Epics & Milestones)

## Milestone M0 (0-30 days): Close High-Confidence Governance Gaps

**Goal:** Remove the highest residual ambiguity between documented governance commitments and auditable implementation evidence.

### Epic M0-E1 — Harden README claim drift detection

- **Priority:** P0
- **Problem:** Claim mapping exists, but verification remains reviewer-heavy and susceptible to silent drift when workflow/job names change.
- **Tasks**
  - [ ] Add an automated check that validates all top-level README governance claims have corresponding rows in `docs/governance-evidence-index.md`.
  - [ ] Add a CI check for broken references to workflow files/jobs used in the evidence index.
  - [ ] Fail with actionable guidance (which claim/row is missing or stale).
- **Deliverables**
  - Drift-check script and CI integration.
  - Runbook update for handling failures.
- **Acceptance criteria**
  - [ ] A renamed/deleted workflow job causes deterministic CI failure with clear remediation text.
  - [ ] Quarterly governance review includes automated drift-check output.
- **Evidence required**
  - Workflow run link showing pass/fail examples.
  - Drift-check script reference.

### Epic M0-E2 — Finalize trust-boundary validation evidence

- **Priority:** P0
- **Problem:** Tag-only trust boundary is documented and implemented, but end-to-end evidence closure is still incomplete in remediation history.
- **Tasks**
  - [ ] Execute a full tag-triggered release + GitOps enforcement cycle and archive evidence links in this document.
  - [ ] Capture Kyverno policy-test evidence for tag-signed images (positive and negative path).
  - [ ] Close remaining open validation checkboxes inherited from earlier remediation items.
- **Deliverables**
  - Evidence appendix with immutable run/artifact references.
- **Acceptance criteria**
  - [ ] Auditor can follow one complete governed release path without ambiguity.
- **Evidence required**
  - Release run URL, GitOps run URL, Kyverno logs/artifacts.

### Epic M0-E3 — Define accountable ownership for governance backlog

- **Priority:** P0
- **Problem:** Program-level placeholders reduce operational accountability.
- **Tasks**
  - [ ] Assign named role/owner for each open epic (not `_TBD_`).
  - [ ] Add escalation contact for policy bypass or release integrity incidents.
  - [ ] Add owner review SLA for unresolved P0/P1 remediation items.
- **Deliverables**
  - Updated ownership metadata block in this plan.
- **Acceptance criteria**
  - [ ] Every open epic has owner + review date + escalation path.
- **Evidence required**
  - PR review acknowledgement by assigned owners.

---

## Milestone M1 (30-90 days): Reduce Audit Friction and Evidence Ambiguity

**Goal:** Improve evidence usability and reduce operational overhead without weakening controls.

### Epic M1-E1 — Normalize security evidence narratives across docs

- **Priority:** P1
- **Problem:** Multiple scanners serve different purposes (admission gate vs posture), but this distinction is easy to misread.
- **Tasks**
  - [ ] Add a canonical “control intent matrix” (Preventive/Detective/Enforcing) reused by README, governance, and threat-model docs.
  - [ ] Add an automated docs consistency check for key control terms (`release-blocking`, `managed debt`, `posture evidence`).
  - [ ] Ensure Snyk section language consistently points to Trivy/ZAP for admission decisions.
- **Deliverables**
  - Shared control-intent matrix and consistency guardrail.
- **Acceptance criteria**
  - [ ] No conflicting scanner-role wording across README/governance/threat model in CI checks.
- **Evidence required**
  - Docs consistency check output.

### Epic M1-E2 — Improve remediation program operability

- **Priority:** P1
- **Problem:** Current plan mixes completed historical items with future work, making execution tracking noisy.
- **Tasks**
  - [ ] Split historical-completed epics into an archived changelog section.
  - [ ] Keep active epics in a concise “current execution board” format (status, owner, due date, dependency).
  - [ ] Add dependency mapping for cross-epic blockers (e.g., durable evidence storage prerequisite for audit readiness).
- **Deliverables**
  - Cleaner remediation tracking structure optimized for execution.
- **Acceptance criteria**
  - [ ] Maintainers can identify active priorities in under 5 minutes.
- **Evidence required**
  - Updated remediation board format committed in docs.

### Epic M1-E3 — Expand governance-settings audit coverage

- **Priority:** P1
- **Problem:** External control drift detection exists, but drift scenarios and expected responses can be broadened.
- **Tasks**
  - [ ] Add additional fixture scenarios (e.g., CODEOWNERS enforcement off, tag pattern drift, environment reviewer drift).
  - [ ] Map each drift scenario to explicit response steps and severity.
  - [ ] Add quarterly trend summary output (count by drift type).
- **Deliverables**
  - Enhanced fixtures and drift response taxonomy.
- **Acceptance criteria**
  - [ ] Audit workflow can classify drift by category and severity.
- **Evidence required**
  - Fixture run artifacts and summary sample.

---

## Milestone M2 (90+ days): Strategic Trust Maturity

**Goal:** Strengthen long-term resilience, audit durability, and maturity toward higher-assurance supply-chain posture.

### Epic M2-E1 — Durable attestation-verification evidence pipeline

- **Priority:** P1
- **Problem:** Verification outcomes are mostly ephemeral workflow artifacts/logs.
- **Tasks**
  - [ ] Define durable evidence store and retention policy for signature/attestation verification results.
  - [ ] Implement signed or tamper-evident export of verification summaries per release.
  - [ ] Add retrieval/query runbook for audits and incident response.
- **Deliverables**
  - Durable verification evidence architecture + implementation.
- **Acceptance criteria**
  - [ ] Auditors can query verification outcomes across historical releases without replaying old workflow runs.
- **Evidence required**
  - Storage design doc and sample query output.

### Epic M2-E2 — SLSA L3-aligned sequencing plan with pilots

- **Priority:** P2
- **Problem:** L3-aligned posture is acknowledged, but control sequencing and rollback strategy are not formalized.
- **Tasks**
  - [ ] Build a gap matrix for hermeticity, reproducibility, build isolation, and dependency provenance.
  - [ ] Prioritize controls by risk reduction vs operational cost.
  - [ ] Run one pilot control with explicit success/failure rollback criteria.
- **Deliverables**
  - Time-phased roadmap and pilot report.
- **Acceptance criteria**
  - [ ] Each control has owner, dependency, validation method, and rollback path.
- **Evidence required**
  - Approved roadmap + pilot retrospective.

### Epic M2-E3 — Governance SLO operationalization

- **Priority:** P2
- **Problem:** SLO definitions exist, but operational response loops can be tightened.
- **Tasks**
  - [ ] Add alert thresholds and owner paging/escalation for SLO breaches.
  - [ ] Add quarterly trend review template (breach reasons, corrective action, closure status).
  - [ ] Link SLO breach outcomes to remediation backlog updates.
- **Deliverables**
  - Closed-loop SLO operations process.
- **Acceptance criteria**
  - [ ] Every SLO breach generates traceable corrective action within the same review cycle.
- **Evidence required**
  - Quarterly SLO review record with linked remediation updates.

---

## 3) Execution Metadata (Active Program)

- **Program owner:** _TBD (assign in M0-E3)_
- **Security reviewer:** _TBD (assign in M0-E3)_
- **Review cadence:** Quarterly
- **Tracking convention:** one issue per epic + linked task checklist + evidence links

### Global Definition of Done

- [ ] Implementation merged
- [ ] Validation evidence attached
- [ ] Documentation synchronized (`readme.md`, governance docs, this plan as applicable)
- [ ] Security/governance reviewer approval recorded

