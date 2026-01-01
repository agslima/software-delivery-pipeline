#!/usr/bin/env bash
set -e

RESULTS_FILE=$1
DEBT_FILE="docs/security-debt.md"

MEDIUM_LOW_COUNT=$(jq '[.vulnerabilities[] | select(.severity=="medium" or .severity=="low")] | length' "$RESULTS_FILE")

if [[ "$MEDIUM_LOW_COUNT" -gt 0 ]]; then
  if ! grep -q "$(git rev-parse HEAD)" "$DEBT_FILE"; then
    echo "❌ Medium/Low vulnerabilities detected but not acknowledged in security-debt.md"
    exit 1
  fi
fi

echo "✅ Risk accepted and documented"
