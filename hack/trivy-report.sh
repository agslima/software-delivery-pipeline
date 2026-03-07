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

if ! command -v trivy >/dev/null 2>&1; then
  echo "Installing Trivy..."
  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /tmp/trivy-bin v0.48.3
  export PATH="/tmp/trivy-bin:$PATH"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed." >&2
  exit 1
fi

echo "Running Trivy scans for app/..."
trivy fs app --format json --output "$FS_REPORT" --scanners vuln || true
trivy config app --format json --output "$CONFIG_REPORT" || true

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
    in_block = 0
    found_operational = 0
    found_verification = 0
  }

  /^## Operational Evidence$/ {
    print
    print ""
    while ((getline line < table_file) > 0) {
      print line
    }
    close(table_file)
    print ""
    in_block = 1
    found_operational = 1
    next
  }

  /^## Verification \(How to Audit\)$/ {
    in_block = 0
    found_verification = 1
    print
    next
  }

  !in_block { print }

  END {
    if (!found_operational || !found_verification) {
      print "Required README section headers not found." > "/dev/stderr"
      exit 1
    }
  }
' "$README_FILE" > "${README_FILE}.tmp"

mv "${README_FILE}.tmp" "$README_FILE"
echo "${README_FILE} updated successfully."
