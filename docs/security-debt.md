# Security Risk Ledger (Managed Debt)

This document tracks known vulnerabilities that are currently present in the production artifacts. These risks have been analyzed, triaged, and **accepted** for a specific period, following the project's Risk Management Policy.

## Policy Overview
* **Critical / High:** Zero Tolerance. Must be remediated before release.
* **Medium / Low:** Can be accepted if no fix is available or if the exploitability risk is negligible. Must be reviewed every 30 days.

---

## Active Risks

### ID: RISK-2026-001 (BusyBox CVE-2025-46394)

| Attribute | Details |
| :--- | :--- |
| **Component** | `busybox` (via `node:24.11.1-alpine3.21`) |
| **Severity** | **Low** (CVSS 3.3) |
| **Status** | ⚠️ **Accepted Risk** |
| **Detection Date** | 2026-01-01 |
| **Review Date** | 2026-02-01 |

#### Technical Analysis
* **Vulnerability:** `CVE-2025-46394`
* **Description:** A vulnerability in BusyBox allows for potential denial of service or code execution under specific, unlikely conditions involving complex command-line arguments.
* **Exploit Maturity:** **No known exploit** exists in the wild.

#### Remediation Status
* **Fix Available:** Yes (BusyBox 1.37.0-r14).
* **Blocker:** The fix is available in Alpine Linux packages, but the upstream base image (`node:24.11.1-alpine3.21`) has not yet rebuilt its layer to include `r14`.
* **Workaround:** Manually upgrading packages in the Dockerfile adds complexity and build time (`apk upgrade`). Given the "Low" severity, this is deemed unnecessary overhead.

#### Decision
**Accept Risk.** We will wait for the official `node:alpine` base image update in the next patch cycle. The attack surface for this specific vulnerability is negligible in our containerized runtime environment.

---

## Resolved Risks (History)

