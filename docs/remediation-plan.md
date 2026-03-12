# Governance Remediation Plan

This plan translates the previously identified gaps into concrete, auditable work items. It prioritizes governance integrity (policy enforcement, trust boundaries), then operational alignment, and finally maintainability and efficiency. Each item includes a checklist that can be copied into issues or used during reviews.

## Priority 0 — Governance Integrity (Must Fix)

### 0.1 Align runtime trust boundary with tag-only releases

**Goal:** Ensure runtime admission only accepts artifacts produced by tag-based release workflows.

**Why it matters:** The current runtime admission policies accept images signed from branch workflows, which conflicts with the documented release governance model and weakens the trust boundary.

**Checklist**

- [x] Update Kyverno verify policies to accept only tag-based identities.
- [x] Confirm policy regex matches `refs/tags/v*` only.
- [ ] Run Kyverno policy tests (CI or local) against a signed tag-based image.
- [x] Document the change in `docs/governance.md` under tag protections.
- [ ] Validate that GitOps promotion still passes with tag-signed artifacts.

---

### 0.2 Align threat model with actual security tooling

**Goal:** Ensure the threat model reflects current scanning tools (Trivy, Gitleaks, ZAP) or add Snyk if required.

**Checklist**

- [x] Replace Snyk references with Trivy/Gitleaks where applicable.
- [x] Confirm CI workflows for SAST/SCA are accurately reflected.
- [x] Update residual risk section to reflect current tooling and limits.
- [x] Add a “Controls-to-Workflow” mapping table to prevent future drift.

---

### 0.3 Clarify SLSA level claims

**Goal:** Ensure SLSA claims are defensible and traceable to implementation.

**Checklist**
- [x] Add a SLSA compliance mapping section (requirements → controls).
- [x] If not fully compliant, rephrase the README badge or add a “target state” qualifier.
- [x] Keep SLSA attestation evidence linked to the release workflow.

---

## Priority 1 — Operational Alignment

### 1.1 Make GitOps promotion automatic (or document it as manual)
**Goal:** Remove ambiguity between documentation and actual behavior.

**Checklist**
- [x] Decide on automatic vs. manual promotion policy.
- [x] If automatic: enable `workflow_run` with guardrails (e.g., release-only, same-repo).
- [ ] If manual: update README to specify manual promotion trigger.
- [ ] Add a short “Promotion Runbook” section describing when/how to promote.

---

### 1.2 Document required GitHub protections

**Goal:** Make governance enforceable and auditable even when settings are external to the repo.

**Checklist**
- [x] Add a “Required GitHub Settings” section to README or governance doc.
- [x] Include branch protection, CODEOWNERS enforcement, and tag protection.
- [x] Add a verification checklist for maintainers to audit settings quarterly.

---

## Priority 2 — Maintainability & Efficiency

### 2.1 Remove redundant Kyverno validation in GitOps

**Goal:** Reduce workflow noise and prevent duplicated policy evaluation.

**Checklist**
- [x] Decide whether single-pass or split-pass policy evaluation is preferred.
- [x] Remove the unused validation step.
- [x] Preserve detailed logs for troubleshooting.

---

### 2.2 Align Trivy gate thresholds with governance policy
**Goal:** Ensure documentation and gating are consistent.

**Checklist**
- [x] Decide if High vulnerabilities are always blockers or threshold-based.
- [x] Update README and security policy to match the actual gate.
- [x] Add a short rationale statement for governance audits.

Rationale: Keep a risk-based Trivy policy (`CRITICAL > 0` blocks; `HIGH > 5` per image blocks) to preserve delivery flow while maintaining explicit, auditable governance thresholds.

---

### 2.3 Fix local development instructions
**Goal:** Ensure onboarding is accurate and reproducible.

**Checklist**
- [ ] Update root README to point to `app/` for install/test/start.
- [ ] Add a root-level `npm` script or a short note on multi-package setup if needed.

---

## Governance-Centric Issue Template (Copy/Paste)

Use this when filing each remediation item.

