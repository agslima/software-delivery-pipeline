#!/usr/bin/env bash
set -euo pipefail

FILE=$1

jq '
{
  source: "zap",
  summary: {
    high: ([.site[]? | .alerts[]? | select(.riskcode=="3")] | length),
    medium: ([.site[]? | .alerts[]? | select(.riskcode=="2")] | length),
    low: ([.site[]? | .alerts[]? | select(.riskcode=="1")] | length)
  }
}
' "$FILE"
