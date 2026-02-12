# Security Policy

## Supported Versions

Use this section to inform people about which versions of your project are currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of our software seriously. If you suspect that you have found a vulnerability, please follow the steps below.

### 1. Do not open a public GitHub issue

Publicly announcing a security vulnerability can put the entire community at risk. Please keep the details private until we have addressed the issue.

### 2. Contact us

Please email us at **a.agnaldosilva at gmail.com** with a detailed report. Include:

* Description of the vulnerability.
* Steps to reproduce.
* Potential impact.

### 3. Response Timeline

* We will acknowledge your email within **48 hours**.
* We will send a confirmation once the issue is verified.
* We aim to release a patch within **7 days** for critical issues.

## Security Measures

This project implements the following security practices:

* **SCA & SAST:** Automated scanning via Snyk.
* **Container Security:** Image scanning via Trivy.
* **Secrets Management:** Automated detection of hardcoded credentials.
* **SLSA Compliance:** SBOM generation and Image Signing.

Thank you for helping keep our application secure!
