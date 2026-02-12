# Architecture Decision Record (ADR)

ADR 007: Supply Chain Incident Response & Revocation Strategy

Status: Proposed

Date: 2026-01-07

Context: Software Supply Chain Security & Incident Response



---

Context

Despite strong preventive controls—image signing (Cosign), policy enforcement (Kyverno), vulnerability scanning, and CI governance—software supply chain incidents remain possible, including:

Compromised signing keys

Malicious image injected into a trusted registry

False-negative vulnerability scans

Attestation forgery or reuse

CVE disclosure after deployment


The system must support post-deployment trust revocation and incident response, not only prevention.

Modern supply-chain security assumes:

> Artifacts may need to be invalidated after they are already trusted.




---

Problem Statement

Most CI/CD pipelines answer:

> “Can this artifact be deployed?”



But fewer answer:

> “How do we revoke trust once an artifact is known to be unsafe?”



Without a revocation strategy:

Compromised images may continue running

Trust anchors become permanent liabilities

Incident response becomes manual and error-prone



---

Decision

The project adopts a policy-driven revocation model, built on:

Cosign for signing and attestation identity

Kyverno for real-time trust enforcement

GitOps for declarative revocation state

Kubernetes-native controls for runtime containment


Trust revocation is treated as a first-class security event, not an operational exception.


---

Revocation Triggers

Revocation may be initiated by:

Discovery of a critical CVE post-deployment

Detection of malicious behavior

Compromise of a signing key

Attestation tampering or replay

Upstream dependency compromise



---

Revocation Mechanisms

1. Signing Key Revocation

Mechanism:

Rotate Cosign key

Remove compromised key from trusted key set

Update Kyverno policy to trust only the new key


Effect:

Previously signed images become invalid

New deployments are blocked

Existing pods fail admission on restart



---

2. Image Digest Denylisting

Mechanism:

Add compromised image digests to a Kyverno denylist

Managed declaratively in Git (revoked-images.yaml)


Effect:

Blocks redeployments

Prevents scaling or rescheduling

Acts independently of signing identity



---

3. Attestation Revocation

Mechanism:

Update Kyverno policies to require new attestation predicates

Invalidate older attestations by version or timestamp


Effect:

Forces rebuild and re-attestation

Prevents reuse of stale trust data



---

4. GitOps-Driven Rollback

Mechanism:

Revert Kubernetes manifests to last known-good image digest

Commit change via GitHub Actions or manual PR


Effect:

Controlled rollback with full audit trail



---

Incident Response Workflow

1. Detection

CVE alert, SOC signal, or external advisory



2. Assessment

Determine affected images, digests, and clusters



3. Revocation Action

Rotate keys, denylist digests, or tighten policies



4. Containment

Block new deployments

Force pod restart to trigger admission control



5. Recovery

Rebuild artifact

Re-scan, re-sign, re-attest

Promote via CI



6. Post-Incident Review

Document timeline and root cause

Update policies if needed





---

Implementation Notes

Kyverno Policy Patterns

Signature verification with key allowlists

Image digest denylist enforcement

Time-bound attestation validation

Namespace-scoped emergency policies



---

Auditability

Every revocation action is:

Versioned in Git

Enforced by policy

Visible in CI and cluster events

Traceable to a human decision



---

Consequences

Positive

Explicit Trust Lifecycle: Trust can be granted and revoked

Fast Containment: No need to wait for redeploys

Strong Blast Radius Control: Targeted revocation

Enterprise-Grade Incident Handling



---

Negative / Trade-offs

Operational Complexity: Requires disciplined policy management

Potential Availability Impact: Revocation may disrupt workloads

Key Rotation Overhead: Requires secure key handling


These are acceptable trade-offs for high-integrity environments.


---

Alternatives Considered

1. Registry-Level Image Deletion

Rejected because:

Not always supported

Can break audit trails

Does not prevent cached image reuse



---

2. Manual Pod Deletion Only

Rejected because:

Reactive and fragile

Does not prevent redeployment

Lacks declarative control



---

3. Relying Solely on Vulnerability Scanners

Rejected because:

Scanners are not enforcement mechanisms

Incidents may not be CVE-based

