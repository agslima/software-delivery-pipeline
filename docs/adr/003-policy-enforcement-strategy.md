Architecture Decision Record (ADR)

ADR 003: Policy Enforcement Strategy (CI Validation vs Cluster Admission Control)

Status: Accepted

Date: 2026-01-07

Context: Software Delivery Pipeline – Policy Enforcement Design



---

Context

This project enforces multiple governance and security controls using Kyverno policies, including:

Image signature verification

Vulnerability scan attestations (Trivy, ZAP)

Digest-pinned images (immutable deployments)


A key architectural decision is where and how these policies should be enforced across the delivery lifecycle.

Two primary enforcement points exist:

1. CI-Time Validation

Policies are evaluated using the Kyverno CLI during GitHub Actions.

Applied to Kubernetes manifests before they are merged or deployed.



2. Cluster-Time Admission Control

Policies are enforced by Kyverno Admission Controllers running inside the Kubernetes cluster.

Requests are allowed or denied at runtime.




Each approach provides different guarantees, visibility, and trade-offs.


---

Decision

The project adopts a dual-scope policy enforcement strategy:

CI Scope (Preventive Controls):

Kyverno policies are evaluated during CI to validate:

Manifest structure

Digest pinning

Baseline security posture


verifyImages rules are acknowledged as non-enforceable in Kyverno CLI and treated as informational in CI.


Cluster Scope (Authoritative Controls):

Full enforcement of image signature verification and attestation validation occurs at cluster admission time using Kyverno.

These controls act as the final security gate before workloads run.



This separation is intentional and explicitly documented.


---

Rationale

1. Kyverno CLI vs Admission Controller Capabilities

Kyverno CLI is designed for static analysis of manifests and does not fully resolve:

Remote registry lookups

Cosign signature verification

Attestation verification with live transparency logs


Attempting to treat CI-based Kyverno execution as equivalent to admission control leads to false failures and brittle pipelines.

Therefore:

CI validation focuses on what can be deterministically evaluated

Runtime verification is delegated to the cluster



---

2. Shift-Left Without Over-Claiming Enforcement

CI enforcement provides:

Early feedback to developers

Fast failure before merge

Policy-as-code validation


But it does not replace runtime enforcement.

This avoids the common anti-pattern of:

> “Security theater in CI, no real enforcement in production”




---

3. Clear Trust Boundaries

Layer	Responsibility

CI Pipeline	Build integrity, signing, attestations, manifest correctness
Git Repository	Declarative source of truth
Kubernetes Admission	Runtime trust verification
Runtime	Execution only of verified artifacts


This aligns with Zero Trust and SLSA principles.


---

Implementation Details

CI Scope (GitHub Actions)

Kyverno CLI is executed with:

Structural validation

Digest enforcement


verifyImages rules are expected to be skipped

Skips are treated as informational, not failures


Example CI log interpretation:

Notice: verifyImages rules skipped by Kyverno CLI (expected in CI).
Policy validation passed (CI scope).

This behavior is explicitly handled in pipeline logic.


---

Cluster Scope (Kubernetes)

In a real deployment, Kyverno runs as:

Admission Controller

Background Controller (optional)


At this stage, Kyverno authoritatively enforces:

Cosign image signatures

Trivy vulnerability attestations

ZAP DAST attestations

Immutable image digests


A workload will not be admitted if these conditions fail.


---

Consequences

Positive

Accurate Security Guarantees: Policies are enforced where they are technically valid.

Reduced CI Noise: No false negatives caused by registry or attestation resolution issues.

Clear Operational Model: CI = validation, Cluster = enforcement.

Production-Grade Pattern: Mirrors how Kyverno is used in real clusters.



---

Negative / Trade-offs

Delayed Enforcement for Some Controls: Signature/attestation failures are only caught at admission time, not during CI.

Requires Cluster Kyverno: Full guarantees depend on Kyverno being installed and properly configured in the cluster.

More Documentation Needed: The distinction must be clearly explained to avoid confusion.


This ADR explicitly addresses that documentation gap.


---

Alternatives Considered

1. CI-Only Enforcement

Rejected because:

Kyverno CLI cannot reliably enforce verifyImages

Security guarantees would be incomplete

High risk of false confidence



---

2. Cluster-Only Enforcement (No CI Validation)

Rejected because:

Developers receive feedback too late

Simple errors (e.g., mutable tags) could reach production pipelines

Reduces developer experience and delivery speed

