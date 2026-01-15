## Operational Evidence

### Case Study: Legacy Risk Remediation 🔬

To validate the effectiveness of the delivery control plane, a legacy application with known security debt was intentionally passed through the pipeline.

### Remediation Workflow

- **Baseline:**
  - Initial scans detected 27 Critical vulnerabilities

- **Triage:**
  - Dependency upgrades automated via Snyk
  - Manual refactoring to mitigate XSS and Prototype Pollution

- **Risk Acceptance Policy:**
  - Zero Tolerance: Critical / High vulnerabilities block the pipeline
  - Accepted Risk: Medium / Low vulnerabilities may proceed if no patch exists, prioritizing delivery velocity

### Metrics & Results

| Severity | Initial Count | Current Count | Status |
| :--- | :---: | :---: | :--- |
| **Critical** | 27 | 0 | ✅ Fixed |
| **High** | 116 | 0 | ✅ Fixed |
| **Medium** | 191 | 0 | ✅ Fixed |
| **Low** | 345 | 2 | ℹ️ Managed Debt |

> This demonstrates risk-based decision making, not absolute zero-tolerance — a more realistic production posture.
> Managed debt is tracked in `docs/security-debt.md`, demonstrating risk-based decision making

### Evidence

| Initial Vulnerability Scan | Post-Fix Clean Scan |
| --- | --- |
| ![image](https://github.com/agslima/secure-app-analysis/blob/main/docs/images/scan-snyk-01.png) | ![image](https://github.com/agslima/secure-app-analysis/blob/main/docs/images/scan-snyk-02.png) |

---
