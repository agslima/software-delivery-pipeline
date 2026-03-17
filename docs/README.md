# Documentation Overview

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

This directory contains the governance, architecture, operations, and evidence documentation for the repository. Together, these documents explain how the delivery model works, what controls exist, how decisions were made, and how operators should respond when something fails.

## How to Use This Folder

If you are new to the repository, start with these documents:

1. [governance.md](governance.md)
   The primary delivery governance model, including control surfaces, workflow mapping, and audit guidance.
2. [threat-model.md](threat-model.md)
   The security model and threat analysis for the governed software delivery path.
3. [architecture.md](architecture.md)
   The repository structure and separation of concerns across application, policy, infrastructure, scripts, and governance docs.
4. [runbook.md](runbook.md)
   Operational response guidance for common pipeline and enforcement failures.

## Document Map

### Governance and Security

- [governance.md](governance.md): repository governance model and control boundaries
- [governance-evidence-index.md](governance-evidence-index.md): claim-to-control and evidence traceability index
- [governance-slos.md](governance-slos.md): governance operating targets and reporting path
- [threat-model.md](threat-model.md): threat analysis and security architecture
- [security-debt.md](security-debt.md): tracked accepted risk and remediation status

### Architecture and Decisions

- [architecture.md](architecture.md): repository structure and control boundaries
- [decisions.md](decisions.md): summary of major tooling and architecture choices
- [adr/001-gitops-strategy.md](adr/001-gitops-strategy.md): CI-driven GitOps strategy
- [adr/002-image-signing-attestation.md](adr/002-image-signing-attestation.md): signing and attestation model
- [adr/003-policy-enforcement-strategy.md](adr/003-policy-enforcement-strategy.md): CI validation versus cluster admission
- [adr/004-vulnerability-thresholds-risk-acceptance.md](adr/004-vulnerability-thresholds-risk-acceptance.md): vulnerability thresholds and risk acceptance
- [adr/005-break-glass-exception-handling.md](adr/005-break-glass-exception-handling.md): break-glass and exception handling
- [adr/006-scanner-failure-degraded-mode.md](adr/006-scanner-failure-degraded-mode.md): degraded mode for scanner failures
- [adr/007-supply-chain-incident-response-revocation.md](adr/007-supply-chain-incident-response-revocation.md): incident response and trust revocation

### Operations and Planning

- [runbook.md](runbook.md): incident and failure response guidance
- [remediation-plan.md](remediation-plan.md): planned remediation work and sequencing

### Evidence and Supporting Material

- [snyk/index.md](snyk/index.md): published Snyk evidence index
- [`images/`](images/): supporting screenshots and exported visual evidence

## Maintenance Expectations

Update documentation in this folder when changes affect:

- governance controls
- release or deployment flow
- workflow names or job names used as evidence
- runtime enforcement behavior
- operational procedures
- accepted risk posture

When workflow job names, policy files, or evidence paths change, update the related governance documents together so the documentation remains audit-aligned.
