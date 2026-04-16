#!/bin/bash

set -euo pipefail

usage() {
  cat <<EOF
Quick start: local OWASP ZAP full scan

Runs the same Compose-backed DAST flow used by \`make dast-weekly-local\`.
Reports are written to: ${APP_DIR}/zap-out/

From the repository root:

  make dast-weekly-local

Set explicit auth credentials for the seeded DAST admin user:

  ZAP_LOGIN_EMAIL=dast-admin@example.test \\
  ZAP_LOGIN_PASSWORD='ChangeMe123!ChangeMe123!' \\
  make dast-weekly-local

Keep the environment running for inspection after the scan:

  ZAP_LOGIN_EMAIL=dast-admin@example.test \\
  ZAP_LOGIN_PASSWORD='ChangeMe123!ChangeMe123!' \\
  KEEP_DAST_ENV=1 \\
  make dast-weekly-local

Run the script directly:

  ${ROOT_DIR}/scripts/security/run-local-zap-full-scan.sh

Common overrides:
  ZAP_LOGIN_EMAIL            Email used for the seeded DAST admin user
  ZAP_LOGIN_PASSWORD         Password used for the seeded DAST admin user
  KEEP_DAST_ENV=1            Preserve compose stack, env file, and generated secrets
  DEBUG_DAST=1               Emit extra debug output during the run
  FAIL_ON_LOW_URLS=1         Fail if URL coverage is below the configured floor

Requirements:
  docker curl jq awk python3 grep head sed timeout
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
APP_DIR="${ROOT_DIR}/app"

random_hex() {
  local bytes="${1:-16}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  elif [[ -r /dev/urandom ]]; then
    head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  else
    echo "No cryptographically secure random source available" >&2
    return 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

log_mask() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::add-mask::$1"
  fi
}

github_env_set() {
  local key="$1"
  local value="$2"
  export "$key=$value"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_ENV"
  fi
}

for cmd in docker curl jq awk python3 grep head sed timeout; do
  require_command "$cmd"
done

ZAP_IMG="${ZAP_IMG:-ghcr.io/zaproxy/zaproxy@sha256:8e79e827afb9e8bdba390c829eb3062062cdb407570559e2ddebd49130c00a59}"
ZAP_FRONTEND_URL="${ZAP_FRONTEND_URL:-http://frontend:8080}"
ZAP_BACKEND_URL="${ZAP_BACKEND_URL:-http://backend:8080}"
RUNNER_FRONTEND_URL="${RUNNER_FRONTEND_URL:-http://127.0.0.1:4173}"
RUNNER_BACKEND_URL="${RUNNER_BACKEND_URL:-http://127.0.0.1:8080}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-zap-local-$(date -u +%Y%m%d%H%M%S)}"

ZAP_CONTEXT_FILE="${ZAP_CONTEXT_FILE:-${ROOT_DIR}/.zap/context.context}"
ZAP_RULES_FILE="${ZAP_RULES_FILE:-${ROOT_DIR}/.zap/rules.tsv}"
MEDIUM_BLOCK_PATTERNS_FILE="${MEDIUM_BLOCK_PATTERNS_FILE:-${ROOT_DIR}/.zap/medium-block-patterns.txt}"

ZAP_SPIDER_MINS="${ZAP_SPIDER_MINS:-8}"
ZAP_STARTUP_TIMEOUT_MINS="${ZAP_STARTUP_TIMEOUT_MINS:-5}"
ZAP_PASSIVE_WAIT_SECS="${ZAP_PASSIVE_WAIT_SECS:-10}"

BLOCK_HIGH="${BLOCK_HIGH:-1}"
BLOCK_MEDIUM_CATEGORIES="${BLOCK_MEDIUM_CATEGORIES:-1}"
BLOCK_MEDIUM_PLUGINIDS="${BLOCK_MEDIUM_PLUGINIDS:-}"

AUTH_COVERAGE_REGEX="${AUTH_COVERAGE_REGEX:-/api/v2/}"
MIN_FE_URLS="${MIN_FE_URLS:-10}"
MIN_BE_URLS="${MIN_BE_URLS:-10}"
FAIL_ON_LOW_URLS="${FAIL_ON_LOW_URLS:-0}"
KEEP_DAST_ENV="${KEEP_DAST_ENV:-0}"
DEBUG_DAST="${DEBUG_DAST:-0}"

ADMIN_USER_VALUE="${ADMIN_USER:-admin}"
DB_USER_VALUE="${DB_USER:-postgres}"
DB_NAME_VALUE="${DB_NAME:-prescriptions_db}"
ADMIN_PASS_VALUE="${ADMIN_PASS:-$(random_hex 16)}"
DB_PASS_VALUE="${DB_PASS:-$(random_hex 16)}"
JWT_SECRET_VALUE="${JWT_SECRET:-$(random_hex 32)}"
DATA_ENCRYPTION_KEY_VALUE="${DATA_ENCRYPTION_KEY:-$(random_hex 32)}"
ZAP_LOGIN_EMAIL="${ZAP_LOGIN_EMAIL:-zap-local@example.test}"
ZAP_LOGIN_PASSWORD="${ZAP_LOGIN_PASSWORD:-$(random_hex 18)}"
for secret_var in ADMIN_PASS_VALUE DB_PASS_VALUE JWT_SECRET_VALUE DATA_ENCRYPTION_KEY_VALUE ZAP_LOGIN_PASSWORD; do  
  if [[ -z "${!secret_var:-}" ]]; then  
    echo "::error::Failed to generate secret for ${secret_var}" >&2  
    exit 1  
  fi  
done

SECRETS_PATH="${SECRETS_PATH:-$(mktemp -d /tmp/zap-local-secrets.XXXXXX)}"
STAGED_CONTEXT_DIR="${STAGED_CONTEXT_DIR:-$(mktemp -d /tmp/zap-context.XXXXXX)}"
OUT_DIR="${APP_DIR}/zap-out"
DAST_ENV_FILE="${DAST_ENV_FILE:-${APP_DIR}/.env.zap.local}"
# COMPOSE_NETWORK="${COMPOSE_PROJECT_NAME}_app_network"
FE_FILE="${OUT_DIR}/zap-frontend.json"
BE_FILE="${OUT_DIR}/zap-backend.json"
SUMMARY_FILE="${OUT_DIR}/summary.md"
CONTEXT_ARTIFACT_FILE="${OUT_DIR}/context.context"
STAGED_CONTEXT_FILE="${STAGED_CONTEXT_DIR}/context.context"

cleanup() {
  local exit_code=$?

  if [[ "${KEEP_DAST_ENV}" != "1" ]]; then
    docker compose --env-file "$DAST_ENV_FILE" -p "$COMPOSE_PROJECT_NAME" -f "${APP_DIR}/docker-compose.yml" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$SECRETS_PATH"
    rm -rf "$STAGED_CONTEXT_DIR"
    rm -f "$DAST_ENV_FILE"
  else
    echo "Keeping compose environment and secrets for inspection."
    echo "Compose project: ${COMPOSE_PROJECT_NAME}"
    echo "Secrets path: ${SECRETS_PATH}"
    echo "Staged context dir: ${STAGED_CONTEXT_DIR}"
    echo "Env file: ${DAST_ENV_FILE}"
  fi

  rm -f "${OUT_DIR}/zap-auth-header.txt" || true
  exit "$exit_code"
}

trap cleanup EXIT

compose() {
  docker compose --env-file "$DAST_ENV_FILE" -p "$COMPOSE_PROJECT_NAME" -f "${APP_DIR}/docker-compose.yml" "$@"
}

assert_host_port_available() {
  local port="$1"
  local label="$2"

  python3 - "$port" "$label" <<'PY'
import socket
import sys

port = int(sys.argv[1])
label = sys.argv[2]

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("0.0.0.0", port))
except OSError:
    print(f"::error::{label} host port {port} is already in use. Stop the conflicting service or free the port before running local DAST.", file=sys.stderr)
    sys.exit(1)
finally:
    sock.close()
PY
}

validate_context_file() {
  local file="$1"

  test -f "$file" || {
    echo "::error::Missing context file $file"
    exit 1
  }

  test -s "$file" || {
    echo "::error::Context file is empty: $file"
    exit 1
  }

  [[ "$(sed -n '1p' "$file")" == "context" ]] || {
    echo "::error::Context file is invalid (missing leading \"context\" stanza): $file"
    exit 1
  }

  grep -q '^  includeInContextRegexes=' "$file" || {
    echo "::error::Context file is invalid (missing includeInContextRegexes): $file"
    exit 1
  }

  grep -q '^  excludeFromContextRegexes=' "$file" || {
    echo "::error::Context file is invalid (missing excludeFromContextRegexes): $file"
    exit 1
  }
}

stage_context_file() {
  mkdir -p "$STAGED_CONTEXT_DIR"
  cp "$ZAP_CONTEXT_FILE" "$STAGED_CONTEXT_FILE"
  cp "$ZAP_CONTEXT_FILE" "$CONTEXT_ARTIFACT_FILE"
  chmod 644 "$STAGED_CONTEXT_FILE"
  chmod 644 "$CONTEXT_ARTIFACT_FILE"
  validate_context_file "$STAGED_CONTEXT_FILE"
  validate_context_file "$CONTEXT_ARTIFACT_FILE"
}

count_urls() {
  local file="$1"
  jq '[.site[]? | .alerts[]? | (.instances? // []) | .[]? | (.uri? // .url? // empty)] | map(select(. != "")) | unique | length' "$file"
}

count_alerts() {
  local file="$1"
  local risk="$2"
  local min_conf="$3"
  jq --arg r "$risk" --arg mc "$min_conf" '
    def confRank(c): if (c|ascii_downcase) == "high" then 3 elif (c|ascii_downcase) == "medium" then 2 elif (c|ascii_downcase) == "low" then 1 else 0 end;
    def minRank(mc): if (mc|ascii_downcase) == "high" then 3 elif (mc|ascii_downcase) == "medium" then 2 elif (mc|ascii_downcase) == "low" then 1 else 0 end;
    [ .site[]? | .alerts[]? | select((.riskcode|tostring) == $r) | select(confRank(.confidence // "") >= minRank($mc)) ] | length
  ' "$file"
}

coverage_matches() {
  local file="$1"
  jq --arg re "$AUTH_COVERAGE_REGEX" '
    def uris:
      [ .site[]?
        | .alerts[]?
        | (.instances? // [])
        | .[]?
        | (.uri? // .url? // empty)
      ];
    uris | map(select(. != "" and test($re))) | length
  ' "$file"
}

medium_pattern() {
  awk '
    BEGIN { ORS=""; first=1 }
    {
      line=$0
      sub(/^[ \t\r\n]+/, "", line)
      sub(/[ \t\r\n]+$/, "", line)
      if (line == "" || line ~ /^#/) next
      if (!first) printf "|"
      printf "%s", line
      first=0
    }
  ' "$MEDIUM_BLOCK_PATTERNS_FILE"
}

medium_block_count() {
  local file="$1"
  local pattern="$2"
  jq --arg re "$pattern" --arg pids "$BLOCK_MEDIUM_PLUGINIDS" '
    def confRank(c): if (c|ascii_downcase) == "high" then 3 elif (c|ascii_downcase) == "medium" then 2 elif (c|ascii_downcase) == "low" then 1 else 0 end;
    def pidAllowed(pid):
      if ($pids|length) == 0 then false
      else
        ($pids
          | split(",")
          | map(gsub("\\s+";""))
          | map(select(. != ""))
          | map(tostring)
          | index(pid|tostring)
        ) != null
      end;
    [ .site[]? | .alerts[]?
      | select((.riskcode|tostring) == "2")
      | select(confRank(.confidence // "") >= 2)
      | select(((.alert? // "") | test($re; "i")) or pidAllowed((.pluginid // .pluginId // "")|tostring))
    ] | length
  ' "$file"
}

emit_top_findings() {
  local file="$1"
  local label="$2"
  local pattern="$3"
  {
    echo "### ${label}"
    jq --arg re "$pattern" --arg pids "$BLOCK_MEDIUM_PLUGINIDS" '
      def confRank(c):
        if (c|ascii_downcase) == "high" then 3
        elif (c|ascii_downcase) == "medium" then 2
        elif (c|ascii_downcase) == "low" then 1
        else 0 end;
      def pidAllowed(pid):
        if ($pids|length) == 0 then false
        else
          ($pids
            | split(",")
            | map(gsub("\\s+";""))
            | map(select(. != ""))
            | map(tostring)
            | index(pid|tostring)
          ) != null
        end;
      [ .site[]? | .alerts[]?
        | . as $a
        | ($a.instances // []) as $ins
        | {
            alert: ($a.alert // "Unknown alert"),
            riskcode: ($a.riskcode|tostring),
            confidence: ($a.confidence // ""),
            pluginid: (($a.pluginid // $a.pluginId // "")|tostring),
            count: ($ins|length),
            sampleUrls: (($ins|map(.uri // .url)|map(select(. != null))|.[0:3]))
          }
        | select(
            (.riskcode == "3" and confRank(.confidence) >= 2)
            or
            (.riskcode == "2" and confRank(.confidence) >= 2 and ((.alert|test($re; "i")) or pidAllowed(.pluginid)))
          )
      ] | .[] | "- [plugin:\(.pluginid)] \(.alert) (risk=\(.riskcode), confidence=\(.confidence), instances=\(.count)) urls=\(.sampleUrls|join(", "))"' "$file"
  } >> "$SUMMARY_FILE"
}

assert_url_floor() {
  local label="$1"
  local count="$2"
  local min="$3"
  if (( count < min )); then
    echo "::warning::${label} scan produced too few unique URLs (${count} < ${min})."
    if [[ "$FAIL_ON_LOW_URLS" == "1" ]]; then
      echo "::error::Failing because FAIL_ON_LOW_URLS=1"
      exit 1
    fi
  fi
}

generate_sarif() {
  OUT_DIR="$OUT_DIR" python3 - <<'PY'
import json
import hashlib
import datetime
import os
from pathlib import Path

def level_from_riskcode(rc: str) -> str:
    rc = str(rc)
    if rc == "3":
        return "error"
    if rc == "2":
        return "warning"
    return "note"

def load_alerts(path: str):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [a for site in data.get("site", []) or [] for a in (site.get("alerts", []) or [])]

def collect_urls(alerts):
    urls = []
    for a in alerts:
        instances = a.get("instances") or []
        if not instances:
            uri = a.get("uri") or a.get("url")
            if uri:
                instances = [{"uri": uri}]
        for inst in instances:
            uri = inst.get("uri") or inst.get("url")
            if uri and uri.startswith(("http://", "https://")):
                urls.append(uri)
    return urls

def to_sarif(scan_name: str, json_path: str, out_path: str, url_map: dict):
    alerts = load_alerts(json_path)
    rules = {}
    results = []

    for a in alerts:
        alert = a.get("alert") or a.get("name") or "ZAP Alert"
        pluginid = str(a.get("pluginid") or a.get("pluginId") or a.get("alertRef") or "unknown")
        riskcode = str(a.get("riskcode") or a.get("risk code") or "0")
        confidence = a.get("confidence") or ""
        desc = a.get("desc") or ""
        sol = a.get("solution") or ""
        ref = a.get("reference") or ""

        rid = f"ZAP-{pluginid}"
        if rid not in rules:
            rules[rid] = {
                "id": rid,
                "name": alert,
                "shortDescription": {"text": alert},
                "fullDescription": {"text": f"{desc}\n\nSolution: {sol}\n\nReference: {ref}".strip()},
                "helpUri": "https://www.zaproxy.org/docs/alerts/",
                "properties": {
                    "tags": ["security", "dast", "owasp-zap", f"zap-plugin:{pluginid}"],
                    "confidence": confidence,
                    "pluginid": pluginid,
                },
            }

        instances = a.get("instances") or []
        if not instances:
            uri = a.get("uri") or a.get("url")
            if uri:
                instances = [{"uri": uri}]

        for inst in instances:
            uri = inst.get("uri") or inst.get("url") or "unknown"
            artifact_uri = uri
            region = None
            if uri.startswith(("http://", "https://")):
                artifact_uri = "zap-out/targets.txt"
                if uri in url_map:
                    region = {"startLine": url_map[uri]}
            evidence = inst.get("evidence") or ""
            method = inst.get("method") or ""
            param = inst.get("param") or ""

            fp_primary = hashlib.sha256(f"{rid}|{uri}|{param}|{method}".encode("utf-8")).hexdigest()
            fp_instance = hashlib.sha256(f"{pluginid}|{uri}|{evidence}".encode("utf-8")).hexdigest()

            results.append({
                "ruleId": rid,
                "level": level_from_riskcode(riskcode),
                "message": {"text": f"{alert} (confidence={confidence})"},
                "locations": [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": artifact_uri},
                        **({"region": region} if region else {}),
                    }
                }],
                "partialFingerprints": {"primaryLocationLineHash": fp_primary},
                "fingerprints": {
                    "zapPrimaryFingerprint": fp_primary,
                    "zapInstanceFingerprint": fp_instance,
                },
                "properties": {
                    "confidence": confidence,
                    "riskcode": riskcode,
                    "pluginid": pluginid,
                    "param": param,
                    "method": method,
                    "evidence": evidence,
                    "url": uri,
                    "tags": ["security", "dast", "owasp-zap", f"zap-plugin:{pluginid}"],
                }
            })

    sarif = {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "OWASP ZAP",
                    "informationUri": "https://www.zaproxy.org/",
                    "rules": list(rules.values()),
                }
            },
            "automationDetails": {"id": scan_name},
            "results": results,
            "invocations": [{
                "executionSuccessful": True,
                "startTimeUtc": datetime.datetime.utcnow().isoformat() + "Z",
            }]
        }]
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sarif, f, indent=2)

out_dir = Path(os.environ["OUT_DIR"]).resolve()
frontend_json = out_dir / "zap-frontend.json"
backend_json = out_dir / "zap-backend.json"
targets_txt = out_dir / "targets.txt"
frontend_sarif = out_dir / "zap-frontend.sarif"
backend_sarif = out_dir / "zap-backend.sarif"

all_alerts = load_alerts(str(frontend_json)) + load_alerts(str(backend_json))
urls = sorted(set(collect_urls(all_alerts)))
url_map = {}
with open(targets_txt, "w", encoding="utf-8") as f:
    for i, url in enumerate(urls, start=1):
        f.write(url + "\n")
        url_map[url] = i

to_sarif("frontend", str(frontend_json), str(frontend_sarif), url_map)
to_sarif("backend", str(backend_json), str(backend_sarif), url_map)
PY
}

github_env_set "DAST_AUTH_ASSERTION_PASSED" "0"
github_env_set "DAST_AUTH_COVERAGE_FRONTEND" "0"
github_env_set "DAST_AUTH_COVERAGE_BACKEND" "0"
github_env_set "OPENAPI_FOUND" "0"
github_env_set "HIGH_FE" "0"
github_env_set "HIGH_BE" "0"
github_env_set "MED_FE" "0"
github_env_set "MED_BE" "0"
github_env_set "MED_BLOCK_FE" "0"
github_env_set "MED_BLOCK_BE" "0"

mkdir -p "$(dirname "$DAST_ENV_FILE")"
mkdir -p "$SECRETS_PATH"
mkdir -p "$OUT_DIR"
chmod 777  "$OUT_DIR" # chmod -R u+rwX,go+rX "$OUT_DIR"

validate_context_file "$ZAP_CONTEXT_FILE"
test -f "$ZAP_RULES_FILE" || { echo "::error::Missing rules file $ZAP_RULES_FILE"; exit 1; }
test -f "$MEDIUM_BLOCK_PATTERNS_FILE" || { echo "::error::Missing medium block patterns file $MEDIUM_BLOCK_PATTERNS_FILE"; exit 1; }
stage_context_file
assert_host_port_available 4173 "Frontend"
assert_host_port_available 8443 "Frontend TLS"
assert_host_port_available 8080 "Backend"

cat > "$DAST_ENV_FILE" <<EOF
ADMIN_USER=${ADMIN_USER_VALUE}
ADMIN_PASS=${ADMIN_PASS_VALUE}
DB_USER=${DB_USER_VALUE}
DB_NAME=${DB_NAME_VALUE}
DB_PASS=${DB_PASS_VALUE}
JWT_SECRET=${JWT_SECRET_VALUE}
DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY_VALUE}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
SECRETS_PATH=${SECRETS_PATH}
SEED_ADMIN_EMAIL=${ZAP_LOGIN_EMAIL}
SEED_DEFAULT_PASSWORD=${ZAP_LOGIN_PASSWORD}
EOF
chmod 644 "$DAST_ENV_FILE"

printf "%s" "$JWT_SECRET_VALUE" > "${SECRETS_PATH}/jwt_secret.txt"
printf "%s" "$ADMIN_PASS_VALUE" > "${SECRETS_PATH}/admin_pass.txt"
printf "%s" "$DB_PASS_VALUE" > "${SECRETS_PATH}/db_pass.txt"
printf "%s" "$DATA_ENCRYPTION_KEY_VALUE" > "${SECRETS_PATH}/data_encryption_key.txt"
chmod 644 "${SECRETS_PATH}"/*.txt

log_mask "$ADMIN_PASS_VALUE"
log_mask "$DB_PASS_VALUE"
log_mask "$JWT_SECRET_VALUE"
log_mask "$DATA_ENCRYPTION_KEY_VALUE"
log_mask "$ZAP_LOGIN_EMAIL"
log_mask "$ZAP_LOGIN_PASSWORD"

github_env_set "SECRETS_PATH" "$SECRETS_PATH"
github_env_set "COMPOSE_NETWORK" "$COMPOSE_NETWORK"

echo "Starting compose environment: ${COMPOSE_PROJECT_NAME}"
compose up -d --build

if ! docker network inspect "$COMPOSE_NETWORK" >/dev/null 2>&1; then
  echo "::error::Could not determine compose network for project ${COMPOSE_PROJECT_NAME}"
  compose ps || true
  exit 1
fi

compose exec -T -e DB_PASS="$DB_PASS_VALUE" backend node ./node_modules/knex/bin/cli.js migrate:latest --knexfile src/config/knexfile.js
compose exec -T -e DB_PASS="$DB_PASS_VALUE" backend node ./node_modules/knex/bin/cli.js seed:run --knexfile src/config/knexfile.js

compose exec -T \
  -e DB_PASS="$DB_PASS_VALUE" \
  -e DAST_EMAIL="$ZAP_LOGIN_EMAIL" \
  -e DAST_PASSWORD="$ZAP_LOGIN_PASSWORD" \
  backend node - <<'NODE'
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('./src/infra/db/knex');

const email = String(process.env.DAST_EMAIL || '').trim().toLowerCase();
const password = String(process.env.DAST_PASSWORD || '');

if (!email || !password) {
  throw new Error('Missing DAST_EMAIL and/or DAST_PASSWORD for auth user bootstrap');
}

(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.withSchema('v2').from('users').where({ email }).first();

  if (existing) {
    await db
      .withSchema('v2')
      .from('users')
      .where({ id: existing.id })
      .update({
        password_hash: passwordHash,
        role: 'admin',
        mfa_enabled: false,
      });
  } else {
    await db.withSchema('v2').from('users').insert({
      id: randomUUID(),
      email,
      password_hash: passwordHash,
      role: 'admin',
      mfa_enabled: false,
    });
  }

  await db.destroy();
  console.log('DAST auth user upserted');
})().catch(async (err) => {
  console.error(err);
  try { await db.destroy(); } catch {}
  process.exit(1);
});
NODE

timeout "${HEALTH_TIMEOUT}s" bash -c "until curl -fsS \"${RUNNER_BACKEND_URL}/health\" >/dev/null; do sleep 5; done"
timeout "${HEALTH_TIMEOUT}s" bash -c "until curl -fsS \"${RUNNER_FRONTEND_URL}/health\" >/dev/null; do sleep 5; done"
timeout "${HEALTH_TIMEOUT}s" bash -c "until curl -fsS \"${RUNNER_FRONTEND_URL}/\" | head -n 3 | grep -qi '<!doctype'; do sleep 5; done" || true

awk '
  BEGIN { OFS="\t" }
  /^[[:space:]]*($|#)/ { next }
  {
    plugin=$1; action=toupper($2); threshold=toupper($3);
    if (plugin == "" || action == "" || threshold == "") next;
    if (action !~ /^(IGNORE|WARN|FAIL)$/) next;
    if (threshold !~ /^(OFF|LOW|MEDIUM|HIGH)$/) next;
    print plugin, action, threshold;
  }
' "$ZAP_RULES_FILE" > "${OUT_DIR}/rules.tsv"

if [[ ! -s "${OUT_DIR}/rules.tsv" ]]; then
  echo "::error::Normalized rules file is empty or invalid (${OUT_DIR}/rules.tsv)."
  exit 1
fi

if [[ "$DEBUG_DAST" == "1" ]]; then
  echo "Context include:"
  grep -E '^ *includeInContextRegexes=' -n "$STAGED_CONTEXT_FILE" || true
  echo "Context exclude:"
  grep -E '^ *excludeFromContextRegexes=' -n "$STAGED_CONTEXT_FILE" || true
fi

LOGIN_URL="${RUNNER_BACKEND_URL%/}/api/v2/auth/login"
AUTH_VERIFY_URL="${RUNNER_BACKEND_URL%/}/api/v2/auth/mfa/status"
LOGIN_PAYLOAD="$(jq -cn --arg email "$ZAP_LOGIN_EMAIL" --arg password "$ZAP_LOGIN_PASSWORD" '{email:$email,password:$password}')"

AUTH_HTTP_CODE=""
RESP=""
for attempt in 1 2 3 4 5; do
  RESP="$(curl -sS --connect-timeout 5 --max-time 20 -X POST "${LOGIN_URL}" -H "Content-Type: application/json" --data "$LOGIN_PAYLOAD" -w $'\n%{http_code}')"
  AUTH_HTTP_CODE="$(printf '%s' "$RESP" | tail -n 1)"
  RESP="$(printf '%s' "$RESP" | sed '$d')"

  if [[ "$AUTH_HTTP_CODE" == "200" ]]; then
    break
  fi

  if [[ "$AUTH_HTTP_CODE" =~ ^[0-9]+$ ]] && (( AUTH_HTTP_CODE >= 500 )); then
    echo "::warning::Auth bootstrap returned HTTP ${AUTH_HTTP_CODE} (attempt ${attempt}/5). Retrying..."
    sleep 3
    continue
  fi

  break
done

if [[ "$AUTH_HTTP_CODE" != "200" ]]; then
  echo "::error::Auth bootstrap failed with HTTP ${AUTH_HTTP_CODE}."
  echo "$RESP" | jq -c '{error, message, code, details}' 2>/dev/null || true
  compose logs --no-color --tail=200 backend || true
  exit 1
fi

if [[ "$(echo "$RESP" | jq -r '.mfaRequired // false' || true)" == "true" ]]; then
  echo "::error::MFA is enabled for this user. Use a non-MFA account for DAST."
  exit 1
fi

ZAP_AUTH_TOKEN="$(echo "$RESP" | jq -r '.accessToken // .token // empty' || true)"
if [[ -z "$ZAP_AUTH_TOKEN" ]]; then
  echo "::error::Could not acquire JWT. Response redacted; check backend logs."
  echo "$RESP" | jq -c '{mfaRequired, error, message}' || true
  compose logs --no-color --tail=200 backend || true
  exit 1
fi

log_mask "$ZAP_AUTH_TOKEN"
github_env_set "ZAP_AUTH_TOKEN" "$ZAP_AUTH_TOKEN"
curl -fsS --connect-timeout 5 --max-time 20 -o /dev/null -H "Authorization: Bearer ${ZAP_AUTH_TOKEN}" "${AUTH_VERIFY_URL}"
github_env_set "DAST_AUTH_ASSERTION_PASSED" "1"
echo "Auth verification passed"

if [[ "$DEBUG_DAST" == "1" ]]; then
  printf "%s\n" "Authorization: Bearer ${ZAP_AUTH_TOKEN}" > "${OUT_DIR}/zap-auth-header.txt"
  chmod 600 "${OUT_DIR}/zap-auth-header.txt"
fi

set +e
docker run --rm \
  --network "$COMPOSE_NETWORK" \
  --user root \
  -v "${OUT_DIR}:/zap/wrk/:rw" \
  -v "${STAGED_CONTEXT_FILE}:/zap/wrk/context.context:ro" \
  -v "${OUT_DIR}/rules.tsv:/zap/wrk/rules.tsv:ro" \
  "${ZAP_IMG}" zap-full-scan.py \
  -t "$ZAP_FRONTEND_URL" \
  -n /zap/wrk/context.context \
  -c /zap/wrk/rules.tsv \
  -m "$ZAP_SPIDER_MINS" \
  -T "$ZAP_STARTUP_TIMEOUT_MINS" \
  -D "$ZAP_PASSIVE_WAIT_SECS" \
  -j \
  -r zap-frontend.html \
  -J zap-frontend.json \
  -I \
  -z "-config replacer.full_list(0).description=authheader" \
  -z "-config replacer.full_list(0).enabled=true" \
  -z "-config replacer.full_list(0).matchtype=REQ_HEADER" \
  -z "-config replacer.full_list(0).matchstr=Authorization" \
  -z "-config replacer.full_list(0).regex=false" \
  -z "-config replacer.full_list(0).replacement=Bearer ${ZAP_AUTH_TOKEN}"
ZAP_EXIT_FRONTEND="$?"
set -e

if [[ "$ZAP_EXIT_FRONTEND" -ne 0 ]]; then
  echo "::warning::ZAP frontend exited with code ${ZAP_EXIT_FRONTEND}. Reports may be partial."
fi

github_env_set "ZAP_EXIT_FRONTEND" "$ZAP_EXIT_FRONTEND"
validate_context_file "$STAGED_CONTEXT_FILE"
validate_context_file "$CONTEXT_ARTIFACT_FILE"
test -s "$FE_FILE" || { echo "::error::ZAP FE json missing/empty"; exit 1; }
jq -e 'type=="object"' "$FE_FILE" >/dev/null

FE_URLS="$(count_urls "$FE_FILE")"
github_env_set "ZAP_FRONTEND_UNIQUE_URLS" "$FE_URLS"
assert_url_floor "Frontend" "$FE_URLS" "$MIN_FE_URLS"

FE_MATCHES="$(coverage_matches "$FE_FILE")"
if [[ "$FE_MATCHES" -gt 0 ]]; then
  github_env_set "DAST_AUTH_COVERAGE_FRONTEND" "1"
else
  echo "::warning::No authenticated coverage match found in frontend scan for regex=${AUTH_COVERAGE_REGEX}"
fi

SRC="${APP_DIR}/server/src/docs/openapi.yaml"
OUT="${OUT_DIR}/openapi.yaml"
test -f "$SRC" || { echo "::error::Missing OpenAPI spec at $SRC"; exit 1; }
SRC="$SRC" OUT="$OUT" ZAP_BACKEND_URL="$ZAP_BACKEND_URL" python3 - <<'PY'
import os
import re

src = os.environ["SRC"]
out = os.environ["OUT"]
backend = os.environ["ZAP_BACKEND_URL"]

with open(src, "r", encoding="utf-8") as f:
    text = f.read()

new_block = f"servers:\n  - url: {backend}\n"
pattern = re.compile(r"^servers:\n(?:^[ \t]+-.*\n)+", re.M)
if pattern.search(text):
    text = pattern.sub(new_block, text, count=1)
else:
    text = new_block + "\n" + text

with open(out, "w", encoding="utf-8") as f:
    f.write(text)

if not text.strip():
    raise SystemExit("rewritten openapi.yaml is empty")
PY

python3 -c 'import pathlib; p=pathlib.Path("'"${OUT_DIR}"'/openapi.yaml"); assert p.exists() and p.stat().st_size > 0'
if ! grep -qE '^[[:space:]]*paths:[[:space:]]*$' "$OUT"; then
  echo "::error::OpenAPI rewrite produced no paths: section"
  exit 1
fi
ENDPOINT_COUNT="$(grep -E '^[[:space:]]*/[^[:space:]]*:[[:space:]]*$' -c "$OUT" || true)"
if [[ "$ENDPOINT_COUNT" -eq 0 ]]; then
  echo "::error::OpenAPI rewrite produced zero endpoints under paths:"
  exit 1
fi
github_env_set "OPENAPI_FOUND" "1"
github_env_set "OPENAPI_FILE" "zap-out/openapi.yaml"

set +e
docker run --rm \
  --network "$COMPOSE_NETWORK" \
  --user root \
  -v "${OUT_DIR}:/zap/wrk/:rw" \
  -v "${OUT_DIR}/openapi.yaml:/zap/wrk/openapi.yaml:ro" \
  -v "${OUT_DIR}/rules.tsv:/zap/wrk/rules.tsv:ro" \
  "${ZAP_IMG}" zap-api-scan.py \
  -t /zap/wrk/openapi.yaml \
  -f openapi \
  -r zap-backend.html \
  -J zap-backend.json \
  -c /zap/wrk/rules.tsv \
  -I \
  -z "-config replacer.full_list(0).description=authheader" \
  -z "-config replacer.full_list(0).enabled=true" \
  -z "-config replacer.full_list(0).matchtype=REQ_HEADER" \
  -z "-config replacer.full_list(0).matchstr=Authorization" \
  -z "-config replacer.full_list(0).regex=false" \
  -z "-config replacer.full_list(0).replacement=Bearer ${ZAP_AUTH_TOKEN}"
ZAP_EXIT_BACKEND="$?"
set -e

if [[ "$ZAP_EXIT_BACKEND" -ne 0 ]]; then
  echo "::warning::ZAP backend exited with code ${ZAP_EXIT_BACKEND}. Reports may be partial."
fi

github_env_set "ZAP_EXIT_BACKEND" "$ZAP_EXIT_BACKEND"
test -s "$BE_FILE" || { echo "::error::ZAP BE json missing/empty"; exit 1; }
jq -e 'type=="object"' "$BE_FILE" >/dev/null

BE_URLS="$(count_urls "$BE_FILE")"
github_env_set "ZAP_BACKEND_UNIQUE_URLS" "$BE_URLS"
assert_url_floor "Backend" "$BE_URLS" "$MIN_BE_URLS"

BE_MATCHES="$(coverage_matches "$BE_FILE")"
if [[ "$BE_MATCHES" -gt 0 ]]; then
  github_env_set "DAST_AUTH_COVERAGE_BACKEND" "1"
else
  echo "::warning::No authenticated coverage match found in backend scan for regex=${AUTH_COVERAGE_REGEX}"
fi

MEDIUM_PATTERN="$(medium_pattern)"
if [[ -z "$MEDIUM_PATTERN" ]]; then
  echo "::error::Medium block patterns file produced an empty pattern. Check ${MEDIUM_BLOCK_PATTERNS_FILE}."
  exit 1
fi
github_env_set "MEDIUM_BLOCK_PATTERNS" "$MEDIUM_PATTERN"

HIGH_FE="$(count_alerts "$FE_FILE" "3" "medium")"
HIGH_BE="$(count_alerts "$BE_FILE" "3" "medium")"
MED_FE="$(count_alerts "$FE_FILE" "2" "low")"
MED_BE="$(count_alerts "$BE_FILE" "2" "low")"
MED_BLOCK_FE="$(medium_block_count "$FE_FILE" "$MEDIUM_PATTERN")"
MED_BLOCK_BE="$(medium_block_count "$BE_FILE" "$MEDIUM_PATTERN")"

github_env_set "HIGH_FE" "$HIGH_FE"
github_env_set "HIGH_BE" "$HIGH_BE"
github_env_set "MED_FE" "$MED_FE"
github_env_set "MED_BE" "$MED_BE"
github_env_set "MED_BLOCK_FE" "$MED_BLOCK_FE"
github_env_set "MED_BLOCK_BE" "$MED_BLOCK_BE"

{
  echo "# DAST Weekly Summary"
  echo ""
  echo "## Scan status"
  echo "- ZAP_EXIT_FRONTEND: ${ZAP_EXIT_FRONTEND}"
  echo "- ZAP_EXIT_BACKEND: ${ZAP_EXIT_BACKEND}"
  echo ""
  echo "## Counts"
  echo "| Target | High (conf>=Medium) | Medium |"
  echo "|---|---:|---:|"
  echo "| Frontend | ${HIGH_FE} | ${MED_FE} |"
  echo "| Backend | ${HIGH_BE} | ${MED_BE} |"
  echo ""
  echo "## Authenticated coverage"
  echo "- Auth verification passed: ${DAST_AUTH_ASSERTION_PASSED:-0}"
  echo "- Frontend authenticated coverage: ${DAST_AUTH_COVERAGE_FRONTEND:-0}"
  echo "- Backend authenticated coverage: ${DAST_AUTH_COVERAGE_BACKEND:-0}"
  echo ""
  echo "## Top Findings (gate-relevant)"
} > "$SUMMARY_FILE"
emit_top_findings "$FE_FILE" "Frontend" "$MEDIUM_PATTERN"
emit_top_findings "$BE_FILE" "Backend" "$MEDIUM_PATTERN"

generate_sarif

echo "ZAP outputs written to ${OUT_DIR}"
echo "Frontend report: ${OUT_DIR}/zap-frontend.html"
echo "Backend report: ${OUT_DIR}/zap-backend.html"

if [[ "$BLOCK_HIGH" == "1" ]] && (( HIGH_FE > 0 || HIGH_BE > 0 )); then
  jq -r '.site[]?.alerts[]? | select((.riskcode|tostring)=="3" and ((.confidence|ascii_downcase)=="high" or (.confidence|ascii_downcase)=="medium")) | "::error::Gate blocker plugin=\((.pluginid // .pluginId // "")|tostring) alert=\(.alert // "") confidence=\(.confidence // "") url=\((((.instances // [])[0].uri) // (((.instances // [])[0].url)) // "n/a"))"' "$FE_FILE" "$BE_FILE" || true
  echo "::error::DAST gate failed: High vulnerabilities (confidence>=Medium) found (FE=${HIGH_FE}, BE=${HIGH_BE})"
  exit 1
fi

if [[ "$BLOCK_MEDIUM_CATEGORIES" == "1" ]] && (( MED_BLOCK_FE > 0 || MED_BLOCK_BE > 0 )); then
  echo "::error::DAST gate failed: Selected Medium categories (confidence>=Medium) found (FE=${MED_BLOCK_FE}, BE=${MED_BLOCK_BE})"
  exit 1
fi

echo "DAST gate passed."
