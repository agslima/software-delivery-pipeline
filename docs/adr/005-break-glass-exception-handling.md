# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

## ADR 005: Break-Glass and Exception Handling Strategy

- Status: Accepted
- Date: 2026-01-07
- Context: Software Delivery Pipeline, operational resilience and security governance

## Context

While the pipeline enforces strong supply-chain security controls such as image signing, attestations, vulnerability thresholds, and admission policies, real production environments occasionally require controlled exceptions.

Examples include:

- urgent security hotfixes
- partial scanner outages, such as Trivy database availability issues
- false positives blocking critical releases
- external dependency issues outside team control

A strictly enforced system without an exception mechanism risks becoming operationally brittle, delaying critical fixes and increasing business risk.

Therefore, the architecture must support a break-glass mechanism that allows controlled bypass of enforcement without undermining governance.

## Decision

The project adopts a policy-driven, explicit break-glass mechanism with the following characteristics:

- exceptions are explicit
- exceptions are auditable
- exceptions are temporary
- no silent or implicit bypasses are allowed

Break-glass is implemented through Kyverno `PolicyException` resources in the dedicated `policy-exceptions` namespace, not through workload labels or annotations.

## Rationale

### 1. Exceptions are inevitable, chaos is optional

In mature systems, exceptions are not a failure of security, but a recognized operational requirement.

By designing break-glass behavior intentionally, the system avoids:

- ad hoc policy disabling
- emergency manual `kubectl` changes
- untracked security debt

### 2. Security by friction, not by impossibility

The break-glass path is intentionally frictionful. It:

- requires a separate exception object
- requires code changes
- requires Git history
- requires review

This discourages casual misuse while preserving availability when genuinely needed.

### 3. Auditability over absolute prevention

The goal is not to make violations impossible, but to ensure they are:

- visible
- traceable
- reviewable
- reversible

## Implementation Details

### Break-glass `PolicyException`

A standardized `PolicyException` object is used to trigger exception handling:

```yaml
apiVersion: kyverno.io/v2
kind: PolicyException
metadata:
  name: break-glass-example
  namespace: policy-exceptions
  annotations:
    security.break-glass/ticket: "INC-1234"
    security.break-glass/requested-by: "application-team"
    security.break-glass/approved-by: "platform-oncall"
    security.break-glass/expires-at: "2026-12-31T23:59:59Z"
spec:
  background: false
  match:
    any:
      - resources:
          kinds:
            - Deployment
          names:
            - exception-target
          namespaces:
            - production
  exceptions:
    - policyName: verify-signature
      ruleNames:
        - require-image-signature
```

### Kyverno policy integration

Cluster verification policies remain fail-closed by default. Exception handling is granted only when a matching `PolicyException` exists.

```yaml
spec:
  exceptions:
    - policyName: verify-signature
      ruleNames:
        - require-image-signature
```

This ensures:

- normal workloads remain fully governed
- exception scope is minimal, explicit, and separately permissioned from workload manifests

### CI and GitOps enforcement

Break-glass usage must be committed to Git and carry explicit approval metadata on the `PolicyException` object:

- `security.break-glass/ticket` must reference a tracked incident or change such as `INC-*` or `CHG-*`
- `PolicyException` objects must live in the `policy-exceptions` namespace
- `security.break-glass/requested-by` must identify the requester
- `security.break-glass/approved-by` is the authoritative approval field and must be one of `platform-oncall` or `repository-administrator`
- `security.break-glass/requested-by` and `security.break-glass/approved-by` must differ to preserve separation of duties

Break-glass usage must be committed to Git as a separate exception object with an explicit lifecycle:

1. Create a `PolicyException` manifest in the `policy-exceptions` namespace.
2. Verify the exception exists in-cluster with `kubectl get policyexception -n policy-exceptions`.
3. Verify the `PolicyException` annotations carry the required ticket, requester, approver, and expiry values before relying on the exception.
4. Delete or revoke the `PolicyException` once the blocking condition is resolved.

Additional expectations:

- manifest changes require a pull request
- changes remain visible in Git history
- policy exclusions are evaluated during CI validation and again at admission time
- no runtime-only overrides are supported

## Operational Expectations

Break-glass usage is expected to follow these guidelines:

1. Justification: the PR description should explain why the exception is required.
2. Scope minimization: the `PolicyException` should target only the affected policy, rule, and workload scope.
3. Temporary nature: delete or revoke the `PolicyException` once the blocking condition is resolved.
4. Operational verification: confirm the `PolicyException` is present while break-glass is enabled and absent after enforcement is restored.
5. Post-incident review: break-glass usage should trigger retrospective analysis.

## Consequences

### Positive

- operational resilience because critical fixes are not blocked by tooling failures alone
- security transparency because exceptions are explicit and auditable
- policy integrity because core policies do not need to be weakened or disabled
- enterprise alignment because the model resembles real platform security practice

### Negative and trade-offs

- break-glass introduces residual risk by allowing deployment without full guarantees
- human judgment and review discipline remain necessary
- poor governance could lead to overuse

These risks are mitigated by:

- mandatory Git workflows
- explicit `PolicyException` objects in `policy-exceptions`
- documentation
- cultural enforcement rather than technical shortcuts alone
