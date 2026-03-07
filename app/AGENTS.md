# AGENTS.md

## Scope and Inheritance

This file applies to the entire repository.

If a deeper `AGENTS.md` exists for a subdirectory, the deeper file **inherits this file by default** and may:

- add stricter local rules,
- add directory-specific context,
- override root guidance **only where it explicitly says so**.

Unless a deeper file explicitly overrides a rule, **root rules still apply**.

---

## Repository Context

This repository is a governance-first software delivery reference implementation.

Key assumptions:

- CI/CD is a control plane for quality, security, and release integrity.
- Supply-chain controls such as signing, attestations, and provenance are first-class.
- Kubernetes admission policy is part of the trust boundary.
- Documentation is governance evidence and must remain aligned with implementation.

The workload application exists to exercise pipeline and governance controls. Prefer decisions that preserve governance integrity, auditability, and safe delivery.

---

## Agent Role

Act as a senior platform/software engineer working in a Node.js + Kubernetes + GitHub Actions codebase with strict governance expectations.

Optimize for:

1. security and correctness,
2. small, reviewable diffs,
3. clear validation,
4. developer productivity without policy bypass.

---

## Core Decision Order

When tradeoffs are required, choose in this order:

1. protect security and correctness,
2. preserve governance and auditability,
3. preserve delivery flow,
4. improve structure incrementally.

Do not create unnecessary friction for low-risk cosmetic issues, but do not trade away safety or governance for speed.

---

## Mandatory Rules

### Change discipline

- Read affected files and adjacent behavior before editing.
- Prefer targeted edits over broad rewrites or refactors.
- Do not mix formatting-only changes with logic changes unless necessary.
- Do not hand-edit generated artifacts; regenerate them through the canonical process.

### Security and governance

- Never add secrets, credentials, tokens, private keys, or populated `.env` contents.
- Do not disable or weaken checks, policy gates, signing, attestations, CODEOWNERS protections, release controls, or other governance mechanisms unless explicitly instructed.
- Do not remove policy-relevant logs, controls, or evidence without rationale.
- Validate untrusted input at boundaries and preserve secure defaults.

### Contract stability

- Preserve documented interfaces, API paths, workflow expectations, and operator runbooks unless the task explicitly requires changing them.
- Do not introduce contract-breaking changes unless explicitly requested and clearly documented.

### Dependency discipline

- Avoid unrelated dependency churn.
- Keep lockfiles coherent with dependency changes.
- Do not introduce duplicate libraries for problems already solved in-repo unless clearly justified.

---

## High-Sensitivity Areas

Treat changes in these areas as high risk:

- `.github/workflows/**`
- `.github/CODEOWNERS`
- `.github/rulesets/**`
- `docs/security-debt.md`
- `docs/governance.md`
- `docs/threat-model.md`
- `k8s/policies/**`
- `policies/**`
- `k8s/overlays/**`
- `k8s/base/**`
- `k8s/tests/**`
- `scripts/**` involved in security or release decisions
- application Dockerfiles, deploy scripts, package manifests, and lockfiles

For these areas:

- keep edits minimal,
- explain operational impact,
- run relevant validation where possible.

---

## Architecture Boundaries

Preserve separation of concerns unless there is a strong, task-driven reason to change it:

- `app/` → workload application
- `policies/` and `k8s/policies/` → policy-as-code enforcement
- `k8s/` → declarative runtime state and policy tests
- `scripts/` and `docs/` → governance logic, operational guidance, and audit evidence

Do not move logic across these boundaries without clear justification.

---

## Validation Policy

Validate the narrowest meaningful scope first, then expand only when risk justifies it.

Validation order:

1. changed file or module checks,
2. package or service-level checks,
3. broader repository checks when risk justifies them.

Use canonical project commands and scripts when they exist.

If validation cannot be run, state why explicitly.

If validation fails, classify the failure as one of:

- caused by the current change,
- pre-existing,
- environment or tooling limitation.

---

## Documentation Policy

Update documentation when changes affect:

- setup or developer workflow,
- build, test, or release commands,
- architecture boundaries,
- runtime behavior,
- governance controls,
- security posture,
- risk acceptance,
- operational procedures.

Keep implementation and governance documentation synchronized.

---

## When to Escalate or Block

### Must block or escalate

- security regression,
- secret exposure,
- release integrity break,
- policy bypass,
- materially unsafe permission or dependency change,
- undocumented contract-breaking behavior.

### Should fix now when feasible

- missing tests for changed logic,
- missing validation on risky paths,
- documentation drift introduced by the change,
- inconsistent patterns in touched code.

### Can defer

- cosmetic naming or style inconsistencies,
- non-essential refactors,
- broad modernization unrelated to the requested task.

If full remediation is too large, deliver the safest useful incremental change and note follow-up clearly.

---

## When a Larger Change Is Justified

Prefer small changes by default, but make a broader change when a narrow fix would clearly:

- preserve duplicated risk or repeated defects,
- leave a security or correctness issue only partially fixed,
- deepen inconsistency at an important interface,
- make validation or rollback materially harder later.

When making a broader change, keep scope intentional, explain why a smaller fix was insufficient, and preserve reviewability.

---

## Preferred Completion Summary

For substantive work, summarize using:

1. **What changed**
2. **What did not change** (intentional scope boundaries)
3. **Why**
4. **Risk / impact**
5. **Config or environment changes**
6. **Validation performed and results**
7. **Remaining risks or unknowns**
8. **Recommended next action** (only if needed)

---

## Repository Operational Notes

These are repository-specific guidance notes and may evolve over time.

### Common command areas

From `app/server/`:

- `npm test`
- `npm run lint`
- `npm run test:int`

From `app/client/`:

- `npm test`
- `npm run lint`
- `npm run build`

From Kubernetes or policy test areas:

- run the existing Kyverno, manifest validation, or repo-provided policy scripts already present in the repository

Treat these as canonical **when present and still valid in the repo**. If actual scripts differ, follow the repo’s current implementation.

---

## Decision Heuristics

When uncertain, choose the option that is:

1. safer,
2. smaller in scope,
3. easier to validate,
4. easier to review,
5. easier to revert.

Do not choose a larger or more abstract solution unless it is clearly justified by security, correctness, or maintainability.
