#!/usr/bin/env bash
set -euo pipefail

# Build Evidence by unify Trivy + CodeQL + VEX.

TRIVY_FILE="$1"
CODEQL_FILE="$2"
VEX_FILE="$3"
OUTPUT="security-evidence.json"

# Extract vulnerabilities from Trivy
jq '
  [
    .Results[]? |
    (.Vulnerabilities // [])[] |
    {
      id: .VulnerabilityID,
      severity: .Severity,
      package: .PkgName
    }
  ]
' "$TRIVY_FILE" > trivy.json

# Extract reachable findings from CodeQL
jq '
  [
    .runs[].results[] |
    {
      id: .ruleId,
      reachable: true
    }
  ]
' "$CODEQL_FILE" > codeql.json

# Extract VEX exploitability
jq '
  [
    .vulnerabilities[] |
    {
      id: .id,
      exploitable: (if .status == "affected" then true else false end)
    }
  ]
' "$VEX_FILE" > vex.json

# Merge all signals
jq -n \
  --argfile t trivy.json \
  --argfile c codeql.json \
  --argfile v vex.json \
'
{
  vulnerabilities:
    [
      $t[] as $tv |
      {
        id: $tv.id,
        severity: $tv.severity,
        package: $tv.package,
        reachable: (
          ($c[] | select(.id == $tv.id)) != null
        ),
        exploitable: (
          ($v[] | select(.id == $tv.id) | .exploitable) // true
        )
      }
    ]
}
' > "$OUTPUT"

echo "✅ Evidence built: $OUTPUT"
