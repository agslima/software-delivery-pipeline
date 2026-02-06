# Architecture Decision Record (ADR)

## ADR 002: Image Signing & Attestation Strategy (Cosign + Kyverno)

* Status: Accepted
* Date: 2026-01-07
* Context: Secure Software Supply Chain & Kubernetes Admission Control

---

## Context

Modern software supply chains are exposed to multiple classes of risk, including:

- Image tampering after build
- Unauthorized image promotion to production
- Vulnerabilities introduced between build and deploy
- Lack of verifiable provenance for container artifacts

To mitigate these risks, the project requires:

1. **Cryptographic assurance** that a container image was built by a trusted CI workflow
2. **Machine-verifiable security evidence** (vulnerability and DAST results)
3. **Policy-based enforcement** at deployment time

Several tooling combinations were evaluated, including Docker Content Trust / Notary v1/v2, custom PKI-based signing, and external admission controllers.

---

## Decision

The project adopts a **Sigstore-based supply chain security model**, using:

- **Cosign** for keyless image signing and attestations
- **Kyverno** for Kubernetes-native policy enforcement via verifyImages

Images are:

1. Built and pushed by GitHub Actions
2. **Signed keylessly** using OIDC identity (GitHub Actions → Fulcio)
3. **Attested** with structured security metadata (Trivy, OWASP ZAP)
4. **Verified at admission time** in the Kubernetes cluster via Kyverno ClusterPolicies

---

## Rationale

### Why Cosign (Sigstore) instead of Notary

**Cosign was selected due to its modern, cloud-native security model:**

- Keyless signing: No long-lived private keys to manage or rotate
- OIDC-based identity: Ties signatures directly to CI workflows, repositories, and Git refs
- First-class attestation support: Native support for in-toto predicates
- Ecosystem alignment: Strong integration with Kyverno, Rekor, Fulcio, and SLSA

In contrast:

- Notary v1 is deprecated and operationally complex
- Notary v2 adoption is still limited and lacks widespread policy engine integration
- Traditional PKI introduces key management risks that this project explicitly avoids

---

### Why Kyverno for Verification

Kyverno was chosen as the policy enforcement engine because it:

- Is Kubernetes-native (no external webhook service required)
- Supports image signature and attestation verification directly
- Allows policies to be expressed declaratively as YAML
- Integrates naturally with GitOps workflows

Kyverno enables enforcement of:

- Who built the image (OIDC identity / workflow path)
- What security checks passed (attestation predicates)
- How images are referenced (digest-pinned, immutable)

All enforcement logic lives alongside Kubernetes manifests, reinforcing policy-as-code.

---

## Attestation Model

- The pipeline produces and enforces multiple attestations:
  - Trivy Vulnerability Attestation
    - Predicate Type: https://security.sigstore.dev/attestations/vuln/trivy/v1
    - Captures:
      - Scan result (PASS/FAIL)
      - Vulnerability counts by severity
      - Scanner name and version
  - OWASP ZAP DAST Attestation
    - Predicate Type: https://security.sigstore.dev/attestations/dast/zap/v1
    - Captures:
      - Dynamic security testing results
      - High-risk findings threshold enforcement
  - Kyverno policies evaluate these attestations declaratively before allowing deployment.


---

## CI vs Cluster Responsibility Split

This strategy intentionally separates responsibilities:
- CI Responsibilities
  - Build and push images
  - Generate SBOMs and security scans
  - Sign images and attach attestations
  - Perform best-effort verification (cosign CLI checks)

- Cluster Responsibilities
  - Enforce trust policies
  - Verify cryptographic signatures
  - Validate security attestations
  - Reject non-compliant workloads
  - This ensures defense in depth: CI can fail fast, but the cluster is the final authority.


---

## Consequences

### Positive

- Strong provenance guarantees without key management overhead
- Immutable, auditable promotion path from build to deploy
- Policy-driven security enforcement independent of CI correctness
- Alignment with SLSA Level 2+ principles

### Negative / Trade-offs

- Requires container registry access to fetch signatures and attestations
- Admission-time verification introduces slight latency
- Kyverno CLI cannot fully validate verifyImages in CI (expected limitation)

> These trade-offs are acceptable given the project's goal as a governed supply chain reference implementation.

---

## Future Considerations

In a production-grade environment, this strategy could be extended with:

- Pull-based GitOps enforcement (ArgoCD + Kyverno)
- SBOM attestation verification
- Time-based or environment-based policy strictness
- Multi-tenant trust domains per repository or team

---

## References

- Sigstore Project (Cosign, Fulcio, Rekor)
- Kyverno verifyImages documentation
- SLSA Supply Chain Levels
