# Threat Model & Security Controls

## 1. Executive Summary
This document outlines the threat landscape for the **Governed Software Delivery Pipeline**. It identifies potential attack vectors against the software supply chain and details the specific engineering controls implemented to mitigate them.

The security model assumes a **"Zero Trust"** approach to the build pipeline:
* We do not trust the Code (scanned for secrets/bugs).
* We do not trust the Dependencies (scanned for CVEs).
* We do not trust the Artifact (must be signed).
* We do not trust the Runtime (must verify signatures).

---

## 2. Assets at Risk
* **Source Code:** Intellectual property and business logic.
* **Build Environment:** The CI/CD runners that compile the application.
* **Container Artifacts:** The final deployable units.
* **Signing Identity:** The OIDC identity used to sign releases.
* **Production Environment:** The Kubernetes cluster where the app runs.

---

## 3. Threat Analysis (STRIDE)

### A. Tampering (Integrity)
*Definition: Malicious modification of code, dependencies, or artifacts.*

| Threat Scenario | Attack Vector | Mitigation Control | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Dependency Confusion / Poisoning** | Attacker injects a malicious package (e.g., `event-stream` attack) or a dependency introduces a Critical CVE. | **SCA (Software Composition Analysis)** | **Snyk** scans `package.json` and lockfiles during CI. Builds fail on High/Critical CVEs. |
| **Code Injection** | A developer unknowingly commits vulnerable code (XSS, Injection) or logic flaws. | **SAST & Unit Testing** | **Snyk Code** analyzes static source. **Jest** ensures logic acts as expected. |
| **Artifact Modification** | An attacker gains access to Docker Hub and pushes a malicious image overwriting `v1.0.0`. | **Immutable Digests & Signing** | The pipeline deploys by **SHA Digest**, not mutable tags. **Cosign** signs the image, effectively "freezing" the content. |
| **Dockerfile Tampering** | A developer changes the base image to an insecure version or runs as root. | **Infrastructure Linting** | **Hadolint** enforces Docker best practices (e.g., pinning versions, avoiding root). |

### B. Spoofing & Repudiation (Identity)
*Definition: Pretending to be a valid publisher or denying that an action took place.*

| Threat Scenario | Attack Vector | Mitigation Control | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Rogue Container Deployment** | An attacker creates a valid-looking container and tries to deploy it to the cluster. | **Admission Control & Signature Verification** | **Kyverno** policy blocks any pod that does not contain a valid **Cosign** signature linked to this specific GitHub Repository. |
| **Stolen Signing Keys** | An attacker steals a private GPG key to sign malicious malware. | **Keyless Signing (OIDC)** | We use **Sigstore/Cosign Keyless**. There are no long-lived private keys to steal. Signing is bound to the ephemeral OIDC identity of the GitHub Action runner. |
| **Provenance Forgery** | An attacker claims a binary was built by the "Official Pipeline" when it was built on a laptop. | **SLSA Provenance** | **GitHub Attestations** generate unforgeable provenance linking the artifact to the exact Git Commit and Workflow Run ID. |

### C. Information Disclosure (Confidentiality)
*Definition: Leaking sensitive data.*

| Threat Scenario | Attack Vector | Mitigation Control | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Hardcoded Secrets** | A developer accidentally commits AWS keys or API tokens to Git. | **Secret Scanning** | **Gitleaks** scans the commit history before the build proceeds. |
| **Vulnerable Runtime Configuration** | The application leaks stack traces or lacks security headers in production. | **DAST (Dynamic Analysis)** | **OWASP ZAP** scans the running container for missing headers (`HSTS`, `X-Content-Type`) and information leakage. |

---

## 4. Deep Dive: Defense Against Specific Attacks

### Scenario 1: The "Compromised Registry" Attack
**The Attack:** A hacker obtains the CI/CD credentials (DOCKER_TOKEN) and pushes a malware-laden image to `agslima/software-delivery-pipeline:latest`.
**The Defense:**
1.  **Kyverno** in the cluster sees the new image.
2.  It attempts to verify the signature using the **Cosign** public key transparency log.
3.  The hacker *could* push the image, but they **cannot** generate a valid signature because they do not have the GitHub Actions OIDC token.
4.  **Result:** The cluster **rejects** the deployment.

### Scenario 2: The "SolarWinds" Build Injection
**The Attack:** An attacker modifies the build environment itself to inject code *during* compilation, bypassing source code review.
**The Defense:**
1.  **Ephemeral Runners:** Each build runs on a fresh GitHub-hosted VM, destroying any persistence.
2.  **SLSA Provenance:** The `attest-build-provenance` step records exactly *where* and *how* the binary was built.
3.  **Verification:** A consumer (or the cluster) verifies the SLSA predicate. If the provenance claims the builder was "My-Laptop" instead of "GitHub-Actions," the artifact is rejected.

---

## 5. Residual Risks (Accepted Debt)
*While the pipeline is robust, the following risks are acknowledged and managed:*

1.  **Zero-Day Vulnerabilities:** Scanners (Snyk/Trivy) can only detect *known* CVEs. A true Zero-Day exploits a vulnerability before it is public.
    * *Mitigation:* **Syft SBOM** allows for rapid identification of affected components when a Zero-Day is announced.
2.  **GitHub Actions Compromise:** If GitHub itself is compromised, the OIDC trust chain could be broken.
    * *Mitigation:* This is a platform risk accepted by using a SaaS CI provider.

---

## 6. Security Architecture Diagram

```mermaid
flowchart LR
    subgraph "Development"
        Code[Source Code] -->|Gitleaks| Commit
    end

    subgraph "CI Pipeline (Trusted Builder)"
        Commit -->|Snyk SAST| Build
        Build -->|Hadolint| Docker[Docker Build]
        Docker -->|Trivy| Scan[Image Scan]
        Scan -->|OWASP ZAP| DAST
        DAST -->|Cosign| Sign[Sign & Attest]
    end

    subgraph "Registry"
        Sign --> Reg[Docker Registry]
    end

    subgraph "Production (Runtime)"
        Reg -->|Pull| K8s[Kubernetes Cluster]
        Policy[Kyverno Policy] -- Deny Unsigned --> K8s
    end
