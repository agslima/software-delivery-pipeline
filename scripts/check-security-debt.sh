#!/usr/bin/env bash
set -e

RESULTS_FILE=$1
DEBT_FILE="docs/security-debt.md"

echo "🔍 Analyzing Trivy Results: $RESULTS_FILE"

# 🔴 OLD (Crashes on null): 
# .Results[]? | .Vulnerabilities[]?

# 🟢 NEW (Safe): 
# .Results[]? | (.Vulnerabilities // [])[]
# The "// []" part means "if null, treat as empty list"

MEDIUM_LOW_COUNT=$(jq '[.Results[]? | (.Vulnerabilities // [])[] | select(.Severity=="MEDIUM" or .Severity=="LOW")] | length' "$RESULTS_FILE")

echo "📊 Found $MEDIUM_LOW_COUNT Medium/Low vulnerabilities."

if [[ "$MEDIUM_LOW_COUNT" -gt 0 ]]; then
  # Use git rev-parse to get the current commit hash
  CURRENT_COMMIT=$(git rev-parse HEAD)
  
  if ! grep -q "$CURRENT_COMMIT" "$DEBT_FILE"; then
    echo "❌ Security Debt Policy Violation: Medium/Low vulnerabilities detected but not acknowledged."
    echo "👉 Action Required: Add the commit hash ($CURRENT_COMMIT) to $DEBT_FILE to accept this risk."
    exit 1
  fi
fi

echo "✅ Risk accepted and documented."
