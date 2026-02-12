#!/usr/bin/env bash

# ==============================================================================
# LOCAL DEVELOPMENT SETUP SCRIPT
# ==============================================================================
#
# Quick Start:
#
#   chmod +x app/scripts/phase2_e2e.sh
#   app/scripts/phase2_e2e.sh
#
# Optional MFA flow
# Enable MFA enrollment/verify/disable in one run:
#
#  ENROLL_MFA=1 app/scripts/phase2_e2e.sh
#
#
# ==============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

: "${PATIENT_EMAIL:?Set PATIENT_EMAIL for the patient login}"
: "${PATIENT_PASSWORD:?Set PATIENT_PASSWORD for the patient login}"
: "${DOCTOR_EMAIL:?Set DOCTOR_EMAIL for the doctor login}"
: "${DOCTOR_PASSWORD:?Set DOCTOR_PASSWORD for the doctor login}"
: "${ADMIN_EMAIL:?Set ADMIN_EMAIL for the admin login}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD for the admin login}"

DEFAULT_PATIENT_ID="${DEFAULT_PATIENT_ID:-00000000-0000-4000-8000-000000000030}"
DEFAULT_MEDICATION_ID="${DEFAULT_MEDICATION_ID:-00000000-0000-4000-8000-000000000060}"

ENROLL_MFA="${ENROLL_MFA:-0}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "python3 (or python) is required for JSON parsing."
    exit 1
  fi
fi

log() {
  echo "• $*"
}

json_get() {
  local key="$1"
  "$PYTHON_BIN" - "$key" <<'PY'
import json, sys
data = json.load(sys.stdin)
key = sys.argv[1]
value = data
for part in key.split('.'):
    if isinstance(value, list):
        try:
            idx = int(part)
        except ValueError:
            value = None
            break
        value = value[idx] if 0 <= idx < len(value) else None
    elif isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    sys.exit(0)
if isinstance(value, (dict, list)):
    print(json.dumps(value))
else:
    print(value)
PY
}

