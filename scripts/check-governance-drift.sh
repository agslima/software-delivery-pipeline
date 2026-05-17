#!/usr/bin/env bash
set -euo pipefail

# fail prints an error annotation using the provided message and exits the script with status 1.
fail() {
  echo "::error::$1"
  exit 1
}

# assert_contains verifies that FILE contains the literal string EXPECTED and calls fail (printing an error annotation and exiting with status 1) if the string is not found.
assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq "$expected" "$file" || fail "Missing expected reference in $file: $expected"
}

# markdown_assert runs the markdown-aware assertion helper script (scripts/markdown_assert.py) with the provided arguments.
markdown_assert() {
  python3 scripts/markdown_assert.py "$@"
}

# docs_metadata_assert validates documentation metadata by running scripts/check-docs-metadata.py.
docs_metadata_assert() {
  python3 scripts/check-docs-metadata.py
}

echo "[governance-drift] Markdown structure assertions"
markdown_assert heading-any "README.md" "Governed Software Delivery Pipeline"
markdown_assert heading-any "docs/governance.md" "Delivery Governance Model"
markdown_assert heading-any "docs/threat-model.md" "Security Controls"

echo "[governance-drift] Documentation metadata assertions"
docs_metadata_assert

echo "[governance-drift] README claim and evidence-index mapping assertions"
python3 scripts/check-governance-evidence-index.py

readme_claims_anchor="$(python3 scripts/markdown_assert.py anchor "README Claims → Controls Matrix")"
workflow_mapping_anchor="$(python3 scripts/markdown_assert.py anchor "Workflow and Evidence Mapping")"

markdown_assert heading-any "docs/governance.md" \
  "README Claims → Controls Matrix" \
  "Workflow and Evidence Mapping"
markdown_assert link-any "README.md" \
  "docs/governance.md#${readme_claims_anchor}" \
  "docs/governance.md#${workflow_mapping_anchor}" \
  "docs/governance-evidence-index.md"
assert_contains "docs/governance.md" "ci-release-gate.yml"
assert_contains "docs/governance.md" "ci-pr-validation.yml"
assert_contains "docs/governance.md" "gitops-enforce.yml"
assert_contains "docs/governance.md" "normalized Trivy, CodeQL, and VEX evidence"

assert_contains ".github/workflows/release-static-risk.yml" "name: CodeQL Release Analysis"
assert_contains ".github/workflows/release-static-risk.yml" "name: Generate conservative VEX assertions"
assert_contains ".github/workflows/release-static-risk.yml" "name: Evaluate static risk policy"
assert_contains ".github/workflows/ci-pr-validation.yml" "name: Governance Checks"
assert_contains ".github/workflows/ci-pr-validation.yml" "name: Security Scans"
assert_contains ".github/workflows/gitops-enforce.yml" "./.github/actions/validate-promotion"
assert_contains ".github/actions/validate-promotion/action.yml" "Guardrails - Validate promotion source"

echo "[governance-drift] OK"
