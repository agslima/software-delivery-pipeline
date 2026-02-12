

Architecture Decision Record (ADR)

ADR 005: Break-Glass & Exception Handling Strategy

Status: Accepted

Date: 2026-01-07

Context: Software Delivery Pipeline – Operational Resilience & Security Governance



---

Context

While the pipeline enforces strong supply chain security controls (image signing, attestations, vulnerability thresholds, and admission policies), real-world production environments occasionally require controlled exceptions.

Examples include:

Urgent security hotfixes

Partial scanner outages (e.g., Trivy DB unavailable)

False positives blocking critical releases

External dependency issues outside team control


A strictly enforced system without an exception mechanism risks becoming operationally brittle, potentially delaying critical fixes and increasing business risk.

Therefore, the architecture must support a break-glass mechanism that allows controlled bypass of enforcement without undermining governance.


---

Decision

The project adopts a policy-driven, explicit break-glass mechanism with the following characteristics:

Exceptions are:

Explicit

Auditable

Temporary


No silent or implicit bypasses are allowed

Break-glass actions require intentional metadata in Kubernetes manifests


Break-glass is implemented using Kyverno policy exclusions based on well-defined labels.


---

Rationale

1. Exceptions Are Inevitable — Chaos Is Optional

In mature systems, exceptions are not a failure of security, but a recognized operational requirement.

By designing break-glass behavior intentionally, the system avoids:

Ad-hoc policy disabling

Emergency manual kubectl changes

Untracked security debt



---

2. Security by Friction, Not by Impossibility

The break-glass path is intentionally frictionful:

Requires explicit labels

Requires code changes

Requires Git history

Requires review


This discourages casual misuse while preserving availability when genuinely needed.


---

3. Auditability Over Absolute Prevention

The goal is not to make violations impossible, but to ensure they are:

Visible

Traceable

Reviewable

Reversible



---

Implementation Details

Break-Glass Label

A standardized label is used to trigger exception handling:

metadata:
  labels:
    security.break-glass: "true"


---

Kyverno Policy Integration

All enforcement rules explicitly exclude break-glass workloads:

exclude:
  resources:
    selector:
      matchLabels:
        security.break-glass: "true"

This ensures:

Normal workloads remain fully governed

Exception scope is minimal and explicit



---

CI & GitOps Enforcement

Break-glass usage must be committed to Git:

Manifest changes require a Pull Request

Changes are visible in Git history

Policy exclusions are evaluated during CI validation


No runtime-only overrides are supported.


---

Operational Expectations

Break-glass usage is expected to follow these guidelines:

1. Justification: The PR description must explain why the exception is required.


2. Scope Minimization: Only the affected workload should carry the label.


3. Temporary Nature: The label should be removed once the blocking condition is resolved.


4. Post-Incident Review: Break-glass usage should trigger retrospective analysis.




---

Consequences

Positive

Operational Resilience: Critical fixes are not blocked by tooling failures.

Security Transparency: Exceptions are explicit and auditable.

Policy Integrity: No need to weaken or disable core policies.

Enterprise Alignment: Mirrors real-world platform security practices.



---

Negative / Trade-offs

Residual Risk: Break-glass allows deployment without full guarantees.

Human Judgment Required: Relies on process discipline and review culture.

Potential Abuse: Poor governance could lead to overuse.


These risks are mitigated by:

Mandatory Git workflows

Clear labeling

Documentation

Cultural enforcement rather than technical shortcuts



---

Alternatives Considered

1. No Break-Glass Support

Rejected because:

Unrealistic in production

Encourages out-of-band changes

Leads to emergency policy disabling



---

2. Manual Policy Disablement

Rejected because:

High blast radius

Poor auditability

Inconsistent application
