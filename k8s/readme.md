
# Kubernetes & Policy Architecture

This directory contains all **Kubernetes manifests, Kyverno policies, and policy tests** used to enforce a **governed software supply chain** across CI and runtime environments.

The structure separates:

- CI-time validation (fast feedback, non-runtime features)
- Cluster-time enforcement (cryptographic verification, attestations)
- Policy unit tests (shift-left validation)

---

## Directory Structure 🗂

```text
k8s/
├── policies/
│   ├── ci/
│   │   └── enforce-governed-artifacts-ci.yaml
│   └── cluster/
│       └── enforce-governed-artifacts.yaml
│
├── resources/
│   └── deployment.yaml
│
├── tests/
│   ├── enforce-governed-artifacts-test.yaml
│   └── values.yaml
```

---

### `policies/` — Kyverno Policies  🔐

#### `policies/ci/`

Policies executed only in CI pipelines using `kyverno apply` or `kyverno test`.

#### Purpose

- Validate Kubernetes manifests before merge
- Enforce structural and metadata rules
- Avoid runtime-only features

#### Key characteristics

- ❌ No `verifyImages`
- ❌ No signature or attestation verification
- ✅ Fast, deterministic feedback
- ✅ GitHub Actions friendly

#### Typical rules

- Image digest pinning (no `:latest`)
- Required labels / annotations
- Namespace restrictions
- SecurityContext validation

#### `policies/cluster/`

Policies enforced **at Kubernetes admission time**.

**Purpose**

- Enforce cryptographic trust
- Validate supply-chain attestations
- Protect production clusters

#### Key characteristics

- ✅ `verifyImages`
- ✅ Cosign signature verification
- ✅ Trivy & ZAP attestations
- ✅ Enforced via admission webhook

**Examples**

- Require signed images (keyless GitHub OIDC)
- Require vulnerability attestations (Trivy)
- Require DAST attestations (ZAP)
- Enforce immutable images (digest-pinned)

---

## `resources/` — Kubernetes Manifests 📦

Contains **sample or reference Kubernetes workloads** used for:

- CI policy validation
- Kyverno unit tests
- Documentation examples

These manifests represent **production-like deployments**, including:

- Pod Security Context
- Non-root containers
- Read-only root filesystem
- Digest-pinned images

> These are not Helm-rendered templates — they are concrete manifests for policy evaluation.

---

## `tests/` — Kyverno Policy Unit Tests 🧪

This directory enables **shift-left policy testing** using:

```bash
kyverno test k8s/tests/
```

`enforce-governed-artifacts-test.yaml`

Defines **expected outcomes** when policies are applied to resources.

### What is tested

- Policy logic correctness
- Rule matching behavior
- Pass/fail expectations
- CI-safe policy behavior

`values.yaml`

Provides **mocked runtime context** required by Kyverno CLI:

- Request metadata
- Image metadata
- User and service account context

This avoids false skips like:

> “Policies Skipped (as required variables are not provided)”

---

## Execution Flow 🔄

### CI Pipeline
 
* 1. Render Kubernetes manifests
* 2. Apply CI policies

```bash
kyverno apply k8s/policies/ci \
  --resource k8s/resources/deployment.yaml
```

* 3. Run Kyverno unit tests

```bash
kyverno test k8s/tests/
```

#### Kubernetes Cluster

* 1. Workload submitted to cluster
- 2. Admission webhook triggers Kyverno
- 3. Cluster policies enforce
  - Image signatures
  - Supply-chain attestations
  - Immutable artifacts
- 4. Non-compliant workloads are rejected

---

## Design Rationale 🧠

| Concern	| CI | Cluster |
| --- | --- | --- |
| Fast  feedback |	✅ |	❌ |
| Cryptographic verification |	❌ |	✅ |
| Supply-chain enforcement |	❌ |	✅ |
| Fail-fast validation |	✅ |	❌ |
| Production protection |	❌ |	✅ |

This separation avoids:
- False negatives in CI
- Slow pipelines
- Incomplete security guarantees



