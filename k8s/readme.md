# Kubernetes & Policy Architecture

This directory contains Kubernetes manifests, Kyverno policies, and policy test assets used by the governed delivery pipeline.

It separates:

- CI-time structural validation
- Runtime admission enforcement
- Policy test fixtures and values

---

## Directory Structure

```text
k8s/
├── base/
│   ├── backend.yaml
│   ├── frontend.yaml
│   ├── pdb.yaml
│   └── kustomization.yaml
├── overlays/
│   ├── dev/
│   │   └── kustomization.yaml
│   └── prod/
│       └── kustomization.yaml
├── policies/
│   ├── ci/
│   │   └── structural-policy.yaml
│   ├── cluster/
│   │   ├── verify-signature.yaml
│   │   ├── verify-trivy.yaml
│   │   ├── verify-zap.yaml
│   │   ├── verify-sbom.yaml
│   │   ├── verify-slsa.yaml
│   │   └── break-glass-policy.yaml
│   ├── pod-hardening.yaml
│   └── supply-chain-policy.yaml
└── tests/
    ├── kyverno-test.yaml
    ├── policy-test.yaml
    ├── values.yaml
    └── resources/
```

---

## Policy Scopes

### `k8s/policies/ci/`

CI structural checks only (digest pinning, hardening, baseline config rules).

### `k8s/policies/cluster/`

Admission-time controls for signature and attestation verification in runtime.

### `k8s/policies/supply-chain-policy.yaml`

Consolidated policy variant that captures the same supply-chain requirements in a single policy file.

---

## Test Assets (`k8s/tests/`)

`k8s/tests/` contains Kyverno test definitions, fixtures, and values files used to validate policy behavior.

Run locally with:

```bash
kyverno test k8s/tests/
```

---

## Execution Flow

### CI-oriented validation example

```bash
kustomize build k8s/overlays/prod > /tmp/prod.yaml
kyverno apply k8s/policies/ci/structural-policy.yaml --resource /tmp/prod.yaml
```

### Runtime enforcement

1. Workload manifest is submitted to the cluster.
2. Kyverno admission policies verify signatures/attestations.
3. Non-compliant workloads are denied.

---

## Design Rationale

| Concern | CI | Cluster |
| --- | --- | --- |
| Fast feedback | ✅ | ❌ |
| Structural validation | ✅ | ✅ |
| Signature/attestation verification | ❌ | ✅ |
| Runtime protection | ❌ | ✅ |

This split keeps CI deterministic while preserving runtime trust enforcement.
