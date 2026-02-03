# Phase 2 Design Plan: Production-Grade Evolution

This plan turns the demo into a production-oriented healthcare workflow focused on doctor access to patient records and prescription management, plus patient prescription access. It is scoped to the `/app` system and aligns with HIPAA/GDPR expectations.

---

## 1) Data Model Changes (PostgreSQL)

### Core Entities
**users**
- `id` (uuid, pk)
- `email` (text, unique, not null)
- `password_hash` (text, not null)
- `role` (enum: `doctor`, `patient`, `admin`)
- `mfa_enabled` (boolean)
- `mfa_secret` (text, nullable)
- `created_at`, `updated_at`

**patients**
- `id` (uuid, pk)
- `user_id` (uuid, fk -> users.id, unique)
- `first_name`, `last_name`
- `dob` (date)
- `gender` (text)
- `phone`, `email`
- `address` (jsonb)
- `created_at`, `updated_at`

**doctors**
- `id` (uuid, pk)
- `user_id` (uuid, fk -> users.id, unique)
- `first_name`, `last_name`
- `license_number` (text, unique)
- `specialty` (text)
- `phone`, `email`
- `created_at`, `updated_at`

**encounters**
- `id` (uuid, pk)
- `patient_id` (uuid, fk -> patients.id)
- `doctor_id` (uuid, fk -> doctors.id)
- `facility_id` (uuid, fk -> facilities.id, nullable)
- `status` (enum: `open`, `closed`)
- `started_at`, `ended_at`
- `created_at`, `updated_at`

**allergies**
- `id` (uuid, pk)
- `patient_id` (uuid, fk -> patients.id)
- `substance` (text)
- `reaction` (text)
- `severity` (enum: `low`, `moderate`, `high`)
- `created_at`, `updated_at`

**medications_catalog**
- `id` (uuid, pk)
- `name` (text, unique)
- `rxnorm_code` (text, nullable)
- `form` (text, nullable)
- `strength` (text, nullable)
- `is_active` (boolean)
- `created_at`, `updated_at`

**prescriptions**
- `id` (uuid, pk)
- `patient_id` (uuid, fk -> patients.id)
- `doctor_id` (uuid, fk -> doctors.id)
- `encounter_id` (uuid, fk -> encounters.id, nullable)
- `status` (enum: `active`, `completed`, `cancelled`)
- `issued_at` (timestamptz)
- `expires_at` (timestamptz, nullable)
- `notes` (text, nullable)
- `created_at`, `updated_at`

**prescription_items**
- `id` (uuid, pk)
- `prescription_id` (uuid, fk -> prescriptions.id)
- `medication_id` (uuid, fk -> medications_catalog.id)
- `dose` (text)
- `route` (text)
- `frequency` (text)
- `duration` (text)
- `quantity` (text)
- `instructions` (text)
- `created_at`, `updated_at`

**audit_events**
- `id` (uuid, pk)
- `actor_user_id` (uuid, fk -> users.id)
- `event_type` (text)
- `subject_type` (text)
- `subject_id` (uuid)
- `ip_address` (text)
- `user_agent` (text)
- `metadata` (jsonb)
- `created_at`

**facilities** (optional for scale)
- `id` (uuid, pk)
- `name` (text)
- `address` (jsonb)
- `created_at`, `updated_at`

### Indexing & Constraints
- Indexes: `patients(dob,last_name)`, `prescriptions(patient_id, issued_at)`, `encounters(patient_id, status)`.
- Unique constraints: `users.email`, `doctors.license_number`.
- Foreign keys with `ON DELETE RESTRICT` for clinical integrity (avoid cascading delete of PHI).

### Migration Strategy
1. Create new normalized tables alongside existing JSONB model.
2. Backfill prescriptions from `prescriptions` JSONB table into normalized tables (one-time migration script).
3. Switch APIs to use normalized tables; keep old data for audit/reference if needed.
4. Remove legacy JSONB columns once parity is verified.

---

## 2) API Specs (REST, versioned under `/api/v2`)

### Auth & Identity
- `POST /api/v2/auth/login` → returns access + refresh tokens.
- `POST /api/v2/auth/refresh` → renew access token.
- `POST /api/v2/auth/mfa/verify` → verify OTP for MFA-enabled users.

### Doctors
- `GET /api/v2/doctors/me`
- `GET /api/v2/doctors/{id}`