```
## Summary
<Concise description of the governance gap>

## Governance Impact
- [ ] Prevents bypass of release controls
- [ ] Eliminates documentation-to-implementation drift
- [ ] Improves auditability

## Scope
- Affected docs:
- Affected workflows/policies:
- Affected runtime enforcement:

## Acceptance Criteria
- [ ] Documentation updated and consistent
- [ ] Policies/workflows updated and tested
- [ ] Evidence/links captured (logs, attestations, screenshots)

## Checklist
- [ ] Implementation
- [ ] Tests/validation
- [ ] Documentation updates
- [ ] Stakeholder review (Security/Release)

## Evidence
- Links to workflow runs / logs:
- Artifacts (attestations, reports):
```

---

## Project Alignment Review Backlog (Epics & Milestones) — 2026-03-12

Convert the alignment review into execution-tracked work packages so maintainers can plan, assign, and audit outcomes.

### Milestone M0 (0-30 days): Documentation-to-Control Alignment

**Objective:** Close immediate drift and evidence-clarity gaps between `readme.md`, governance docs, and enforced workflows.

#### Epic M0-E1 — Clarify README claims vs enforcement boundaries

- **Problem statement:** README posture evidence (Snyk snapshots) can be conflated with release admission controls (Trivy/ZAP gates).
- **Tasks**
  - [ ] Add explicit wording in `readme.md` that release blocking is Trivy/ZAP-driven and Snyk is posture evidence.
  - [ ] Add direct links from README evidence section to `docs/threat-model.md` and release gate workflow jobs.
  - [ ] Add one reviewer checklist item to verify claim/control wording consistency each quarter.
- **Deliverables**
  - Updated README evidence language.
  - Cross-links to enforcement sources of truth.
- **Acceptance criteria**
  - [ ] A reviewer can distinguish evidence reporting vs admission gate behavior in under 2 minutes.
  - [ ] No conflicting wording remains between README and governance/threat-model docs.
- **Evidence required**
  - README diff link.
  - PR review note confirming wording check.

#### Epic M0-E2 — Complete open validation gaps from Priority 0/1 items

- **Problem statement:** Critical remediation items are marked implemented, but key validation checkboxes remain open.
- **Tasks**
  - [ ] Execute Kyverno policy tests against a signed **tag-based** image path.
  - [ ] Execute/verify GitOps promotion with tag-signed artifacts and capture logs.
  - [ ] Update checklist states in this file with links to concrete evidence.
- **Deliverables**
  - Closed validation checkboxes for 0.1 and related 1.x dependencies.
  - Linked workflow run evidence.
- **Acceptance criteria**
  - [ ] All validation-related unchecked boxes under Priority 0 are either completed or explicitly deferred with rationale.
  - [ ] Evidence links are durable and auditable.
- **Evidence required**
  - Workflow run URLs.
  - Artifact/log references.

#### Epic M0-E3 — Fix onboarding/documentation usability debt

- **Problem statement:** Local development guidance is effectively hidden, reducing reproducibility for new contributors.
- **Tasks**
  - [ ] Restore concise root-level onboarding in `readme.md` (or explicit pointer to `app/readme.md`).
  - [ ] Document multi-package command flow (server/client) without duplicating app-level docs.
  - [ ] Validate commands still match package scripts.
- **Deliverables**
  - Usable root onboarding section with correct command paths.
- **Acceptance criteria**
  - [ ] New contributor can run server/client lint/test/start using only root README plus linked app docs.
- **Evidence required**
  - README diff.
  - Command transcript from validation run.

---

### Milestone M1 (30-90 days): Governance Auditability Automation

**Objective:** Reduce manual governance drift by automating verification of external controls and document freshness.

#### Epic M1-E1 — Automate GitHub settings conformance checks

- **Problem statement:** Branch/tag/environment protections are external to git content and can drift silently.
- **Tasks**
  - [ ] Add a read-only audit script/workflow that checks branch protection, CODEOWNERS enforcement, protected tags, and environment restrictions.
  - [ ] Define pass/fail output schema for quarterly audit evidence.
  - [ ] Add runbook guidance for handling failed governance audits.
