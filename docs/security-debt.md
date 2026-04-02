# Security Debt Registry

> [!NOTE]
> Purpose: Explicit, time-bound risk acceptance for vulnerabilities that are not immediately fixable.
> Policy: Any MEDIUM/LOW vulnerability found by Trivy must be either:
>
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
| --- | --- | --- | --- | --- | --- | --- |
| CVE-2025-64756 | HIGH | npm:glob (glob@10.4.5) | Patched to 10.5.0 or 11.1.0 | 2026-01-20 | #115 | Found in npm’s bundled deps (/usr/local/lib/node_modules/npm/...) |
| CVE-2026-23745 | HIGH | npm:tar (tar@6.2.1, tar@7.4.3) | Patched to 7.5.3 | 2026-01-20 | #115 | Multiple occurrences inside npm dependency tree (e.g., npm/node_modules/tar, cacache/node_modules/tar, node-gyp/node_modules/tar) |
| CVE-2026-4800 | HIGH | lodash vulnerable to Code Injection via `_.template` imports key names | Patched to 4.18.1 | 2026-04-02 | `#148` | Updated to 4.18.1 to address Code Injection via `_.template` imports key names. |
