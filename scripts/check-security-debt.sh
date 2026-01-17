#!/usr/bin/env bash
set -euo pipefail

RESULTS_FILE="${1:-}"
DEBT_FILE="docs/security-debt.md"
IGNORE_FILE=".trivyignore"

if [[ -z "$RESULTS_FILE" ]]; then
  echo "::error::No results file provided. Usage: $0 <trivy-json>"
  exit 2
fi

if [[ ! -s "$RESULTS_FILE" ]]; then
  echo "::error::Trivy results file missing or empty: $RESULTS_FILE"
  exit 2
fi

if [[ ! -f "$DEBT_FILE" ]]; then
  echo "::error::Missing debt registry file: $DEBT_FILE"
  exit 2
fi

# Must be Trivy native JSON
if ! jq -e '.Results? | type == "array"' "$RESULTS_FILE" >/dev/null; then
  echo "::error::Input does not look like Trivy JSON (missing .Results array)."
  exit 2
fi

TODAY="$(date -u +%F)"

echo "🔍 Governance check for MEDIUM/LOW vulnerabilities (date: $TODAY)"
echo "📄 Trivy JSON: $RESULTS_FILE"
echo "📄 Debt registry: $DEBT_FILE"
echo "📄 Allowlist: ${IGNORE_FILE:-<none>}"

# Extract MEDIUM/LOW CVEs found by Trivy (unique)
# Handles null Vulnerabilities safely.
mapfile -t FOUND_CVES < <(
  jq -r '
    [.Results[]? | (.Vulnerabilities // [])[] |
      select(.Severity=="MEDIUM" or .Severity=="LOW") |
      .VulnerabilityID // empty
    ] | unique | .[]
  ' "$RESULTS_FILE"
)

if [[ "${#FOUND_CVES[@]}" -eq 0 ]]; then
  echo "✅ No MEDIUM/LOW vulnerabilities found."
  exit 0
fi

echo "📊 Found ${#FOUND_CVES[@]} MEDIUM/LOW CVE(s):"
printf ' - %s\n' "${FOUND_CVES[@]}"

# ---------------------------
# Helpers
# ---------------------------

# Return 0 if CVE exists in Active Debt table and is not expired.
is_cve_accepted_in_registry() {
  local cve="$1"

  # Extract the Active Debt table section only (between headers)
  # Then check for a row containing the CVE and an expiry date >= TODAY.
  # Assume markdown row includes expiry column.
  awk '
    BEGIN{in=0}
    /^## Active Debt/{in=1; next}
    /^## Resolved Debt/{in=0}
    in{print}
  ' "$DEBT_FILE" | grep -F "| $cve " >/dev/null || return 1

  # Pull expiry column for that row; expiry is column 10 (1-indexed columns split by '|')
  local expiry
  expiry="$(awk -v cve="$cve" -F'\\|' '
    BEGIN{found=0}
    {
      gsub(/^[ \t]+|[ \t]+$/, "", $0)
      # Row match: "| CVE-... |"
      if ($0 ~ "\\|[[:space:]]*"cve"[[:space:]]*\\|") {
        # Column 10 is "Expires" in our template:
        # |1|2|3|4|5|6|7|8|9|10|...
        expiry=$11
        gsub(/^[ \t]+|[ \t]+$/, "", expiry)
        print expiry
        exit
      }
    }
  ' "$DEBT_FILE")"

  if [[ -z "$expiry" ]]; then
    return 1
  fi

  # Basic YYYY-MM-DD check
  if ! [[ "$expiry" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "::error::Debt registry entry for $cve has invalid expiry date: '$expiry'"
    return 2
  fi

  # Expiry must be >= today
  if [[ "$expiry" < "$TODAY" ]]; then
    echo "::error::Debt registry entry for $cve is EXPIRED (expires: $expiry, today: $TODAY)"
    return 2
  fi

  return 0
}

# Return 0 if CVE exists in .trivyignore AND has allow-until >= TODAY
is_cve_allowed_in_ignore() {
  local cve="$1"
  [[ -f "$IGNORE_FILE" ]] || return 1

  # Find line number of CVE
  local line
  line="$(grep -n -E "^[[:space:]]*${cve}[[:space:]]*$" "$IGNORE_FILE" | head -n1 | cut -d: -f1)"
  [[ -n "$line" ]] || return 1

  # Look at the previous non-empty comment line above it for allow-until
  local header
  header="$(awk -v n="$line" '
    NR < n {buf[NR]=$0}
    END {
      for (i=n-1; i>=1; i--) {
        if (buf[i] ~ /^[[:space:]]*$/) continue
        print buf[i]
        exit
      }
    }
  ' "$IGNORE_FILE")"

  # Must include allow-until: YYYY-MM-DD
  local allow_until
  allow_until="$(echo "$header" | sed -nE 's/.*allow-until:[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/p')"
  [[ -n "$allow_until" ]] || {
    echo "::error::.trivyignore entry for $cve is missing required expiry comment."
    echo "Expected a comment above it like: # allow-until: 2026-02-15 reason: ... ticket:#123 owner:@name"
    return 2
  }

  if [[ "$allow_until" < "$TODAY" ]]; then
    echo "::error::.trivyignore allowlist for $cve is EXPIRED (allow-until: $allow_until, today: $TODAY)"
    return 2
  fi

  return 0
}

# ---------------------------
# Enforcement
# ---------------------------

FAIL=0

for cve in "${FOUND_CVES[@]}"; do
  if is_cve_accepted_in_registry "$cve"; then
    echo "✅ $cve accepted via registry (active + not expired)."
    continue
  fi

  if is_cve_allowed_in_ignore "$cve"; then
    echo "✅ $cve allowlisted via .trivyignore (not expired)."
    continue
  fi

  echo "::error::❌ $cve is MEDIUM/LOW and is NOT accepted."
  echo "👉 Add it to docs/security-debt.md (with expiry) OR add to .trivyignore with allow-until."
  FAIL=1
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "::error::Security Debt Policy Violation: Unaccepted MEDIUM/LOW vulnerabilities detected."
  exit 1
fi

echo "✅ Security debt policy satisfied."
