#!/usr/bin/env bash

set -euo pipefail

readonly FS_REPORT="/tmp/trivy-fs.json"
readonly CONFIG_REPORT="/tmp/trivy-config.json"
readonly TABLE_FILE="/tmp/trivy-table.md"

README_FILE="README.md"
if [[ ! -f "$README_FILE" && -f "readme.md" ]]; then
  README_FILE="readme.md"
fi

if [[ ! -f "$README_FILE" ]]; then
  echo "README file not found (checked README.md and readme.md)." >&2
  exit 1
fi

TRIVY_VERSION="${TRIVY_VERSION:-v0.69.3}"

if ! command -v trivy >/dev/null 2>&1; then
  echo "Installing Trivy ${TRIVY_VERSION}..."
  curl -sfL "https://raw.githubusercontent.com/aquasecurity/trivy/${TRIVY_VERSION}/contrib/install.sh" \
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

echo "Injecting report into ${README_FILE}..."
awk -v table_file="$TABLE_FILE" '
  BEGIN {
    in_operational = 0
    found_operational = 0
    found_verification = 0
    found_begin_marker = 0
    found_end_marker = 0
  }

  /^## Operational Evidence$/ {
    in_operational = 1
    found_operational = 1
    print
    next
  }

  /^## Verification \(How to Audit\)$/ {
    if (in_operational && !found_end_marker) {
      print "Generated table end marker not found before verification section." > "/dev/stderr"
      exit 1
    }

    in_operational = 0
    found_verification = 1
    print
    next
  }

  {
    if (in_operational && /^<!-- \[BEGIN_GENERATED_TABLE\] -->$/) {
      found_begin_marker = 1
      print
      while ((getline line < table_file) > 0) {
        print line
      }
      close(table_file)
      next
    }

    if (in_operational && /^<!-- \[END_GENERATED_TABLE\] -->$/) {
      found_end_marker = 1
      print
      next
    }

    if (in_operational && found_begin_marker && !found_end_marker) {
      next
    }

    print
  }

  END {
    if (!found_operational || !found_verification) {
      print "Required README section headers not found." > "/dev/stderr"
      exit 1
    }

    if (!found_begin_marker || !found_end_marker) {
      print "Required generated table markers not found in Operational Evidence section." > "/dev/stderr"
      exit 1
    }
  }
' "$README_FILE" > "${README_FILE}.tmp"

mv "${README_FILE}.tmp" "$README_FILE"
echo "${README_FILE} updated successfully."
