#!/usr/bin/env bash
set -euo pipefail

INPUT=$1
POLICY_DIR=$2

opa eval -f json \
  --input "$INPUT" \
  --data "$POLICY_DIR" \
  "data.security.dast" \
  | jq '.result[0].expressions[0].value'
