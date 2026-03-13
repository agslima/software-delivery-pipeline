#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/audit-governance-settings.sh [--repo owner/name] [--fixtures-dir path] [--output-dir path]

Compares live GitHub governance settings against repo-tracked expectations and emits:
  - report.json
  - summary.md

Options:
  --repo           Repository in owner/name form. Defaults to GITHUB_REPOSITORY in live mode.
  --fixtures-dir   Read API responses from a fixture directory instead of GitHub.
  --output-dir     Directory for generated audit artifacts.
EOF
}

fail() {
  echo "::error::$1" >&2
  exit 1
}

REPO="${GITHUB_REPOSITORY:-}"
FIXTURES_DIR=""
OUTPUT_DIR="${OUTPUT_DIR:-artifacts/governance-settings-audit}"
EXPECTATIONS_FILE=".github/governance-settings-audit.json"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "$#" -ge 2 ] || fail "--repo requires an argument"
      REPO="${2:-}"
      shift 2
      ;;
    --fixtures-dir)
      [ "$#" -ge 2 ] || fail "--fixtures-dir requires an argument"
      FIXTURES_DIR="${2:-}"
      shift 2
      ;;
    --output-dir)
      [ "$#" -ge 2 ] || fail "--output-dir requires an argument"
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[ -f "$EXPECTATIONS_FILE" ] || fail "Missing expectations file: $EXPECTATIONS_FILE"
[ -n "$FIXTURES_DIR" ] || [ -n "$REPO" ] || fail "Repository must be provided via --repo or GITHUB_REPOSITORY in live mode."
[ -n "$FIXTURES_DIR" ] || command -v gh >/dev/null 2>&1 || fail "gh CLI is required in live mode."
command -v jq >/dev/null 2>&1 || fail "jq is required."

MODE="live"
if [ -n "$FIXTURES_DIR" ]; then
  [ -d "$FIXTURES_DIR" ] || fail "Fixtures directory not found: $FIXTURES_DIR"
  MODE="fixture"
fi

ENVIRONMENT_NAME="$(jq -r '.environment.name' "$EXPECTATIONS_FILE")"
mkdir -p "$OUTPUT_DIR/raw"
CHECKS_FILE="$OUTPUT_DIR/checks.json"
RAW_DIR="$OUTPUT_DIR/raw"
REPORT_JSON="$OUTPUT_DIR/report.json"
SUMMARY_MD="$OUTPUT_DIR/summary.md"
NORMALIZE_JQ='def normalize:
  if type == "object" then
    to_entries
    | sort_by(.key)
    | map(.value |= normalize)
    | from_entries
  elif type == "array" then
    map(normalize)
  else
    .
  end;'

printf '[]\n' > "$CHECKS_FILE"

fetch_json() {
  local basename="$1"
  local api_path="$2"
  local destination="$RAW_DIR/${basename}.json"

  if [ "$MODE" = "fixture" ]; then
    cp "$FIXTURES_DIR/${basename}.json" "$destination"
  else
    gh api \
      -H "Accept: application/vnd.github+json" \
      "$api_path" > "$destination"
  fi
}

json_compact() {
  jq -c '.' <<<"$1"
}

add_check() {
  local id="$1"
  local category="$2"
  local status="$3"
  local severity="$4"
  local expected="$5"
  local actual="$6"
  local source="$7"
  local message="$8"

  local tmp
  tmp="$(mktemp)"
  jq \
    --arg id "$id" \
    --arg category "$category" \
    --arg status "$status" \
    --arg severity "$severity" \
    --arg expected "$expected" \
    --arg actual "$actual" \
    --arg source "$source" \
    --arg message "$message" \
    '. += [{
      id: $id,
      category: $category,
      status: $status,
      severity: $severity,
      expected: $expected,
      actual: $actual,
      source: $source,
      message: $message
    }]' "$CHECKS_FILE" > "$tmp"
  mv "$tmp" "$CHECKS_FILE"
}

record_comparison() {
  local id="$1"
  local category="$2"
  local severity="$3"
  local expected="$4"
  local actual="$5"
  local source="$6"
  local message="$7"

  if [ "$expected" = "$actual" ]; then
    add_check "$id" "$category" "pass" "$severity" "$expected" "$actual" "$source" "$message"
  else
    add_check "$id" "$category" "fail" "$severity" "$expected" "$actual" "$source" "$message"
  fi
}

