# Architecture Decision Record (ADR)

ADR 006: Scanner Failure & Degraded Mode Strategy

Status: Accepted

Date: 2026-01-07

Context: Software Delivery Pipeline – Resilience of Security Controls



---

Context

The software delivery pipeline depends on multiple automated security scanners to produce attestations that gate promotion:

Trivy – SCA & container vulnerability analysis

OWASP ZAP – Dynamic application security testing (DAST)


These tools introduce external and operational dependencies, including:

Vulnerability database availability

Network connectivity

Upstream service stability

Scanner version compatibility


In practice, scanners can fail for reasons unrelated to application risk, such as:

Trivy DB rate limits or download outages

ZAP container startup failures

Timeouts in ephemeral CI environments

CVE feed inconsistencies


A pipeline that treats scanner failure as equivalent to security failure risks unnecessary production blocking and delayed incident response.


---

Decision

The project adopts an explicit Degraded Mode strategy that distinguishes between:

1. Security Findings (real risk)


2. Scanner Failures (tooling instability)



The strategy enforces the following rules:

Fail-closed by default for production releases

Graceful degradation when scanners fail to execute

Explicit classification of scanner failures

Governed escalation paths, not silent bypasses


Scanner failure does not automatically imply risk acceptance, but may trigger a controlled degraded mode.


---

Rationale

1. Tooling Reliability ≠ Security Posture

Security tools are not perfect proxies for risk.

A failure to run a scanner is operational debt, not evidence of vulnerability. Treating them as equivalent leads to:

Alert fatigue

Pressure to disable controls

Reduced trust in governance systems



---

2. Degraded Mode Is Safer Than Ad-Hoc Overrides

Without a formal degraded mode, teams will resort to:

Manual re-runs

Hardcoded bypasses

Policy relaxation under pressure


A defined degraded mode provides predictable, auditable behavior under failure.


---

3. Aligns with Enterprise Resilience Models

Mature organizations explicitly model partial control availability, rather than assuming all controls are always online.


---

Implementation Details

Scanner Failure Classification

Each scanner execution must emit a clear outcome:

Outcome Type	Meaning

PASS	Scanner ran successfully and met policy
FAIL	Scanner ran and detected unacceptable risk
ERROR	Scanner failed to execute (infrastructure/tooling issue)


Only PASS and FAIL are valid security signals.


---

Attestation Semantics

Attestations are only generated on successful scanner execution

No attestation is produced on ERROR

Missing attestations are treated as scanner unavailability, not implicit failures



---

Kyverno Enforcement Behavior

Scenario	Enforcement

Valid attestation (PASS)	Allow
Valid attestation (FAIL)	Block
Missing attestation	Block (default)
Missing attestation + break-glass	Allow with explicit exception



---

CI Degraded Mode Handling

When a scanner fails:

1. Pipeline fails fast with a scanner error classification


2. No attestation is published


3. Promotion is blocked unless:

Break-glass is explicitly invoked (ADR 005)

Risk acceptance is documented (ADR 004)





---

Operational Workflow

1. Scanner fails (e.g., Trivy DB unavailable)


2. CI marks job as Scanner ERROR


3. No attestation is produced


4. Deployment blocked by Kyverno


5. Operator chooses one:

Retry once

Delay release

Invoke break-glass with justification




This ensures human decision-making, not silent automation, determines risk.


---

Consequences

Positive

Clear Separation of Concerns: Tooling failures are not misclassified as vulnerabilities.

Predictable Failure Modes: Teams know exactly how the system behaves.

Stronger Governance: Exceptions require intent, not workarounds.

Audit-Ready: Scanner outages are visible in CI history.



---

Negative / Trade-offs

Reduced Availability During Outages: Releases may be delayed.

Manual Escalation Required: Human judgment is necessary.

Increased Process Complexity: Requires documentation and discipline.


These are intentional trade-offs in favor of security integrity.


---

Alternatives Considered

1. Treat Scanner Errors as PASS

Rejected because:

Silently weakens security

Masks systemic failures

Creates false confidence



---

2. Auto-Degrade Without Visibility

Rejected because:

Removes accountability

Encourages over-reliance on automation

Violates auditability principles



---

3. Disable Enforcement During Scanner Outages

Rejected because:

High blast radius

Hard to scope

Encourages policy drift
