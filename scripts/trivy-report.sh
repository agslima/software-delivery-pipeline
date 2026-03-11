#!/usr/bin/env bash

set -euo pipefail

readonly FS_REPORT="/tmp/trivy-fs.json"
readonly CONFIG_REPORT="/tmp/trivy-config.json"
readonly TABLE_FILE="/tmp/trivy-table.md"
OUTPUT_FILE="${OUTPUT_FILE:-/tmp/trivy-security-posture.md}"

TRIVY_VERSION="${TRIVY_VERSION:-v0.69.3}"

if ! command -v trivy >/dev/null 2>&1; then
  echo "Installing Trivy ${TRIVY_VERSION}..."
  curl --fail --silent --show-error --location \
    --proto "=https" --proto-redir "=https" \
    "https://raw.githubusercontent.com/aquasecurity/trivy/${TRIVY_VERSION}/contrib/install.sh" \
    | sh -s -- -b /tmp/trivy-bin "${TRIVY_VERSION}"
  export PATH="/tmp/trivy-bin:$PATH"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed." >&2
  exit 1
fi

validate_json_report() {
  local report_file="$1"
  local label="$2"

  if [[ ! -s "$report_file" ]]; then
    echo "Error: ${label} report was not created or is empty: ${report_file}" >&2
    exit 1
  fi

  if ! jq empty "$report_file" >/dev/null 2>&1; then
    echo "Error: ${label} report is not valid JSON: ${report_file}" >&2
    exit 1
  fi
}

run_trivy_scan() {
  local label="$1"
  local report_file="$2"
  shift 2

  local stderr_file
  stderr_file="$(mktemp)"

  echo "Running ${label} scan..."
  local exit_code=0
  if trivy "$@" --format json --output "$report_file" 2>"$stderr_file"; then
    :
  else
    exit_code=$?
    echo "Error: ${label} scan failed (exit code: ${exit_code})." >&2
    if [[ -s "$stderr_file" ]]; then
      echo "Trivy stderr (${label}):" >&2
      sed "s/^/  /" "$stderr_file" >&2
    fi
    rm -f "$stderr_file"
    exit "$exit_code"
  fi

  if [[ -s "$stderr_file" ]]; then
    echo "Trivy stderr (${label}):" >&2
    sed "s/^/  /" "$stderr_file" >&2
  fi

  rm -f "$stderr_file"
  validate_json_report "$report_file" "$label"
}

echo "Running Trivy scans for app/..."
run_trivy_scan "filesystem vulnerabilities" "$FS_REPORT" fs app --scanners vuln
run_trivy_scan "configuration" "$CONFIG_REPORT" config app

# get_count counts vulnerabilities or misconfigurations of the specified severity in a Trivy JSON report file and echoes the numeric count (prints `0` if the file is missing or cannot be parsed).
get_count() {
  local file="$1"
  local severity="$2"

  jq "[
    .Results[]? |
    (
      .Vulnerabilities[]? //
      .Misconfigurations[]?
    ) |
    select(.Severity == \"${severity}\")
  ] | length" "$file" 2>/dev/null || echo "0"
}

FS_CRIT="$(get_count "$FS_REPORT" "CRITICAL")"
FS_HIGH="$(get_count "$FS_REPORT" "HIGH")"
FS_MED="$(get_count "$FS_REPORT" "MEDIUM")"
FS_LOW="$(get_count "$FS_REPORT" "LOW")"

CFG_CRIT="$(get_count "$CONFIG_REPORT" "CRITICAL")"
CFG_HIGH="$(get_count "$CONFIG_REPORT" "HIGH")"
CFG_MED="$(get_count "$CONFIG_REPORT" "MEDIUM")"
CFG_LOW="$(get_count "$CONFIG_REPORT" "LOW")"

cat > "$TABLE_FILE" <<EOF_TABLE
### Automated Trivy Security Posture (app/)

This section is automatically refreshed by CI to provide governance evidence of the current vulnerability and configuration risk posture for the application surface in \
\`app/\`.

| Scan Target | Critical | High | Medium | Low |
| :--- | :---: | :---: | :---: | :---: |
| **Application Dependencies** (\`trivy fs app\`) | $FS_CRIT | $FS_HIGH | $FS_MED | $FS_LOW |
| **Application Configuration** (\`trivy config app\`) | $CFG_CRIT | $CFG_HIGH | $CFG_MED | $CFG_LOW |

*Last scanned (UTC): $(date -u +"%Y-%m-%d %H:%M")*
EOF_TABLE

cp "$TABLE_FILE" "$OUTPUT_FILE"
echo "Trivy posture report written to ${OUTPUT_FILE}."