### Patients (Doctor Access)
- `GET /api/v2/patients/search?name=&dob=&patient_id=`
- `GET /api/v2/patients/{id}`
- `GET /api/v2/patients/{id}/summary` (vitals/diagnoses/allergies/med history)
- `GET /api/v2/patients/{id}/prescriptions`

### Encounters
- `POST /api/v2/encounters` (create encounter between doctor+patient)
- `PATCH /api/v2/encounters/{id}` (close/open)

### Prescriptions (Doctor)
- `POST /api/v2/prescriptions`
- `GET /api/v2/prescriptions/{id}`
- `PATCH /api/v2/prescriptions/{id}`

### Prescriptions (Patient Portal)
- `GET /api/v2/patient/me/prescriptions`
- `GET /api/v2/patient/me/prescriptions/{id}`

### Medication Lookup
- `GET /api/v2/medications?query=amox`

### Audit
- `GET /api/v2/audit/events` (admin-only, filtered)

#### API Response Contracts (examples)
**Create Prescription**
```json
{
  "patientId": "uuid",
  "encounterId": "uuid",
  "items": [
    {
      "medicationId": "uuid",
      "dose": "500mg",
      "route": "oral",
      "frequency": "TID",
      "duration": "10 days",
      "quantity": "30 capsules",
      "instructions": "Take with meals"
    }
  ],
  "notes": "Follow up in 2 weeks"
}
```

**Prescription Response**
```json
{
  "id": "uuid",
  "status": "active",
  "issuedAt": "2024-01-01T10:00:00Z",
  "doctor": { "id": "uuid", "name": "Dr. Emily Johnson" },
  "patient": { "id": "uuid", "name": "John Smith" },
  "items": [ ... ],
  "interactionWarnings": [
    { "type": "allergy", "message": "Allergy to Amoxicillin" }
  ]
}
```

---

## 3) UI Flows (React SPA)

### Doctor Flow
1. **Login + MFA** (if enabled).
2. **Patient Search** (name, DOB, patient ID).
3. **Patient Dashboard**:
   - Demographics, allergies, medications, recent encounters.
   - Prescription history (sortable by date).
4. **New Prescription**:
   - Medication search (catalog + basic interactions).
   - Form for dosage/route/frequency/duration.
   - Warnings surfaced before submit.
5. **Prescription Detail View**:
   - Printable PDF/summary.

### Patient Flow
1. **Login + MFA**.
2. **My Prescriptions** (active + history).
3. **Prescription Detail** with doctor info and instructions.
4. **Download/Share** (future: pharmacy integration).

### Accessibility
- WCAG AA: contrast, focus states, keyboard navigation, ARIA labels.
- Clear error banners and loading states.

---

## 4) Security Controls

### Identity & Access
- **OAuth2/OIDC** (e.g., Auth0/Keycloak) or in-house with:
  - Access + refresh tokens.
  - Rotation + revocation.
  - MFA (TOTP or SMS; prefer TOTP).
- RBAC and authorization middleware:
  - Doctor can access only patients tied to active encounters or facility.
  - Patient can access only their own records.

### Data Protection
- TLS termination at Nginx or upstream load balancer.
- Encrypt sensitive fields at rest (e.g., PHI columns).
- Hash passwords with Argon2 or bcrypt.

### Auditing & Monitoring
- Structured audit logs for all PHI reads/writes.
- Log event context: actor, patient, prescription, IP, user-agent.
- Centralized log sink (ELK/Datadog/etc).

### Abuse & Threat Mitigations
- Rate limiting by endpoint and role.
- Account lockout / suspicious login detection.
- CSRF protection for session-based flows (or strict CORS if token-based).

---

## 5) Incremental Implementation Phases

1. **Schema & Migration**
   - Add normalized tables and migrate seed data.
2. **Auth Upgrades**
   - Token refresh + MFA scaffolding.
3. **Doctor APIs**
   - Patient search, dashboard, prescriptions CRUD.
4. **Patient Portal**
   - Prescription history and detail views.
5. **Audit Logging**
   - Emit audit events for read/write actions.
6. **Hardening**
   - TLS, stricter rate limits, field-level encryption.

---

## 6) Definition of Done (Phase 2)

- Doctor can search patients, open a dashboard, and create prescriptions.
- Patient can log in and view prescription history.
- RBAC enforced with encounter-based access checks.
- Audit logs for all PHI access.
- Documented APIs (OpenAPI v2).
- Deployed with TLS and secure headers.
