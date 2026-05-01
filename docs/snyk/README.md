## Operational Evidence

This section summarizes the repository’s current published vulnerability posture and links to the underlying evidence.

<!-- [BEGIN_GENERATED_TABLE] -->

### Automated Security Posture

| Severity | Initial Count | Current Count | Status |
| :--- | :---: | :---: | :--- |
| **Critical** | 27 | 0 | ✅ Fixed |
| **High** | 116 | 0 | ✅ Fixed |
| **Medium** | 191 | 1 | ℹ️ Managed Debt |
| **Low** | 345 | 16 | ℹ️ Managed Debt |

*Last scanned (UTC): 2026-04-05 02:30*
<!-- [END_GENERATED_TABLE] -->

This table is **automatically generated** by the repository evidence pipeline and reflects the latest published Snyk-based vulnerability snapshot tracked in [`docs/snyk/`](docs/snyk/index.md).

Interpretation:

- **Baseline:** the intentionally vulnerable starting state used to validate remediation and policy behavior.
- **Current:** the latest published scan snapshot.
- **Critical:** always release-blocking until remediated.
- **High:** remediation priority; release-blocking when documented policy thresholds are exceeded.
- **Medium / Low:** allowed only when tracked as time-bound managed debt in [`docs/security-debt.md`](docs/security-debt.md).
- **Managed Debt:** displayed when Medium or Low vulnerabilities remain open under approved governance controls.

### Case Study 🔬

To validate that the governance model works in practice, the application described in [`app/readme.md`](https://github.com/agslima/software-delivery-pipeline/tree/main/app) was intentionally exercised through the pipeline with known vulnerabilities and security weaknesses. The goal was not to showcase an insecure app, but to demonstrate how the delivery system detects, blocks, tracks, and verifies remediation.

### Remediation Workflow

- **Baseline:** initial scans surfaced known dependency vulnerabilities and selected application-layer issues introduced for validation.
- **Triage:** Dependabot automated dependency upgrades; manual changes mitigated issues such as XSS and Prototype Pollution.
- **Governance outcome:** Critical findings block release, and High findings block release when they exceed the documented threshold (`HIGH > 5` per image). Medium and Low findings may proceed only under documented, time-bound exception governance.

### Evidence

| Initial Vulnerability Scan |
| --- |
| ![Initial Snyk vulnerability scan](https://github.com/agslima/software-delivery-pipeline/blob/main/docs/images/scan-snyk-01.png) |

>[!NOTE]
> This section provides **governance evidence**, not the release admission decision itself. Snyk snapshots document published posture over time, but release blocking is governed by the Trivy and ZAP controls mapped in [`docs/threat-model.md`](docs/threat-model.md) and [`docs/governance.md`](docs/governance.md#readme-claims--controls-matrix).