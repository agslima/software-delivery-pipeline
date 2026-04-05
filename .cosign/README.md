# Signed releases

## Scope
- Which artifacts are signed (images, binaries, SBOM/provenance attestations)

## Signing method
- Cosign keyless signing via GitHub OIDC
- Identity/issuer expectations used for verification

## Release-gate outputs to attach
- Trivy attestation
- ZAP attestation (if applicable)
- SBOM attestation
- SLSA provenance

## Verification
- Example `cosign verify` / `cosign verify-attestation` commands
- Expected subject/issuer and predicate checks

## Failure handling
- What to do when signing/verification fails