- **Deliverables**
  - Automated governance-settings audit job.
  - Standardized audit report artifact.
- **Acceptance criteria**
  - [ ] Audit job can detect at least one intentionally introduced protection drift in test mode.
  - [ ] Quarterly maintainer checklist references automated output.
- **Evidence required**
  - Job logs/artifacts.
  - Example failed + passing run evidence.

#### Epic M1-E2 — Add documentation freshness controls

- **Problem statement:** `last_reviewed`/`last validated` metadata can become stale, weakening governance credibility.
- **Tasks**
  - [ ] Add CI check for stale governance metadata beyond declared cadence.
  - [ ] Define approved override path for exceptions (time-bound, justified).
  - [ ] Surface failures with actionable remediation hints.
- **Deliverables**
  - Metadata freshness check integrated into CI.
- **Acceptance criteria**
  - [ ] Stale doc metadata causes deterministic, understandable CI failure.
- **Evidence required**
  - CI job output showing pass/fail behavior.

#### Epic M1-E3 — Consolidate governance evidence index

- **Problem statement:** Evidence is fragmented across docs and workflow artifacts, increasing audit friction.
- **Tasks**
  - [ ] Create a single evidence index mapping each README claim to workflow job, policy, and artifact path.
  - [ ] Add ownership + review cadence metadata for each mapping row.
  - [ ] Link index from README and `docs/governance.md`.
- **Deliverables**
  - Governance evidence index page.
- **Acceptance criteria**
  - [ ] Auditor can trace any top-level README claim to enforcement + evidence within one page.
- **Evidence required**
  - Index doc link.
  - Reviewer sign-off.

---

### Milestone M2 (90+ days): Strategic Resilience & Maturity

**Objective:** Improve measurable governance outcomes and strengthen long-term trust assurances.

#### Epic M2-E1 — Define governance SLOs and reporting

- **Problem statement:** Governance performance is described qualitatively; operational targets are not yet formalized.
- **Tasks**
  - [ ] Define SLOs for release-gate reliability, remediation lead time, and policy-test health.
  - [ ] Add periodic reporting mechanism (dashboard/report artifact).
  - [ ] Define breach response and ownership.
- **Deliverables**
  - Governance SLO definition doc + reporting path.
- **Acceptance criteria**
  - [ ] SLOs are measurable from existing telemetry/artifacts.
- **Evidence required**
  - SLO doc.
  - Sample report output.

#### Epic M2-E2 — Improve trust-boundary observability

- **Problem statement:** Critical attestation verification outcomes are mostly in workflow logs and not centrally retained.
- **Tasks**
  - [ ] Export signature/attestation verification outcomes to durable audit storage.
  - [ ] Define retention and integrity requirements for audit records.
  - [ ] Update incident-response references to consume this trail.
- **Deliverables**
  - Durable verification audit trail design + implementation.
- **Acceptance criteria**
  - [ ] Verification history is queryable across releases without replaying workflow logs.
- **Evidence required**
  - Storage location and sample query/report.

#### Epic M2-E3 — Progress SLSA L3-aligned hardening roadmap

- **Problem statement:** Current posture is defensible at L2 with L3-aligned elements; roadmap needs explicit sequencing.
- **Tasks**
  - [ ] Document L3 gap matrix (hermeticity, reproducibility, isolation, dependencies).
  - [ ] Prioritize incremental controls by risk reduction vs operational cost.
  - [ ] Define pilot milestones with rollback criteria.
- **Deliverables**
  - Time-phased SLSA hardening roadmap.
- **Acceptance criteria**
  - [ ] Each proposed L3-aligned control has owner, risk impact, and validation method.
- **Evidence required**
  - Gap matrix.
  - Approved roadmap artifact.

---

## Program Governance Metadata (for all epics above)

- **Program owner:** _TBD_
- **Security reviewer:** _TBD_
- **Target review cadence:** Quarterly
- **Tracking convention:** one issue per epic + linked checklist task IDs
- **Definition of done (global):**
  - [ ] Implementation complete
  - [ ] Validation evidence attached
  - [ ] Documentation updated
  - [ ] Governance reviewer approval recorded
