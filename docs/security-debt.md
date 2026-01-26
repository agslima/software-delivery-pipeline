# Security Debt Registry

> [!NOTE]
> Purpose: Explicit, time-bound risk acceptance for vulnerabilities that are not immediately fixable.
> Policy: Any MEDIUM/LOW vulnerability found by Trivy must be either:
> - Registered here (not expired), OR
> - Temporarily allowlisted in `.trivyignore` with an expiry date.
>
> ✅ This file is auditable. Keep entries specific, justified, and time-boxed.

## Rules
- **Keyed by CVE** (CVE-YYYY-NNNN...).
- **Expires** is mandatory (no permanent exceptions).
- **Owner** is mandatory (who will re-check and remove the debt).
- **Ticket/Link** is mandatory (issue, Jira, etc).
- When fixed, move the entry to the **Resolved** section with a resolution date.

---

## Active Debt (Allowed)

| CVE | Severity | Component | Current Version | Fixed Version | Exploitability | Justification | Decision | Owner | Expires (YYYY-MM-DD) | Ticket/Link | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - | - | - | - | - |

---

## Resolved Debt (Historical)

| CVE | Severity | Component | Resolution | Date Resolved (YYYY-MM-DD) | Ticket/Link | Notes |
|---|---|---|---|---|---|---|
| CWE-772 | MEDIUM | npm:yamljs | - | 2026-01-25 | #264 | There is no fix for this issue; Dependent packages have eliminated the use of this library. |
| CVE-2025-64756 | HIGH |	npm:glob (glob@10.4.5) 	| Patched to 10.5.0 or 11.1.0| 	2026-01-20 |	#264	| Found in npm’s bundled deps (/usr/local/lib/node_modules/npm/...) |
| CVE-2026-23745 |	HIGH |	npm:tar (tar@6.2.1, tar@7.4.3)  	| Patched to 7.5.3 |	2026-01-20 |	#264 |	Multiple occurrences inside npm dependency tree (e.g., npm/node_modules/tar, cacache/node_modules/tar, node-gyp/node_modules/tar) |
| GHSA-73rr-hh4g-fpgx |	LOW |	npm:diff (diff@5.2.0) |	Patched to 8.0.3 |	2026-01-20 |	#264	| Also under npm’s bundled deps (/usr/local/lib/node_modules/npm/.../diff) |
| CWE-772 | MEDIUM | npm:yamljs | 0.3.0 | - | Low| There is no fix for this issue | Accept | @agslima | 2026-02-25 | #236 | Dependent packages have eliminated the use of this library. |
