# Data Processing Inventory (Phase 3)

## Systems Overview

| System | Purpose | Data Categories | Data Subjects | Storage | Retention | Access |
| --- | --- | --- | --- | --- | --- | --- |
| API (Node) | Prescription management | PHI/PII | Patients, Doctors | Postgres | TBD | RBAC + JWT/OIDC |
| Client (SPA) | Patient/Doctor UI | PHI/PII | Patients, Doctors | Browser session | Session | Auth tokens |
| Audit Pipeline | Access logging | Metadata + IDs | Users | Postgres or logs | TBD | Admin only |

## Data Categories

- PHI: Diagnoses, medications, prescriptions, encounters
- PII: Name, DOB, email, phone, address
- Auth: User IDs, roles, MFA status
- Audit: Access metadata, IP, user-agent

## Retention Policy (Placeholders)

- Production PHI: TBD
- Audit logs: TBD
- Operational logs: TBD

