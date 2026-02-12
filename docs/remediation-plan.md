# Governance Remediation Plan

This plan translates the previously identified gaps into concrete, auditable work items. It prioritizes governance integrity (policy enforcement, trust boundaries), then operational alignment, and finally maintainability and efficiency. Each item includes a checklist that can be copied into issues or used during reviews.

## Priority 0 — Governance Integrity (Must Fix)

### 0.1 Align runtime trust boundary with tag-only releases
**Goal:** Ensure runtime admission only accepts artifacts produced by tag-based release workflows.

**Why it matters:** The current runtime admission policies accept images signed from branch workflows, which conflicts with the documented release governance model and weakens the trust boundary.

**Checklist**
- [ ] Update Kyverno verify policies to accept only tag-based identities.
- [ ] Confirm policy regex matches `refs/tags/v*` only.
- [ ] Run Kyverno policy tests (CI or local) against a signed tag-based image.
- [ ] Document the change in `docs/governance.md` under tag protections.
- [ ] Validate that GitOps promotion still passes with tag-signed artifacts.

---

### 0.2 Align threat model with actual security tooling
**Goal:** Ensure the threat model reflects current scanning tools (Trivy, Gitleaks, ZAP) or add Snyk if required.

**Checklist**
- [ ] Replace Snyk references with Trivy/Gitleaks where applicable.
- [ ] Confirm CI workflows for SAST/SCA are accurately reflected.
- [ ] Update residual risk section to reflect current tooling and limits.
- [ ] Add a “Controls-to-Workflow” mapping table to prevent future drift.

---

### 0.3 Clarify SLSA level claims
**Goal:** Ensure SLSA claims are defensible and traceable to implementation.

**Checklist**
- [ ] Add a SLSA compliance mapping section (requirements → controls).
- [ ] If not fully compliant, rephrase the README badge or add a “target state” qualifier.
- [ ] Keep SLSA attestation evidence linked to the release workflow.

---

## Priority 1 — Operational Alignment

### 1.1 Make GitOps promotion automatic (or document it as manual)
**Goal:** Remove ambiguity between documentation and actual behavior.

**Checklist**
- [ ] Decide on automatic vs. manual promotion policy.
- [ ] If automatic: enable `workflow_run` with guardrails (e.g., release-only, same-repo).
- [ ] If manual: update README to specify manual promotion trigger.
- [ ] Add a short “Promotion Runbook” section describing when/how to promote.

---

### 1.2 Document required GitHub protections
**Goal:** Make governance enforceable and auditable even when settings are external to the repo.

**Checklist**
- [ ] Add a “Required GitHub Settings” section to README or governance doc.
- [ ] Include branch protection, CODEOWNERS enforcement, and tag protection.
- [ ] Add a verification checklist for maintainers to audit settings quarterly.

---

## Priority 2 — Maintainability & Efficiency

### 2.1 Remove redundant Kyverno validation in GitOps
**Goal:** Reduce workflow noise and prevent duplicated policy evaluation.

**Checklist**
- [ ] Decide whether single-pass or split-pass policy evaluation is preferred.
- [ ] Remove the unused validation step.
- [ ] Preserve detailed logs for troubleshooting.

---

### 2.2 Align Trivy gate thresholds with governance policy
**Goal:** Ensure documentation and gating are consistent.

**Checklist**
- [ ] Decide if High vulnerabilities are always blockers or threshold-based.
- [ ] Update README and security policy to match the actual gate.
- [ ] Add a short rationale statement for governance audits.

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
