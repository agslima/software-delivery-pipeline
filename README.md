# Governed Software Delivery Pipeline (Full-Stack Reference Implementation)

![CD/CD Status](https://github.com/agslima/secure-app-analysis/actions/workflows/ci-cd.yml/badge.svg)
[![Security: Snyk](https://img.shields.io/badge/Security-Snyk-4C4A73.svg)](https://snyk.io/)
[![OWASP](https://img.shields.io/badge/Compliance-OWASP%20Top%2010-red.svg)](https://owasp.org/)
![SLSA](https://img.shields.io/badge/SLSA-Level%202-blue?logo=linuxfoundation)
[![Docker](https://img.shields.io/badge/Deployment-Docker-blue.svg)](https://docker.com)
[![License](https://img.shields.io/badge/License-Apache%202.0-lightgrey.svg)](https://opensource.org/licenses/Apache-2.0)

> A Secure Software Supply Chain Reference Implementation

## TL;DR

This repository demonstrates how to design and operate a governed CI/CD pipeline where:
- Quality and security gates are enforced automatically
- Container artifacts are signed, traceable, and auditable
- Vulnerabilities are managed through explicit risk policies, not binary pass/fail rules
- The CI/CD pipeline acts as the primary control plane for software delivery

> The application is intentionally simple — the focus is on **software delivery architecture, DevOps practices, and engineering governance**, not framework complexity.

---

## Project Overview 🛡️

This repository demonstrates the **design and operation of a governed software delivery pipeline**, focusing on **DevOps engineering principles, risk management, and supply chain integrity**.

Rather than emphasizing a specific programming language or framework, the project treats the application as a delivery vehicle used to showcase:
- Policy-driven CI/CD pipelines
- Built-in quality and security gates
- Artifact traceability and verification
- Controlled risk acceptance in a real-world scenario

The result is a **production-oriented reference implementation** of how modern teams can enforce engineering standards across the entire Software Development Lifecycle (SDLC).

## Engineering Goals

The architecture was designed to satisfy three core **non-functional requirements**:

### 1. Reliability

- The pipeline must produce deterministic builds
- If code, tests, or policies fail, no artifact is created

### 2. Traceability

Every container image is:
- Cryptographically signed
- Linked to a specific Git commit
- Associated with a Software Bill of Materials (SBOM)

### 3. Risk Management

Security is **not binary**
The system differentiates between:
- Blockers: Critical / High vulnerabilities
- Managed Debt: Medium / Low vulnerabilities tracked and documented

---

## Delivery Architecture (CI/CD as a Control Plane)

### CI/CD as a Control Plane

GitHub Actions is used as the delivery control plane, following a **Pipeline-as-Code** model.

#### Design Decision:
GitHub Actions was chosen over traditional CI servers (e.g., Jenkins) to:
- Minimize operational overhead
- Keep pipeline logic versioned alongside the application
- Treat CI/CD as part of the codebase, not external infrastructure

### Governance Pipeline

```mermaid
graph TD
    subgraph "Phase 1: Code & Dependencies"
        A[Code Commit] -->|Gate 1: Secrets| B(Gitleaks)
        B -->|Gate 2: SAST & SCA| C(Snyk)
        C -->|Gate 3: Unit Tests| D(Jest / TDD)
    end
    
    subgraph "Phase 2: Artifact Construction"
        D -->|Build| E[Docker Build]
        E -->|Gate 4: Dockerfile Policy| F(Hadolint)
        E -->|Gate 5: Image Scan| G(Trivy)
    end
    
    subgraph "Phase 3: Supply Chain Trust"
        G -->|Attestation| H(Syft SBOM)
        H -->|Signing| I(Cosign)
        I --> J[Container Registry]
    end
```

> This pipeline is intentionally **fail-fast**: artifacts are never built or published unless all required quality gates pass.

--- 

## Quality & Risk Controls

### Defense in Depth

The system applies overlapping controls to reduce blind spots and false negatives.

### Layer 1: Application Security (Pre-Build)

**Secret Detection (Gitleaks)**
- Prevents hardcoded credentials from entering the repository.
- Runs before dependency installation to avoid wasted compute on compromised commits.

**SAST & SCA (Snyk)**
Focuses on:
- Source code
- Dependency tree (package.json)

** Decision Rationale:**
Snyk is utilized here for its robust vulnerability intelligence within the Node.js ecosystem.

### Layer 2: Artifact Security (Post-Build)

**Container Scanning (Trivy)**
Detects OS-level and runtime vulnerabilities (e.g., Alpine Linux packages).

**Infrastructure Linting (Hadolint)**
Enforces Dockerfile best practices, including version pinning and deterministic builds.

**Decision Reasoning:**
This layer catches risks that application-level scanners cannot see.

### Layer 3: Supply Chain Guarantees

* **Non-Repudiation (Cosign)**
  - Container images are cryptographically signed.
  - A production cluster could enforce this via an admission controller.

* **Transparency (Syft)**
  - Generates an SPDX-formatted SBOM for every release, enabling rapid impact analysis during future zero-day events (e.g., Log4Shell).

---

## Case Study: Legacy Risk Remediation 🔬

To validate the effectiveness of the delivery control plane, a legacy application with known security debt was intentionally passed through the pipeline.

### 1. The Problem (Initial Assessment)

A baseline scan revealed significant technical and security debt across transitive dependencies.

**Common Vulnerabilities Detected:**

* **Cross-Site Scripting (XSS):** Detected in older frontend libraries.
* **Prototype Pollution:** Found in backend utility packages.
* **Arbitrary Code Execution:** Critical flaw in a deep dependency.

### 2. The Solution (Remediation Process)

I adopted a systematic approach to fix these issues:

1. **Direct Upgrades:** Prioritized direct upgrades where safe versions were available.
2. **Patches:** Applied patches when upgrades were not feasible without breaking changes.
3. **Defensive Coding:** Refactored backend logic to validate input and sanitize headers (OWASP Top 10).

### 3. The Result (Final Status)

After applying the fixes and re-running the CI/CD pipeline checks:

Remediation Workflow

Baseline:
Initial scans detected 27 Critical vulnerabilities

Triage:

Dependency upgrades automated via Snyk

Manual refactoring to mitigate XSS and Prototype Pollution

Risk Acceptance Policy:

Zero Tolerance: Critical / High vulnerabilities block the pipeline

Accepted Risk: Medium / Low vulnerabilities may proceed if no patch exists, prioritizing delivery velocity

| Severity | Initial Count | Current Count | Status |
| :--- | :---: | :---: | :--- |
| **Critical** | 27 | 0 | ✅ Fixed |
| **High** | 116 | 0 | ✅ Fixed |
| **Medium** | 191 | 2 | ⚠️ Risk Accepted (Backlog) |
| **Low** | 345 | 22 | ℹ️ Monitoring |

> This demonstrates risk-based decision making, not absolute zero-tolerance — a more realistic production posture.

#### Evidence

| Initial Vulnerability Scan | Post-Fix Clean Scan |
| --- | --- |
| ![image](https://github.com/agslima/secure-app-analysis/blob/main/docs/images/scan-snyk-01.png) | ![image](https://github.com/agslima/secure-app-analysis/blob/main/docs/images/scan-snyk-02.png) |

## Local Development & Testing

### Prerequisites

* **Node.js v18+**
* **Docker**

### Setup

```bash
git clone https://github.com/agslima/.git
cd folder
npm install
```

### 2. Running Tests (TDD)

```bash
# Run unit and integration tests
npm test

# Run tests in watch mode (for development)
npm run test:watch
```

### 3. Security Validation (Optional)

You need a Snyk account and CLI installed.

Download a standalone executable (for macOS, Linux, and Windows) of the Snyk CLI for your platform.

```bash
snyk auth
snyk test
```

### 4. Running the App

```bash
npm start
```

---

## Policy, Governance & Verification

* **Security by Design:** Controls embedded early in the SDLC
* **Artifact Verification:** Container images can be verified using the public Cosign key in this repository
* **Responsible Disclosure:** See SECURITY.md

## Technology Stack (Reference)

* **Frontend:** React
* **Backend:** Node.js / Express
* **CI/CD:** GitHub Actions
* **Containers:** Docker
* **Supply Chain:** Cosign, Syft
* **Security Analysis:** [Snyk](https://snyk.io) (Software Composition Analysis & SAST), Trivy, Gitleaks

> The application stack is intentionally simple — the focus is on delivery architecture, not framework complexity.

---

## License

This project is licensed under the Apache 2 License. See the `LICENSE file for details.

## Final Note

> This repository should be read as a software delivery system, not an application demo.
> The application exists to validate the policies, controls, and engineering decisions enforced by the pipeline.
