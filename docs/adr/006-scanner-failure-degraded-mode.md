# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

[Back](004-vulnerability-thresholds-risk-acceptance.md) // [Home](../README.md) // [Next](007-supply-chain-incident-response-revocation.md)

## ADR 006: Scanner Failure and Degraded Mode Strategy

- Status: Accepted
- Date: 2026-01-07
- Context: Software Delivery Pipeline, resilience of security controls

## Context

The software delivery pipeline depends on multiple automated security scanners to produce attestations that gate promotion:

- Trivy for SCA and container vulnerability analysis
- OWASP ZAP for dynamic application security testing

These tools introduce external and operational dependencies, including:

- vulnerability database availability
- network connectivity
- upstream service stability
- scanner version compatibility

In practice, scanners can fail for reasons unrelated to application risk, such as:

- Trivy database rate limits or download outages
- ZAP container startup failures
- timeouts in ephemeral CI environments
- CVE feed inconsistencies

A pipeline that treats scanner failure as equivalent to security failure risks unnecessary production blocking and delayed incident response.

## Decision

The project adopts an explicit degraded mode strategy that distinguishes between:

1. security findings, which represent real risk
2. scanner failures, which represent tooling instability

The strategy enforces the following rules:

- fail closed by default for production releases
- degrade gracefully when scanners fail to execute
- classify scanner failures explicitly
- use governed escalation paths rather than silent bypasses

Scanner failure does not automatically imply risk acceptance, but it may trigger a controlled degraded mode process.

## Rationale

### 1. Tooling reliability is not the same as security posture

Security tools are not perfect proxies for risk.

A failure to run a scanner is operational debt, not proof of vulnerability. Treating them as equivalent leads to:

- alert fatigue
- pressure to disable controls
- reduced trust in governance systems

### 2. Degraded mode is safer than ad hoc overrides

Without a formal degraded mode, teams are more likely to resort to:

- manual re-runs without classification
- hardcoded bypasses
- policy relaxation under pressure

A defined degraded mode provides predictable, auditable behavior under failure.

### 3. Alignment with enterprise resilience models

Mature organizations explicitly model partial control availability rather than assuming all controls are always online.

## Implementation Details

### Scanner failure classification

Each scanner execution must emit a clear outcome:

| Outcome type | Meaning |
| :--- | :--- |
| `PASS` | Scanner ran successfully and met policy |
| `FAIL` | Scanner ran and detected unacceptable risk |
| `ERROR` | Scanner failed to execute because of infrastructure or tooling issues |

Only `PASS` and `FAIL` are valid security signals.

### Attestation semantics

- attestations are generated only on successful scanner execution
- no attestation is produced on `ERROR`
- missing attestations are treated as scanner unavailability, not implicit success

### Kyverno enforcement behavior

| Scenario | Enforcement |
| :--- | :--- |
| Valid attestation with `PASS` | Allow |
| Valid attestation with `FAIL` | Block |
| Missing attestation | Block by default |
| Missing attestation with break-glass | Allow with explicit exception |

### CI degraded mode handling

When a scanner fails:

1. the pipeline fails fast with a scanner error classification
2. no attestation is published
3. promotion is blocked unless break-glass is explicitly invoked under [ADR 005](005-break-glass-exception-handling.md) or another governed escalation path applies

### Operational workflow

1. Scanner fails, for example because the Trivy database is unavailable.
2. CI marks the job as scanner `ERROR`.
3. No attestation is produced.
4. Deployment remains blocked by Kyverno.
5. The operator chooses one of the governed responses:

- retry once
- delay the release
- invoke break-glass with justification

This ensures human decision-making, not silent automation, determines the risk response.

## Consequences

### Positive

- clear separation of concerns because tooling failures are not misclassified as vulnerabilities
- predictable failure modes that teams can understand and rehearse
- stronger governance because exceptions require intent rather than workarounds
- visible audit trail for scanner outages in CI history

### Negative and trade-offs

- releases may be delayed during outages
- manual escalation and judgment are required
- the operational model becomes more complex

These are intentional trade-offs in favor of security integrity.

## Alternatives Considered

### 1. Treat scanner errors as `PASS`

Rejected because it:

- silently weakens security
- masks systemic failures
- creates false confidence

### 2. Auto-degrade without visibility

Rejected because it would:

- normalize hidden control failures
- reduce auditability
- encourage reliance on degraded operation rather than recovery
