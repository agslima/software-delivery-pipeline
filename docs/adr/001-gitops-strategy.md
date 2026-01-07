
# Architecture Decision Record (ADR) 

## ADR 001: CI-Driven (Push-Based) GitOps Strategy

 * Status: Accepted
 * Date: 2026-01-07
 * Context: Software Delivery Pipeline Design

### Context

The project requires an automated mechanism to update Kubernetes manifests with the immutable image digest of a newly built artifact. The goal is to ensure that the cluster state is declaratively versioned in Git (GitOps), preventing configuration drift and enabling auditability.

Two primary architectural patterns exist for this workflow:

 * **Pull-Based GitOps:** An in-cluster operator (e.g., ArgoCD, Flux) monitors the Git repository and synchronizes changes to the cluster.
 * **Push-Based (CI-Driven) GitOps:** The CI pipeline (GitHub Actions) directly commits changes to the infrastructure repository or applies manifests to the cluster.

### Decision

It was decided to implement a CI-Driven (Push-Based) GitOps workflow where the CI pipeline updates the infrastructure manifest (deployment.yaml) and opens a Pull Request against the main branch.

### Rationale

While Pull-based GitOps (ArgoCD) is the industry standard for large-scale enterprise clusters, the Push-based model was chosen for this reference implementation due to the following engineering constraints:

 * Operational Simplicity: A Pull-based approach requires maintaining persistent infrastructure (a running Kubernetes cluster with ArgoCD installed) to demonstrate the pipeline. The Push-based approach allows the pipeline to be fully functional and verifiable using only GitHub Actions, making it accessible to anyone cloning the repository.
 * Architecture Visibility: By keeping the logic within GitHub Actions, the entire flow—from build to manifest update—is visible in a single linear log, simplifying debugging and traceability for this specific use case.
 * Portability: This approach minimizes external dependencies, allowing the "Software Supply Chain" concepts (signing, attestation, SBOMs) to remain the focal point without being overshadowed by complex cluster tooling.

### Consequences

#### Positive

 * **Zero Infrastructure Overhead:** No need to pay for or maintain a permanent control plane (ArgoCD) to keep the demo alive.
 * **Immediate Feedback:** Validation failures (e.g., Kyverno policy checks on the manifest) happen immediately in the CI logs before the commit is merged.

#### Negative / Risks

 * **Security Boundary:** The CI system requires write access to the Git repository. In a Pull-based model, the CI system never needs write access to the cluster state repo, offering a tighter security boundary.
 * **Drift Management:** Without an active operator (like ArgoCD) constantly watching the cluster, manual changes made directly to the cluster (via kubectl) will not be automatically reverted. This is mitigated by the project's focus on delivery governance rather than runtime enforcement.

