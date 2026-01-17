# Security Debt Registry

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
| CVE-YYYY-NNNN | MEDIUM | npm:yamljs | 0.3.0 | - | Low| There is no fix for this issue | Accept | @agslima | 2026-02-25 | #236 | Dependent packages have eliminated the use of this library. |

---

## Resolved Debt (Historical)

| CVE | Severity | Component | Resolution | Date Resolved (YYYY-MM-DD) | Ticket/Link | Notes |
|---|---|---|---|---|---|---|
| CVE-YYYY-NNNN | MEDIUM | npm:package-name | Patched to 1.2.4 | 2026-01-20 | #123 | Removed from ignore + registry |
