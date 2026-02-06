# End‑to‑end verification checklist

**Prereq: seed data (if not already)**
Run seeds after migrations so the demo users exist.

```bash
docker compose exec backend node ./node_modules/knex/bin/cli.js migrate:latest --knexfile src/config/knexfile.js

docker compose exec backend node ./node_modules/knex/bin/cli.js seed:run --knexfile src/config/knexfile.js
```

---

## 1) Patient Portal Flow (UI)

1. Open the UI: `http://localhost:4173`
2. Login as patient:
   - Email: `john.smith@stayhealthy.test`
   - Password: `DemoPass123!`
3. Confirm:
   - “Prescription History” list renders.
   - Clicking a prescription shows details.
4. MFA Enrollment + Verify Now:
   - In the **Security** card, click **Enable MFA**.
   - Scan the QR (or use the setup secret) in an authenticator app.
   - Enter the 6‑digit code in **Verify now**.
   - Confirm success banner and “MFA enabled” status.
5. Disable MFA:
   - Click **Disable MFA** and confirm banner.

---

## 2) Doctor Flow (API)

Use these demo IDs (from v2 seed):

- Doctor user: `dr.emily@stayhealthy.test` / `DemoPass123!`
- Patient ID: `00000000-0000-4000-8000-000000000030`
- Encounter ID: `00000000-0000-4000-8000-000000000040`
- Prescription ID: `00000000-0000-4000-8000-000000000050`

**2.1 Login**

```bash
curl -s -X POST http://localhost:8080/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.emily@stayhealthy.test","password":"DemoPass123!"}'

  curl -s -X POST https://scaling-space-giggle-vpw79xrw6xv26x9v-8080.app.github.dev/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.emily@stayhealthy.test","password":"DemoPass123!"}'

  
```

Copy `accessToken` as `DOCTOR_TOKEN`.

**2.2 Get doctor profile**

```bash
curl -s http://localhost:8080/api/v2/doctors/me \
  -H "Authorization: Bearer DOCTOR_TOKEN"
```

**2.3 Patient search**

```bash
curl -s "http://localhost:8080/api/v2/patients/search?name=John" \
  -H "Authorization: Bearer DOCTOR_TOKEN"
```

**2.4 Patient summary**

```bash
curl -s http://localhost:8080/api/v2/patients/00000000-0000-4000-8000-000000000030/summary \
  -H "Authorization: Bearer DOCTOR_TOKEN"
```

**2.5 Create encounter**

```bash
curl -s -X POST http://localhost:8080/api/v2/encounters \
  -H "Authorization: Bearer DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"00000000-0000-4000-8000-000000000030"}'
```

Capture the returned `id` for later.

**2.6 Create prescription**

```bash
curl -s -X POST http://localhost:8080/api/v2/prescriptions \
  -H "Authorization: Bearer DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId":"00000000-0000-4000-8000-000000000030",
    "items":[{"medicationId":"00000000-0000-4000-8000-000000000060","dose":"500mg","route":"oral","frequency":"TID","duration":"10 days","quantity":"30 capsules","instructions":"Take with meals."}],
    "notes":"Follow up in 2 weeks"
  }'
```

**2.7 Update prescription**

```bash
curl -s -X PATCH http://localhost:8080/api/v2/prescriptions/00000000-0000-4000-8000-000000000050 \
  -H "Authorization: Bearer DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

---

## 3) Admin Audit Check (API)

Login as admin:

```bash
curl -s -X POST http://localhost:8080/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stayhealthy.test","password":"DemoPass123!"}'
```

Copy `accessToken` as `ADMIN_TOKEN`.

List audit events:

```bash
curl -s "http://localhost:8080/api/v2/audit/events?limit=20" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```