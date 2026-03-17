# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

## ADR 007: Supply Chain Incident Response and Revocation Strategy

- Status: Proposed
- Date: 2026-01-07
- Context: Software supply-chain security and incident response

## Context

Despite strong preventive controls such as image signing with Cosign, policy enforcement with Kyverno, vulnerability scanning, and CI governance, software supply-chain incidents remain possible, including:

- compromised signing keys
- malicious image injection into a trusted registry
- false-negative vulnerability scans
- attestation forgery or reuse
- CVE disclosure after deployment

The system must support post-deployment trust revocation and incident response, not only prevention.

Modern supply-chain security assumes:

> Artifacts may need to be invalidated after they are already trusted.

## Problem Statement

Most CI/CD pipelines answer:

> Can this artifact be deployed?

Fewer answer:

> How do we revoke trust once an artifact is known to be unsafe?

Without a revocation strategy:

- compromised images may continue running
- trust anchors become permanent liabilities
- incident response becomes manual and error-prone

## Decision

The project adopts a policy-driven revocation model built on:

- Cosign for signing and attestation identity
- Kyverno for real-time trust enforcement
- GitOps for declarative revocation state
- Kubernetes-native controls for runtime containment

Trust revocation is treated as a first-class security event, not merely an operational exception.

## Revocation Triggers

Revocation may be initiated by:

- discovery of a critical CVE after deployment
- detection of malicious behavior
- compromise of a signing key
- attestation tampering or replay
- upstream dependency compromise

## Revocation Mechanisms

### 1. Signing key revocation

Mechanism:

- rotate the Cosign key or trusted identity set
- remove the compromised key or identity from the trusted policy set
- update Kyverno policy to trust only the new signer

Effect:

- previously signed images become invalid
- new deployments are blocked
- existing pods fail admission on restart or reschedule

### 2. Image digest denylisting

Mechanism:

- add compromised image digests to a Kyverno denylist
- manage the denylist declaratively in Git

Effect:

- blocks redeployments
- prevents scaling or rescheduling of compromised images
- acts independently of signing identity

### 3. Attestation revocation

Mechanism:

- update Kyverno policies to require new attestation predicates
- invalidate older attestations by version, freshness, or timestamp

Effect:

- forces rebuild and re-attestation
- prevents reuse of stale trust data

### 4. GitOps-driven rollback

Mechanism:

- revert Kubernetes manifests to the last known-good image digest
- commit the change through the governed PR workflow

Effect:

- produces a controlled rollback with full audit trail

## Incident Response Workflow

1. Detection
   Receive a CVE alert, SOC signal, or external advisory.
2. Assessment
   Determine affected images, digests, environments, and clusters.
3. Revocation action
   Rotate keys, denylist digests, or tighten policies.
4. Containment
   Block new deployments and force pod restart where appropriate so admission control re-evaluates trust.
5. Recovery
   Rebuild the artifact, re-scan it, re-sign it, re-attest it, and promote it through CI.
6. Post-incident review
   Document the timeline, root cause, and control improvements.

## Implementation Notes

### Kyverno policy patterns

The revocation strategy is expected to use patterns such as:

- signature verification with key or identity allowlists
- image digest denylist enforcement
- time-bound attestation validation
- namespace-scoped emergency policies where needed

## Auditability

Every revocation action should be:

- versioned in Git
- enforced by policy
- visible in CI and cluster events
- linked to an incident or change record
