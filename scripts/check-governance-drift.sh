#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq "$expected" "$file" || fail "Missing expected reference in $file: $expected"
}

echo "[governance-drift] Markdown structure assertions"
assert_contains "readme.md" "# Governed Software Delivery Pipeline"
assert_contains "docs/governance.md" "# Branch Protection & Governance Model"
assert_contains "docs/threat-model.md" "# Security Controls"

echo "[governance-drift] Reference assertions: workflow names and policy thresholds"
assert_contains "readme.md" "HIGH > 5"

assert_contains "docs/governance.md" "## README Claims → Controls Matrix"
assert_contains "readme.md" "docs/governance.md#readme-claims--controls-matrix"
assert_contains "docs/governance.md" "ci-release-gate.yml"
assert_contains "docs/governance.md" "ci-pr-validation.yml"
assert_contains "docs/governance.md" "gitops-enforce.yml"

assert_contains ".github/workflows/ci-release-gate.yml" "Gate (CRITICAL>0 or HIGH>5)"
assert_contains ".github/workflows/ci-pr-validation.yml" "name: Security Quality Check"
assert_contains ".github/workflows/gitops-enforce.yml" "Guardrails - Validate promotion source"

echo "[governance-drift] OK"
