#!/usr/bin/env bash
set -euo pipefail

POLICY_FILE="${GOVERNANCE_METADATA_POLICY_FILE:-.github/governance-metadata-policy.json}"
OVERRIDES_FILE="${GOVERNANCE_METADATA_OVERRIDES_FILE:-.github/governance-metadata-overrides.json}"
TODAY="${GOVERNANCE_METADATA_TODAY:-$(date -u +%F)}"

# fail emits a GitHub Actions error annotation and exits the script.
fail() {
  echo "::error::$1"
  exit 1
}

# extract_metadata_value reads a supported freshness field from a tracked document.
extract_metadata_value() {
  local path="$1"
  local field="$2"

  case "$field" in
    last_reviewed)
      sed -nE 's/^\[\/\/\]: # \(last_reviewed: ([0-9]{4}-[0-9]{2}-[0-9]{2})\)$/\1/p' "$path" | head -n 1
      ;;
    last_validated)
      sed -nE 's/^- \*\*Last validated([^*]*)?:\*\*[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2})$/\2/p' "$path" | head -n 1
      ;;
    *)
      return 1
      ;;
  esac
}

# ensure_json_file verifies that a required JSON file exists and parses cleanly.
ensure_json_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "Missing required JSON file: $file"
  jq -e . "$file" >/dev/null || fail "Invalid JSON in $file"
}

# ensure_date validates that a value uses the repository's YYYY-MM-DD date format.
ensure_date() {
  local value="$1"
  local context="$2"
  [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "Invalid date '$value' for $context. Expected YYYY-MM-DD."
}

# lookup_override returns the active override JSON for a document field, if one exists.
lookup_override() {
  local path="$1"
  local field="$2"

  jq -c --arg path "$path" --arg field "$field" --arg today "$TODAY" '
    [
      .overrides[]?
      | select(.path == $path and .field == $field)
      | select((.allow_stale_until // "") >= $today)
    ]
    | if length == 1 then .[0] else empty end
  ' "$OVERRIDES_FILE"
}

# ensure_override_shape validates the required fields on an approved freshness override.
ensure_override_shape() {
  local override_json="$1"
  local path="$2"
  local field="$3"

  local allow_until approved_by ticket reason
  allow_until="$(jq -r '.allow_stale_until // empty' <<<"$override_json")"
  approved_by="$(jq -r '.approved_by // empty' <<<"$override_json")"
  ticket="$(jq -r '.ticket // empty' <<<"$override_json")"
  reason="$(jq -r '.reason // empty' <<<"$override_json")"

  ensure_date "$allow_until" "$OVERRIDES_FILE override for $path $field"
  [[ -n "$approved_by" ]] || fail "Override for $path $field is missing approved_by in $OVERRIDES_FILE"
  [[ -n "$ticket" ]] || fail "Override for $path $field is missing ticket in $OVERRIDES_FILE"
  [[ -n "$reason" ]] || fail "Override for $path $field is missing reason in $OVERRIDES_FILE"
}

# ensure_single_override_match enforces one active override per document field.
ensure_single_override_match() {
  local path="$1"
  local field="$2"
  local count
  count="$(
    jq -r --arg path "$path" --arg field "$field" --arg today "$TODAY" '
      [
        .overrides[]?
        | select(.path == $path and .field == $field)
        | select((.allow_stale_until // "") >= $today)
      ] | length
    ' "$OVERRIDES_FILE"
  )"
  [[ "$count" == "0" || "$count" == "1" ]] || fail "Found $count active overrides for $path $field in $OVERRIDES_FILE. Keep at most one active override per metadata field."
}

# ensure_override_file_shape verifies the override file exposes the expected top-level array.
ensure_override_file_shape() {
  jq -e '.overrides? | type == "array"' "$OVERRIDES_FILE" >/dev/null || fail "Expected .overrides array in $OVERRIDES_FILE"
}

# main evaluates tracked governance metadata freshness and reports pass/fail status.
main() {
  command -v jq >/dev/null || fail "jq is required for governance metadata freshness checks"

  ensure_json_file "$POLICY_FILE"
  ensure_json_file "$OVERRIDES_FILE"
  ensure_override_file_shape
  ensure_date "$TODAY" "GOVERNANCE_METADATA_TODAY"

  jq -e '.tracked_documents? | type == "array" and length > 0' "$POLICY_FILE" >/dev/null \
    || fail "Expected non-empty .tracked_documents array in $POLICY_FILE"

  echo "[governance-metadata] evaluating freshness as of $TODAY"
  echo "[governance-metadata] policy: $POLICY_FILE"
  echo "[governance-metadata] overrides: $OVERRIDES_FILE"

  local failures=0 passes=0 overrides_used=0
  local entry path field cadence max_age_days observed due_date active_override message

  while IFS= read -r entry; do
    path="$(jq -r '.path' <<<"$entry")"
    field="$(jq -r '.field' <<<"$entry")"
    cadence="$(jq -r '.cadence' <<<"$entry")"
    max_age_days="$(jq -r '.max_age_days' <<<"$entry")"

    [[ -f "$path" ]] || fail "Tracked governance document missing: $path"
    [[ "$max_age_days" =~ ^[0-9]+$ ]] || fail "Invalid max_age_days for $path $field in $POLICY_FILE"

    observed="$(extract_metadata_value "$path" "$field")" || fail "Unsupported metadata field '$field' in $POLICY_FILE"
    [[ -n "$observed" ]] || fail "Unable to find $field metadata in $path"
    ensure_date "$observed" "$path $field"

    due_date="$(date -u -d "$observed + $max_age_days days" +%F)"
    ensure_single_override_match "$path" "$field"
    active_override="$(lookup_override "$path" "$field" || true)"

    if [[ "$TODAY" > "$due_date" ]]; then
      if [[ -n "$active_override" ]]; then
        ensure_override_shape "$active_override" "$path" "$field"
        message="$(jq -r '"approved_by=" + .approved_by + ", ticket=" + .ticket + ", allow_stale_until=" + .allow_stale_until' <<<"$active_override")"
        echo "::warning file=$path,title=Governance metadata override in effect::$field is stale since $due_date under $cadence cadence, but an approved temporary override is active ($message)."
        overrides_used=$((overrides_used + 1))
        passes=$((passes + 1))
        continue
      fi

      echo "::error file=$path,title=Stale governance metadata::$field=$observed exceeded $cadence cadence (${max_age_days} days). Refresh the document metadata or add a time-bound justified override in $OVERRIDES_FILE with path, field, approved_by, ticket, reason, and allow_stale_until."
      failures=$((failures + 1))
      continue
    fi

    echo "✅ $path $field=$observed is within $cadence cadence (due by $due_date)."
    passes=$((passes + 1))
  done < <(jq -c '.tracked_documents[]' "$POLICY_FILE")

  echo "[governance-metadata] passed=$passes failed=$failures overrides_used=$overrides_used"

  if [[ "$failures" -ne 0 ]]; then
    fail "Governance metadata freshness check failed. Update stale metadata or add a temporary approved override in $OVERRIDES_FILE."
  fi

  echo "[governance-metadata] OK"
}

main "$@"