totp_code() {
  local secret="$1"
  "$PYTHON_BIN" - "$secret" <<'PY'
import base64, hashlib, hmac, struct, sys, time
secret = sys.argv[1].strip().upper().replace(' ', '')
pad = '=' * ((8 - len(secret) % 8) % 8)
key = base64.b32decode(secret + pad)
counter = int(time.time() // 30)
msg = struct.pack(">Q", counter)
h = hmac.new(key, msg, hashlib.sha1).digest()
o = h[-1] & 0x0f
code = (struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000
print(str(code).zfill(6))
PY
}

RESP_BODY=""
RESP_STATUS=""

request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local token="${4:-}"

  local args=(-s -S -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}")
  if [ -n "$token" ]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi
  if [ -n "$data" ]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi

  local resp
  resp=$(curl "${args[@]}")
  RESP_STATUS=$(echo "$resp" | tail -n1)
  RESP_BODY=$(echo "$resp" | sed '$d')
}

assert_status() {
  local expected="$1"
  if [ "$RESP_STATUS" != "$expected" ]; then
    echo "Expected HTTP $expected, got $RESP_STATUS"
    echo "$RESP_BODY"
    exit 1
  fi
}

log "Patient login"
request POST "/api/v2/auth/login" "{\"email\":\"${PATIENT_EMAIL}\",\"password\":\"${PATIENT_PASSWORD}\"}"
assert_status 200
MFA_REQUIRED=$(echo "$RESP_BODY" | json_get mfaRequired || true)
if [ "$MFA_REQUIRED" = "True" ] || [ "$MFA_REQUIRED" = "true" ]; then
  echo "Patient login requires MFA. This script cannot proceed without a current TOTP code."
  exit 2
fi
PATIENT_TOKEN=$(echo "$RESP_BODY" | json_get accessToken)

log "Patient prescriptions list"
request GET "/api/v2/patient/me/prescriptions" "" "$PATIENT_TOKEN"
assert_status 200
FIRST_PRESCRIPTION_ID=$(echo "$RESP_BODY" | json_get prescriptions.0.id || true)
if [ -n "$FIRST_PRESCRIPTION_ID" ]; then
  log "Patient prescription detail"
  request GET "/api/v2/patient/me/prescriptions/${FIRST_PRESCRIPTION_ID}" "" "$PATIENT_TOKEN"
  assert_status 200
else
  log "No prescriptions returned for patient (OK if empty seed)."
fi

log "Patient MFA status"
request GET "/api/v2/auth/mfa/status" "" "$PATIENT_TOKEN"
assert_status 200

if [ "$ENROLL_MFA" = "1" ]; then
  log "Enroll MFA"
  request POST "/api/v2/auth/mfa/enroll" "{\"label\":\"${PATIENT_EMAIL}\"}" "$PATIENT_TOKEN"
  assert_status 200
  MFA_SECRET=$(echo "$RESP_BODY" | json_get secret)
  if [ -n "$MFA_SECRET" ]; then
    CODE=$(totp_code "$MFA_SECRET")
    log "Verify MFA"
    request POST "/api/v2/auth/mfa/verify" "{\"code\":\"${CODE}\"}" "$PATIENT_TOKEN"
    assert_status 200
    PATIENT_TOKEN=$(echo "$RESP_BODY" | json_get accessToken)
    log "Disable MFA"
    request POST "/api/v2/auth/mfa/disable" "" "$PATIENT_TOKEN"
    assert_status 200
  fi
fi

log "Doctor login"
request POST "/api/v2/auth/login" "{\"email\":\"${DOCTOR_EMAIL}\",\"password\":\"${DOCTOR_PASSWORD}\"}"
assert_status 200
DOC_MFA_REQUIRED=$(echo "$RESP_BODY" | json_get mfaRequired || true)
if [ "$DOC_MFA_REQUIRED" = "True" ] || [ "$DOC_MFA_REQUIRED" = "true" ]; then
  echo "Doctor login requires MFA. This script cannot proceed without a current TOTP code."
  exit 2
fi
DOCTOR_TOKEN=$(echo "$RESP_BODY" | json_get accessToken)

log "Doctor profile"
request GET "/api/v2/doctors/me" "" "$DOCTOR_TOKEN"
assert_status 200

log "Patient search"
request GET "/api/v2/patients/search?name=John" "" "$DOCTOR_TOKEN"
assert_status 200
PATIENT_ID=$(echo "$RESP_BODY" | json_get results.0.id || true)
if [ -z "$PATIENT_ID" ]; then
  PATIENT_ID="$DEFAULT_PATIENT_ID"
fi

log "Patient summary"
request GET "/api/v2/patients/${PATIENT_ID}/summary" "" "$DOCTOR_TOKEN"
assert_status 200

log "Medication search"
request GET "/api/v2/medications?query=Amox" "" "$DOCTOR_TOKEN"
assert_status 200
MEDICATION_ID=$(echo "$RESP_BODY" | json_get results.0.id || true)
if [ -z "$MEDICATION_ID" ]; then
  MEDICATION_ID="$DEFAULT_MEDICATION_ID"
fi

log "Create encounter"
request POST "/api/v2/encounters" "{\"patientId\":\"${PATIENT_ID}\"}" "$DOCTOR_TOKEN"
assert_status 201
ENCOUNTER_ID=$(echo "$RESP_BODY" | json_get id || true)

log "Create prescription"
request POST "/api/v2/prescriptions" "{\"patientId\":\"${PATIENT_ID}\",\"encounterId\":\"${ENCOUNTER_ID}\",\"items\":[{\"medicationId\":\"${MEDICATION_ID}\",\"dose\":\"500mg\",\"route\":\"oral\",\"frequency\":\"TID\",\"duration\":\"10 days\",\"quantity\":\"30 capsules\",\"instructions\":\"Take with meals.\"}],\"notes\":\"Follow up in 2 weeks\"}" "$DOCTOR_TOKEN"
assert_status 201
PRESCRIPTION_ID=$(echo "$RESP_BODY" | json_get id || true)

if [ -n "$PRESCRIPTION_ID" ]; then
  log "Update prescription"
  request PATCH "/api/v2/prescriptions/${PRESCRIPTION_ID}" "{\"status\":\"completed\"}" "$DOCTOR_TOKEN"
  assert_status 200
fi

log "Admin login"
request POST "/api/v2/auth/login" "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}"
assert_status 200
ADMIN_MFA_REQUIRED=$(echo "$RESP_BODY" | json_get mfaRequired || true)
if [ "$ADMIN_MFA_REQUIRED" = "True" ] || [ "$ADMIN_MFA_REQUIRED" = "true" ]; then
  echo "Admin login requires MFA. This script cannot proceed without a current TOTP code."
  exit 2
fi
ADMIN_TOKEN=$(echo "$RESP_BODY" | json_get accessToken)

log "Audit events list"
request GET "/api/v2/audit/events?limit=10" "" "$ADMIN_TOKEN"
assert_status 200

echo "✅ Phase 2 E2E checks completed."