record_condition() {
  local id="$1"
  local category="$2"
  local severity="$3"
  local expected="$4"
  local actual="$5"
  local source="$6"
  local message="$7"
  local condition="$8"

  if [ "$condition" = "true" ]; then
    add_check "$id" "$category" "pass" "$severity" "$expected" "$actual" "$source" "$message"
  else
    add_check "$id" "$category" "fail" "$severity" "$expected" "$actual" "$source" "$message"
  fi
}

fetch_json "repository-rulesets" "repos/$REPO/rulesets?includes_parents=false"
fetch_json "codeowners-errors" "repos/$REPO/codeowners/errors"
fetch_json "environment-${ENVIRONMENT_NAME}" "repos/$REPO/environments/$ENVIRONMENT_NAME"
fetch_json "environment-${ENVIRONMENT_NAME}-deployment-branch-policies" "repos/$REPO/environments/$ENVIRONMENT_NAME/deployment-branch-policies"

EXPECTED_BRANCH_FILE="$(jq -r '.rulesets.branch.file' "$EXPECTATIONS_FILE")"
EXPECTED_TAG_FILE="$(jq -r '.rulesets.tag.file' "$EXPECTATIONS_FILE")"
EXPECTED_CODEOWNERS_FILE="$(jq -r '.codeowners.file' "$EXPECTATIONS_FILE")"

[ -f "$EXPECTED_BRANCH_FILE" ] || fail "Missing expected branch ruleset file: $EXPECTED_BRANCH_FILE"
[ -f "$EXPECTED_TAG_FILE" ] || fail "Missing expected tag ruleset file: $EXPECTED_TAG_FILE"
[ -f "$EXPECTED_CODEOWNERS_FILE" ] || fail "Missing CODEOWNERS file: $EXPECTED_CODEOWNERS_FILE"

RULESETS_FILE="$RAW_DIR/repository-rulesets.json"
CODEOWNERS_ERRORS_FILE="$RAW_DIR/codeowners-errors.json"
ENVIRONMENT_FILE="$RAW_DIR/environment-${ENVIRONMENT_NAME}.json"
ENVIRONMENT_POLICIES_FILE="$RAW_DIR/environment-${ENVIRONMENT_NAME}-deployment-branch-policies.json"

EXPECTED_BRANCH_REF="$(jq -r '.rulesets.branch.target_ref' "$EXPECTATIONS_FILE")"
EXPECTED_TAG_REF="$(jq -r '.rulesets.tag.target_ref' "$EXPECTATIONS_FILE")"

