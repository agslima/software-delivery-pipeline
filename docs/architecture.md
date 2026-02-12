# Architecture & Repository Structure

This repository is organized to strictly separate Application Logic, Infrastructure Definition, and Governance Policies. This structure supports a "Shift-Left" approach where policy testing happens alongside application testing.

## 📂 Repository Map

### 1. The Workload (/app)

Contains the source code and build definitions for the microservice.
 * Dockerfile: Defines the immutable build artifact.
 * server/: Node.js backend logic.
 * server/tests/: Unit tests ensuring code functionality before security scanning begins.

### 2. The Policy Engine (/policies & /k8s/policies)
This is the core of the governance model. Policies are treated as code, versioned, and tested.
 * /policies/*.rego: OPA (Open Policy Agent) rules used for Static Analysis.
   * Example: dockerfile.rego ensures no root users or :latest tags are used during the build.
 * /k8s/policies: Kyverno policies used for Admission Control (Cluster-level governance).
   * ci/: Policies validated inside the GitHub Actions pipeline (Pre-Commit).
   * cluster/: Policies enforced by the Kubernetes Admission Controller (Post-Deployment).
   * pod-hardening.yaml: Baseline security standards (e.g., restricting privilege escalation).

### 3. Infrastructure as Code (/k8s)

Defines the desired state of the application in Kubernetes.
 * resources/: The actual manifest files (deployment.yaml, pdb.yaml).
   * Note: The pipeline updates deployment.yaml with the signed image digest automatically (GitOps).
 * tests/: Infrastructure Unit Tests.
   * Contains Kyverno CLI test manifests (kyverno-test.yaml) and mock resources (fixtures) to ensure policies behave as expected before they reach the cluster.

### 4. Governance Logic (/scripts & /docs)

Scripts and documentation that bridge the gap between "Tool Output" and "Business Decision."
 * scripts/check-security-debt.sh: Implements the "Risk Acceptance" logic. It parses vulnerability reports and decides if the build should pass based on the definitions in security-debt.md.
 * docs/: Evidence of control.
   * threat-model.md: Analysis of the attack surface.
   * governance.md: Explains the human processes backing the automated pipeline.

## 🔄 Data Flow Through the Structure

 * Code Change: A commit triggers the pipeline.
 * App Validation: /app is tested (npm test) and scanned (Trivy/Snyk).
 * Policy Check (Build): /app/Dockerfile is checked against /policies/dockerfile.rego.
 * Artifact Creation: A container is built and signed.
 * Policy Check (Infra): The proposed Kubernetes manifests in /k8s/resources are validated against /k8s/policies.
 * GitOps Update: If all gates pass, the pipeline updates /k8s/resources/deployment.yaml with the new image digest.

## 🏗️ Design Decisions

| Directory | Architectural Pattern | Purpose |
|---|---|---|
| k8s/tests | Test-Driven Infrastructure | Ensures policies (like "Must have liveness probes") actually work before breaking the build. |
| policies/ | Policy-as-Code | Decouples "Security Rules" from the "Pipeline Configuration," allowing security teams to update rules without editing YAML workflows. |
| scripts/ | Governance-as-Code | Codifies the decision-making process for handling technical debt, rather than relying on manual approvals. |
