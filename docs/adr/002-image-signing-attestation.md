# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-03-17)

## ADR 002: Image Signing and Attestation Strategy (Cosign + Kyverno)

- Status: Accepted
- Date: 2026-01-07
- Context: Secure software supply chain and Kubernetes admission control

## Context

Modern software supply chains are exposed to multiple classes of risk, including:

- image tampering after build
- unauthorized image promotion to production
- vulnerabilities introduced between build and deploy
- lack of verifiable provenance for container artifacts

To mitigate these risks, the project requires:

1. cryptographic assurance that a container image was built by a trusted CI workflow
2. machine-verifiable security evidence such as vulnerability and DAST results
3. policy-based enforcement at deployment time

Several tooling combinations were evaluated, including Docker Content Trust or Notary, custom PKI-based signing, and external admission controllers.

## Decision

The project adopts a Sigstore-based supply-chain security model using:

- Cosign for keyless image signing and attestations
- Kyverno for Kubernetes-native policy enforcement through `verifyImages`

Images are:

1. built and pushed by GitHub Actions
2. signed keylessly using OIDC identity
3. attested with structured security metadata from Trivy and OWASP ZAP
4. verified at admission time in the Kubernetes cluster through Kyverno policies

## Rationale

### Why Cosign instead of Notary

Cosign was selected because it aligns with a more modern cloud-native trust model:

- keyless signing avoids long-lived private keys
- OIDC-based identity ties signatures directly to CI workflows, repositories, and refs
- native attestation support fits the in-toto predicate model
- ecosystem alignment is strong across Sigstore, Kyverno, Rekor, Fulcio, and SLSA

In contrast:

- Notary v1 is deprecated and operationally complex
- Notary v2 adoption remains more limited
- traditional PKI introduces key-management risks this project intentionally avoids

### Why Kyverno for verification

Kyverno was chosen because it:

- is Kubernetes-native
- supports image signature and attestation verification directly
- expresses policy declaratively as YAML
- fits naturally into GitOps and policy-as-code workflows

Kyverno enables enforcement of:

- who built the image through workflow identity
- what security checks passed through attestations
- how images are referenced, including digest pinning and immutability

All enforcement logic lives alongside Kubernetes manifests, reinforcing policy-as-code.

## Attestation Model

The pipeline produces and enforces multiple attestations.

### Trivy vulnerability attestation

- predicate type: `https://security.sigstore.dev/attestations/vuln/trivy/v1`
- captures scan result, vulnerability counts by severity, and scanner metadata

### OWASP ZAP DAST attestation

- predicate type: `https://security.sigstore.dev/attestations/dast/zap/v1`
- captures dynamic testing results and high-risk finding thresholds

Kyverno policies evaluate these attestations declaratively before allowing deployment.

## CI and Cluster Responsibility Split

This strategy intentionally separates responsibilities.

### CI responsibilities

- build and push images
- generate SBOMs and security scan outputs
- sign images and attach attestations
- perform best-effort verification with the Cosign CLI

### Cluster responsibilities

- enforce trust policies
- verify cryptographic signatures
- validate security attestations
- reject non-compliant workloads

This provides defense in depth: CI can fail fast, but the cluster remains the final authority.

## Consequences

### Positive

- strong provenance guarantees without long-lived signing keys
- immutable, auditable promotion path from build to deploy
- policy-driven security enforcement that does not depend solely on CI correctness
- alignment with SLSA Level 2 and L2+ style controls

### Negative and trade-offs

- registry access is required to resolve signatures and attestations
- admission-time verification introduces some latency
- Kyverno CLI cannot fully validate `verifyImages` rules in CI

These trade-offs are acceptable for a governed supply-chain reference implementation.

## Future Considerations

In a more production-oriented environment, this strategy could be extended with:

- pull-based GitOps enforcement
- stronger SBOM attestation verification
- time-based or environment-specific policy strictness
- multi-tenant trust domains by repository or team

## References

- Sigstore project documentation
- Kyverno `verifyImages` documentation
- SLSA build and provenance guidance