LIVE_BRANCH_RULESET="$(jq -c --arg ref "$EXPECTED_BRANCH_REF" '
  (if type == "array" then . else .rulesets // [] end)
  | map(select(.target == "branch"))
  | map(select(any(.conditions.ref_name.include[]?; . == $ref)))
  | .[0] // {}
' "$RULESETS_FILE")"

LIVE_TAG_RULESET="$(jq -c --arg ref "$EXPECTED_TAG_REF" '
  (if type == "array" then . else .rulesets // [] end)
  | map(select(.target == "tag"))
  | map(select(any(.conditions.ref_name.include[]?; . == $ref)))
  | .[0] // {}
' "$RULESETS_FILE")"

EXPECTED_BRANCH_RULESET="$(jq -c '.' "$EXPECTED_BRANCH_FILE")"
EXPECTED_TAG_RULESET="$(jq -c '.' "$EXPECTED_TAG_FILE")"

record_condition \
  "branch-ruleset-present" "branch_protection" "high" \
  "ruleset for ${EXPECTED_BRANCH_REF} exists" \
  "$(jq -r 'if . == {} then "missing" else (.name // "present") end' <<<"$LIVE_BRANCH_RULESET")" \
  "GitHub rulesets API" \
  "Repository must keep an active branch ruleset for main." \
  "$(jq -r 'if . == {} then "false" else "true" end' <<<"$LIVE_BRANCH_RULESET")"

record_condition \
  "tag-ruleset-present" "tag_protection" "high" \
  "ruleset for ${EXPECTED_TAG_REF} exists" \
  "$(jq -r 'if . == {} then "missing" else (.name // "present") end' <<<"$LIVE_TAG_RULESET")" \
  "GitHub rulesets API" \
  "Repository must keep an active release tag ruleset." \
  "$(jq -r 'if . == {} then "false" else "true" end' <<<"$LIVE_TAG_RULESET")"

EXPECTED_BRANCH_ENFORCEMENT="$(jq -r '.enforcement' <<<"$EXPECTED_BRANCH_RULESET")"
LIVE_BRANCH_ENFORCEMENT="$(jq -r '.enforcement // "missing"' <<<"$LIVE_BRANCH_RULESET")"
record_comparison \
  "branch-ruleset-active" "branch_protection" "high" \
  "$EXPECTED_BRANCH_ENFORCEMENT" "$LIVE_BRANCH_ENFORCEMENT" \
  "$EXPECTED_BRANCH_FILE" \
  "Branch ruleset enforcement must stay active."

EXPECTED_TAG_ENFORCEMENT="$(jq -r '.enforcement' <<<"$EXPECTED_TAG_RULESET")"
LIVE_TAG_ENFORCEMENT="$(jq -r '.enforcement // "missing"' <<<"$LIVE_TAG_RULESET")"
record_comparison \
  "tag-ruleset-active" "tag_protection" "high" \
  "$EXPECTED_TAG_ENFORCEMENT" "$LIVE_TAG_ENFORCEMENT" \
  "$EXPECTED_TAG_FILE" \
  "Tag ruleset enforcement must stay active."

EXPECTED_BRANCH_RULES="$(jq -c "$NORMALIZE_JQ
  (.rules // [])
  | map(
      if .type == "pull_request" then
        .parameters.allowed_merge_methods = ((.parameters.allowed_merge_methods // []) | sort)
      elif .type == "required_status_checks" then
        .parameters.required_status_checks = (
          (.parameters.required_status_checks // [])
          | map(del(.integration_id))
          | sort_by(.context)
        )
      elif .type == "code_scanning" then
        .parameters.code_scanning_tools = (
          (.parameters.code_scanning_tools // [])
          | sort_by(.tool, .security_alerts_threshold, .alerts_threshold)
        )
      elif .type == "copilot_code_review_analysis_tools" then
        .parameters.tools = ((.parameters.tools // []) | sort_by(.name))
      else
        .
      end
    )
  | sort_by(.type)
  | normalize
" <<<"$EXPECTED_BRANCH_RULESET")"

LIVE_BRANCH_RULES="$(jq -c "$NORMALIZE_JQ
  (.rules // [])
  | map(
      if .type == "pull_request" then
        .parameters.allowed_merge_methods = ((.parameters.allowed_merge_methods // []) | sort)
      elif .type == "required_status_checks" then
        .parameters.required_status_checks = (
          (.parameters.required_status_checks // [])
          | map(del(.integration_id))
          | sort_by(.context)
        )
      elif .type == "code_scanning" then
        .parameters.code_scanning_tools = (
          (.parameters.code_scanning_tools // [])
          | sort_by(.tool, .security_alerts_threshold, .alerts_threshold)
        )
      elif .type == "copilot_code_review_analysis_tools" then
        .parameters.tools = ((.parameters.tools // []) | sort_by(.name))
      else
        .
      end
    )
  | sort_by(.type)
  | normalize
" <<<"$LIVE_BRANCH_RULESET")"

record_comparison \
  "branch-rules-payload" "branch_protection" "high" \
  "$EXPECTED_BRANCH_RULES" "$LIVE_BRANCH_RULES" \
  "$EXPECTED_BRANCH_FILE" \
  "Full branch protection rules must match the audited main-branch policy."

EXPECTED_TAG_RULES="$(jq -c "$NORMALIZE_JQ
  (.rules // [])
  | map(
      if .type == "required_status_checks" then
        .parameters.required_status_checks = (
          (.parameters.required_status_checks // [])
          | map(del(.integration_id))
          | sort_by(.context)
        )
      else
        .
      end
    )
  | sort_by(.type)
  | normalize
" <<<"$EXPECTED_TAG_RULESET")"

LIVE_TAG_RULES="$(jq -c "$NORMALIZE_JQ
  (.rules // [])
  | map(
      if .type == "required_status_checks" then
        .parameters.required_status_checks = (
          (.parameters.required_status_checks // [])
          | map(del(.integration_id))
          | sort_by(.context)
        )
      else
        .
      end
    )
  | sort_by(.type)
  | normalize
" <<<"$LIVE_TAG_RULESET")"

record_comparison \
  "tag-rules-payload" "tag_protection" "high" \
  "$EXPECTED_TAG_RULES" "$LIVE_TAG_RULES" \
  "$EXPECTED_TAG_FILE" \
  "Full tag protection rules must match the audited release-tag policy."

EXPECTED_BRANCH_BYPASS="$(jq -c '(.bypass_actors // []) | sort_by(.actor_id // 0)' <<<"$EXPECTED_BRANCH_RULESET")"
LIVE_BRANCH_BYPASS="$(jq -c '(.bypass_actors // []) | sort_by(.actor_id // 0)' <<<"$LIVE_BRANCH_RULESET")"
record_comparison \
  "branch-bypass-actors" "branch_protection" "high" \
  "$EXPECTED_BRANCH_BYPASS" "$LIVE_BRANCH_BYPASS" \
  "$EXPECTED_BRANCH_FILE" \
  "Branch ruleset bypass actors must remain unchanged."

EXPECTED_TAG_BYPASS="$(jq -c '(.bypass_actors // []) | sort_by(.actor_id // 0)' <<<"$EXPECTED_TAG_RULESET")"
LIVE_TAG_BYPASS="$(jq -c '(.bypass_actors // []) | sort_by(.actor_id // 0)' <<<"$LIVE_TAG_RULESET")"
record_comparison \
  "tag-bypass-actors" "tag_protection" "high" \
  "$EXPECTED_TAG_BYPASS" "$LIVE_TAG_BYPASS" \
  "$EXPECTED_TAG_FILE" \
  "Tag ruleset bypass actors must remain unchanged."

mapfile -t REQUIRED_CODEOWNER_PATHS < <(jq -r '.codeowners.required_paths[]' "$EXPECTATIONS_FILE")
for path in "${REQUIRED_CODEOWNER_PATHS[@]}"; do
  escaped_path="$(printf '%s' "$path" | sed -e 's/[][(){}.^$*+?|\\/]/\\&/g')"
  if grep -Eq "^[[:space:]]*${escaped_path}([[:space:]]+|$)" "$EXPECTED_CODEOWNERS_FILE"; then
    add_check \
      "codeowners-path-${path//[^A-Za-z0-9]/-}" \
      "codeowners" \
      "pass" \
      "medium" \
      "CODEOWNERS entry for $path" \
      "present" \
      "$EXPECTED_CODEOWNERS_FILE" \
      "Governance-sensitive paths must stay mapped in CODEOWNERS."
  else
    add_check \
      "codeowners-path-${path//[^A-Za-z0-9]/-}" \
      "codeowners" \
      "fail" \
      "medium" \
      "CODEOWNERS entry for $path" \
      "missing" \
      "$EXPECTED_CODEOWNERS_FILE" \
      "Governance-sensitive paths must stay mapped in CODEOWNERS."
  fi
done

CODEOWNERS_ERROR_COUNT="$(jq -r '(.errors // []) | length' "$CODEOWNERS_ERRORS_FILE")"
record_condition \
  "codeowners-syntax" "codeowners" "high" \
  "0 CODEOWNERS parse errors" \
  "$CODEOWNERS_ERROR_COUNT errors" \
  "GitHub CODEOWNERS errors API" \
  "GitHub must parse CODEOWNERS without errors for enforcement to work." \
  "$( [ "$CODEOWNERS_ERROR_COUNT" -eq 0 ] && echo true || echo false )"

EXPECTED_ENV_FLAGS="$(jq -c '.environment.deployment_branch_policy' "$EXPECTATIONS_FILE")"
LIVE_ENV_FLAGS="$(jq -c '.deployment_branch_policy // {}' "$ENVIRONMENT_FILE")"
record_comparison \
  "environment-deployment-policy-flags" "environment_protection" "high" \
  "$EXPECTED_ENV_FLAGS" "$LIVE_ENV_FLAGS" \
  "GitHub environments API" \
  "Production environment branch/tag restriction mode must remain aligned with the audited policy."

EXPECTED_ENV_REVIEWERS="$(jq -r '.environment.required_reviewer_count' "$EXPECTATIONS_FILE")"
LIVE_ENV_REVIEWERS="$(jq -r '
  [(.protection_rules // [])[]? | select(.type == "required_reviewers") | (.reviewers // [])[]?] | length
' "$ENVIRONMENT_FILE")"
record_condition \
  "environment-required-reviewers" "environment_protection" "high" \
  "at least ${EXPECTED_ENV_REVIEWERS} required reviewer(s)" \
  "${LIVE_ENV_REVIEWERS} reviewer(s)" \
  "GitHub environments API" \
  "Production environment must require reviewers before deployment jobs proceed." \
  "$( [ "$LIVE_ENV_REVIEWERS" -ge "$EXPECTED_ENV_REVIEWERS" ] && echo true || echo false )"

EXPECTED_ENV_REFS="$(jq -c '.environment.allowed_deployment_refs | sort_by(.type, .name)' "$EXPECTATIONS_FILE")"
LIVE_ENV_REFS="$(jq -c '
  (
    if type == "array" then .
    else (.branch_policies // .policies // [])
    end
  )
  | map({name: .name, type: (.type // "branch")})
  | sort_by(.type, .name)
' "$ENVIRONMENT_POLICIES_FILE")"
record_comparison \
  "environment-allowed-deployment-refs" "environment_protection" "high" \
  "$EXPECTED_ENV_REFS" "$LIVE_ENV_REFS" \
  "GitHub deployment branch policies API" \
  "Production environment must remain restricted to the approved deployment refs."

PASSED_COUNT="$(jq '[.[] | select(.status == "pass")] | length' "$CHECKS_FILE")"
FAILED_COUNT="$(jq '[.[] | select(.status == "fail")] | length' "$CHECKS_FILE")"
OVERALL_STATUS="pass"
if [ "$FAILED_COUNT" -gt 0 ]; then
  OVERALL_STATUS="fail"
fi

GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

jq -n \
  --arg schema_version "$(jq -r '.schema_version' "$EXPECTATIONS_FILE")" \
  --arg repository "${REPO:-fixture/local}" \
  --arg mode "$MODE" \
  --arg environment "$ENVIRONMENT_NAME" \
  --arg generated_at "$GENERATED_AT" \
  --arg overall_status "$OVERALL_STATUS" \
  --argjson passed "$PASSED_COUNT" \
  --argjson failed "$FAILED_COUNT" \
  --slurpfile checks "$CHECKS_FILE" \
  '{
    schema_version: $schema_version,
    repository: $repository,
    mode: $mode,
    environment: $environment,
    generated_at: $generated_at,
    overall_status: $overall_status,
    summary: {
      passed: $passed,
      failed: $failed
    },
    checks: $checks[0]
  }' > "$REPORT_JSON"

{
  echo "# Governance Settings Audit"
  echo
  echo "- Repository: \`${REPO:-fixture/local}\`"
  echo "- Mode: \`$MODE\`"
  echo "- Environment: \`$ENVIRONMENT_NAME\`"
  echo "- Generated at (UTC): \`$GENERATED_AT\`"
  echo "- Overall status: \`$OVERALL_STATUS\`"
  echo "- Checks passed: \`$PASSED_COUNT\`"
  echo "- Checks failed: \`$FAILED_COUNT\`"
  echo
  echo "| Check | Category | Status | Severity | Message |"
  echo "| :--- | :--- | :---: | :---: | :--- |"
  jq -r '.[] | "| `\(.id)` | `\(.category)` | `\(.status)` | `\(.severity)` | \(.message) |"' "$CHECKS_FILE"
} > "$SUMMARY_MD"

echo "[governance-settings-audit] report: $REPORT_JSON"
echo "[governance-settings-audit] summary: $SUMMARY_MD"

if [ "$OVERALL_STATUS" != "pass" ]; then
  fail "Governance settings audit detected drift. See $SUMMARY_MD and $REPORT_JSON."
fi
