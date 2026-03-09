#!/usr/bin/env bash
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Snyk security aggregation for this repo
#
# Scans:
#   - SCA:        app/server/package.json, app/client/package.json
#   - SAST:       entire codebase
#   - Containers: built images from:
#                   - app/docker/Dockerfile.client
#                   - app/docker/Dockerfile.server
#   - IaC:        k8s/ (excluding k8s/tests/)
#
# Outputs:
#   - docs/snyk/html/*.html (if snyk-to-html is installed)
#   - docs/snyk/index.md
#   - README.md generated table between markers
# -----------------------------------------------------------------------------

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APP_DIR="${ROOT_DIR}/app"
DOCS_DIR="${ROOT_DIR}/docs/snyk"
HTML_DIR="${DOCS_DIR}/html"
if [[ -f "${ROOT_DIR}/readme.md" ]]; then
  README_FILE="${ROOT_DIR}/readme.md"
elif [[ -f "${ROOT_DIR}/README.md" ]]; then
  README_FILE="${ROOT_DIR}/README.md"
else
  printf '[ERROR] Could not find README file (expected readme.md or README.md in repo root).\n' >&2
  exit 1
fi

SNYK_ORG="${SNYK_ORG:-a.agnaldosilva}"
SNYK_VERSION="${SNYK_VERSION:-1.1296.0}"
SNYK_TO_HTML_VERSION="${SNYK_TO_HTML_VERSION:-2.8.0}"

# Built image tags used only for scanning in this script.
CLIENT_IMAGE_TAG="${CLIENT_IMAGE_TAG:-file-server-client:snyk}"
SERVER_IMAGE_TAG="${SERVER_IMAGE_TAG:-file-server-server:snyk}"

BASELINE_CRITICAL="${BASELINE_CRITICAL:-27}"
BASELINE_HIGH="${BASELINE_HIGH:-116}"
BASELINE_MEDIUM="${BASELINE_MEDIUM:-191}"
BASELINE_LOW="${BASELINE_LOW:-345}"

mkdir -p "${HTML_DIR}"

declare -A SCAN_JSON_FILES=()
TEMP_FILES=()

# cleanup_temp_files removes all filesystem paths recorded in the TEMP_FILES array.
cleanup_temp_files() {
  if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
    rm -f "${TEMP_FILES[@]}"
  fi
}

trap cleanup_temp_files EXIT

# log prints an informational message prefixed with [INFO] to stdout.
log() {
  printf '[INFO] %s\n' "$*"
}

# warn prints a warning message to stderr prefixed with "[WARN]".
warn() {
  printf '[WARN] %s\n' "$*" >&2
}

# die prints an error message to stderr and exits the script with status 1.
die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

# require_cmd verifies that a command is available in PATH and exits with an error if it is not found.
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

# init_snyk_tools sets SNYK_CMD and SNYK_TO_HTML_CMD to command arrays that prefer locally installed `snyk` and `snyk-to-html`, falling back to `npx` with the configured `SNYK_VERSION` and `SNYK_TO_HTML_VERSION`; if neither local nor `npx`-available `snyk-to-html` is found, `SNYK_TO_HTML_CMD` is left empty.
init_snyk_tools() {
  if command -v snyk >/dev/null 2>&1; then
    SNYK_CMD=(snyk)
  else
    require_cmd npx
    SNYK_CMD=(npx --yes "snyk@${SNYK_VERSION}")
  fi

  if command -v snyk-to-html >/dev/null 2>&1; then
    SNYK_TO_HTML_CMD=(snyk-to-html)
  elif command -v npx >/dev/null 2>&1; then
    SNYK_TO_HTML_CMD=(npx --yes "snyk-to-html@${SNYK_TO_HTML_VERSION}")
  else
    SNYK_TO_HTML_CMD=()
  fi
}

# maybe_html generates an HTML report from a Snyk JSON file using `snyk-to-html` if available, otherwise logs a warning.
maybe_html() {
  local in_json="$1"
  local out_html="$2"

  if [[ ${#SNYK_TO_HTML_CMD[@]} -gt 0 ]]; then
    "${SNYK_TO_HTML_CMD[@]}" -i "$in_json" -o "$out_html" >/dev/null 2>&1 || \
      warn "Failed to render HTML report for ${in_json}"
  else
    warn "snyk-to-html not found; skipping HTML generation for ${in_json}"
  fi
}

# sanitize_report_file redacts token-shaped strings (e.g., SendGrid-like tokens) in the given report file to prevent secret-scanning false positives; a non-existent or empty file is left unchanged.
sanitize_report_file() {
  local report_file="$1"

  [[ -s "${report_file}" ]] || return 0

  # Snyk Code embeds third-party example credentials in rule metadata.
  # Redact token-shaped strings to avoid secret-scanning false positives.
  perl -i -pe 's/SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/SG.REDACTED.REDACTED/g' "${report_file}"
}

snyk_args_common=()
if [[ -n "${SNYK_ORG}" ]]; then
  snyk_args_common+=(--org="${SNYK_ORG}")
fi

# run_snyk_capture runs a Snyk scan named NAME with the given Snyk CLI arguments, captures JSON and SARIF outputs to temporary files, sanitizes/redacts those outputs, optionally generates an HTML report, and records the JSON path in SCAN_JSON_FILES; exits the script if Snyk returns an execution error.
# NAME is the scan identifier; any additional arguments are forwarded to the Snyk CLI.
run_snyk_capture() {
  local name="$1"
  shift

  local json_out
  local sarif_out
  json_out="$(mktemp)"
  sarif_out="$(mktemp)"
  TEMP_FILES+=("${json_out}" "${sarif_out}")

  log "Running Snyk scan: ${name}"

  set +e
  "${SNYK_CMD[@]}" "$@" \
    "${snyk_args_common[@]}" \
    --json-file-output="${json_out}" \
    --sarif-file-output="${sarif_out}"
  local rc=$?
  set -e

  # Snyk:
  # 0 = no issues
  # 1 = issues found
  # >1 = real execution error
  if [[ ${rc} -gt 1 ]]; then
    die "Snyk command failed for ${name} with exit code ${rc}"
  fi

  if [[ ! -s "${json_out}" ]]; then
    warn "Empty JSON output for ${name}; creating placeholder."
    echo '{}' > "${json_out}"
  fi

  sanitize_report_file "${json_out}"
  sanitize_report_file "${sarif_out}"
  maybe_html "${json_out}" "${HTML_DIR}/${name}.html"
  SCAN_JSON_FILES["${name}"]="${json_out}"
}

# build_container_images builds the client and server Docker images from app/docker/Dockerfile.client and app/docker/Dockerfile.server and tags them with CLIENT_IMAGE_TAG and SERVER_IMAGE_TAG.
build_container_images() {
  log "Building client image: ${CLIENT_IMAGE_TAG}"
  docker build \
    -f "${APP_DIR}/docker/Dockerfile.client" \
    -t "${CLIENT_IMAGE_TAG}" \
    "${APP_DIR}"

  log "Building server image: ${SERVER_IMAGE_TAG}"
  docker build \
    -f "${APP_DIR}/docker/Dockerfile.server" \
    -t "${SERVER_IMAGE_TAG}" \
    "${APP_DIR}"
}

# count_standard_vulns counts unique standard (SCA/container/SAST) vulnerabilities in a Snyk JSON and echoes four tab-separated numbers: critical, high, medium, low.
# Takes a path to a Snyk JSON file as its sole argument and prints the counts (in that exact order) to stdout.
count_standard_vulns() {
  local json_file="$1"

  jq -r '
    def norm:
      ascii_downcase
      | if . == "critical" then "critical"
        elif . == "high" then "high"
        elif . == "medium" then "medium"
        elif . == "low" then "low"
        else empty
        end;

    def vuln_items_from_result:
      .vulnerabilities // [];

    def target_name:
      .displayTargetFile
      // .targetFile
      // .projectName
      // .docker
      // .image
      // "unknown-target";

    def rows_from_result:
      vuln_items_from_result
      | map({
          k: ((target_name | tostring) + "::" + ((.id // .packageName // .title // "unknown-id") | tostring)),
          severity: ((.severity // empty) | tostring | norm)
        });

    (
      if type == "array" then
        map(rows_from_result) | add
      elif type == "object" and has("vulnerabilities") then
        rows_from_result
      elif type == "object" and has("results") then
        [.results[]? | rows_from_result] | add
      else
        []
      end
    )
    | unique_by(.k)
    | [
        (map(select(.severity == "critical")) | length),
        (map(select(.severity == "high")) | length),
        (map(select(.severity == "medium")) | length),
        (map(select(.severity == "low")) | length)
      ]
    | @tsv
  ' "$json_file"
}

# count_standard_vulns_by_target extracts per-target counts of standard vulnerabilities (critical, high, medium, low) from a Snyk JSON file and echoes TSV rows with fields: target, critical, high, medium, low.
count_standard_vulns_by_target() {
  local json_file="$1"

  jq -r '
    def norm:
      ascii_downcase
      | if . == "critical" then "critical"
        elif . == "high" then "high"
        elif . == "medium" then "medium"
        elif . == "low" then "low"
        else empty
        end;

    def target_name:
      .displayTargetFile
      // .targetFile
      // .projectName
      // .docker
      // .image
      // "unknown-target";

    def rows_from_result:
      (.vulnerabilities // [])
      | map({
          target: (target_name | tostring),
          id: ((.id // .packageName // .title // "unknown-id") | tostring),
          severity: ((.severity // empty) | tostring | norm)
        });

    (
      if type == "array" then
        map(rows_from_result) | add
      elif type == "object" and has("vulnerabilities") then
        rows_from_result
      elif type == "object" and has("results") then
        [.results[]? | rows_from_result] | add
      else
        []
      end
    )
    | map(select(.severity != null and .severity != ""))
    | unique_by(.target + "::" + .id)
    | group_by(.target)
    | map({
        target: .[0].target,
        critical: (map(select(.severity == "critical")) | length),
        high: (map(select(.severity == "high")) | length),
        medium: (map(select(.severity == "medium")) | length),
        low: (map(select(.severity == "low")) | length)
      })
    | sort_by(.target)
    | .[]
    | [.target, (.critical|tostring), (.high|tostring), (.medium|tostring), (.low|tostring)]
    | @tsv
  ' "$json_file"
}

# count_iac_issues counts infrastructure-as-code issues in a Snyk JSON file and echoes a TSV with the number of `critical`, `high`, `medium`, and `low` issues (in that order).
count_iac_issues() {
  local json_file="$1"

  jq -r '
    def norm:
      ascii_downcase
      | if . == "critical" then "critical"
        elif . == "high" then "high"
        elif . == "medium" then "medium"
        elif . == "low" then "low"
        else empty
        end;

    def target_name:
      .path // .targetFile // .displayTargetFile // .projectName // "unknown-target";

    def issues_from_result:
      (
        .infrastructureAsCodeIssues
        // .iacIssues
        // .issues
        // []
      )
      | map({
          k: ((target_name | tostring) + "::" + ((.id // .title // "unknown-id") | tostring)),
          severity: ((.severity // empty) | tostring | norm)
        });

    (
      if type == "array" then
        map(issues_from_result) | add
      elif type == "object" and (has("infrastructureAsCodeIssues") or has("iacIssues") or has("issues")) then
        issues_from_result
      elif type == "object" and has("results") then
        [.results[]? | issues_from_result] | add
      else
        []
      end
    )
    | unique_by(.k)
    | [
        (map(select(.severity == "critical")) | length),
        (map(select(.severity == "high")) | length),
        (map(select(.severity == "medium")) | length),
        (map(select(.severity == "low")) | length)
      ]
    | @tsv
  ' "$json_file"
}

# count_iac_issues_by_target parses a Snyk IaC JSON file and emits TSV lines with per-target counts of infrastructure-as-code issues by severity (critical, high, medium, low).
count_iac_issues_by_target() {
  local json_file="$1"

  jq -r '
    def norm:
      ascii_downcase
      | if . == "critical" then "critical"
        elif . == "high" then "high"
        elif . == "medium" then "medium"
        elif . == "low" then "low"
        else empty
        end;

    def target_name:
      .path // .targetFile // .displayTargetFile // .projectName // "unknown-target";

    def issues_from_result:
      (
        .infrastructureAsCodeIssues
        // .iacIssues
        // .issues
        // []
      )
      | map({
          target: (target_name | tostring),
          id: ((.id // .title // "unknown-id") | tostring),
          severity: ((.severity // empty) | tostring | norm)
        });

    (
      if type == "array" then
        map(issues_from_result) | add
      elif type == "object" and (has("infrastructureAsCodeIssues") or has("iacIssues") or has("issues")) then
        issues_from_result
      elif type == "object" and has("results") then
        [.results[]? | issues_from_result] | add
      else
        []
      end
    )
    | map(select(.severity != null and .severity != ""))
    | unique_by(.target + "::" + .id)
    | group_by(.target)
    | map({
        target: .[0].target,
        critical: (map(select(.severity == "critical")) | length),
        high: (map(select(.severity == "high")) | length),
        medium: (map(select(.severity == "medium")) | length),
        low: (map(select(.severity == "low")) | length)
      })
    | sort_by(.target)
    | .[]
    | [.target, (.critical|tostring), (.high|tostring), (.medium|tostring), (.low|tostring)]
    | @tsv
  ' "$json_file"
}

# list_iac_targets outputs unique IaC target names found in a Snyk JSON report file.
# It accepts a path to a JSON file as its sole argument and writes one unique target name per line to stdout.
list_iac_targets() {
  local json_file="$1"

  jq -r '
    def target_name:
      .path // .targetFile // .displayTargetFile // .projectName // "unknown-target";

    (
      if type == "array" then
        [.[]? | target_name]
      elif type == "object" and has("results") then
        [.results[]? | target_name]
      elif type == "object" then
        [target_name]
      else
        []
      end
    )
    | map(select(. != null and . != ""))
    | unique
    | .[]
  ' "$json_file"
}

# count_sast_issues counts SAST issues in the given Snyk/SARIF JSON file and echoes a TSV of counts in the order: critical, high, medium, low.
count_sast_issues() {
  local json_file="$1"

  jq -r '
    def norm_level($v):
      ($v // "" | tostring | ascii_downcase) as $s
      | if $s == "critical" then "critical"
        elif $s == "high" then "high"
        elif $s == "medium" then "medium"
        elif $s == "low" then "low"
        elif $s == "error" then "high"
        elif $s == "warning" then "medium"
        elif $s == "note" then "low"
        else empty
        end;

    def rule_index:
      reduce (.runs[]?.tool.driver.rules[]?) as $r ({}; . + {
        ($r.id): (
          $r.properties.severity
          // $r.properties["security-severity"]
          // $r.defaultConfiguration.level
          // "medium"
        )
      });

    def result_items($idx):
      [
        .runs[]?.results[]?
        | {
            id: (.ruleId // .fingerprints.primaryLocationLineHash // .message.text // "unknown-id"),
            severity: (
              .properties.severity
              // .level
              // $idx[.ruleId]
              // "medium"
            )
          }
      ];

    (rule_index) as $idx
    | result_items($idx)
    | map({
        k: (.id | tostring),
        severity: norm_level(.severity)
      })
    | unique_by(.k)
    | [
        (map(select(.severity == "critical")) | length),
        (map(select(.severity == "high")) | length),
        (map(select(.severity == "medium")) | length),
        (map(select(.severity == "low")) | length)
      ]
    | @tsv
  ' "$json_file"
}

# status_for maps a vulnerability severity and count to a concise textual status.
# For severity "Critical" or "High" returns "✅ Fixed" when count is 0 or "❌ Must fix" otherwise; for "Medium" or "Low" returns "✅ Fixed" when count is 0 or "ℹ️ Managed Debt" otherwise; for any other severity returns "Unknown".
status_for() {
  local severity="$1"
  local count="$2"

  case "$severity" in
    Critical|High)
      if [[ "$count" -eq 0 ]]; then
        printf '✅ Fixed'
      else
        printf '❌ Must fix'
      fi
      ;;
    Medium|Low)
      if [[ "$count" -eq 0 ]]; then
        printf '✅ Fixed'
      else
        printf 'ℹ️ Managed Debt'
      fi
      ;;
    *)
      printf 'Unknown'
      ;;
  esac
}

# write_index_md writes the consolidated Snyk index markdown file to "${DOCS_DIR}/index.md", creating per-project rows (SCA, IaC, SAST, container images), an aggregate severity summary, artifact HTML links, and a generated-at timestamp.
# Arguments: total_crit total_high total_med total_low timestamp_utc — totals used for the aggregate summary and the UTC timestamp written in the Notes section.
write_index_md() {
  local total_crit="$1"
  local total_high="$2"
  local total_med="$3"
  local total_low="$4"
  local timestamp_utc="$5"
  local tested_at="${timestamp_utc}"
  local sca_target sca_crit_t sca_high_t sca_med_t sca_low_t
  local iac_target iac_crit_t iac_high_t iac_med_t iac_low_t
  local iac_count_row
  local sca_json="${SCAN_JSON_FILES[snyk-sca]}"
  local iac_json="${SCAN_JSON_FILES[snyk-iac]}"

  declare -a project_rows=()
  declare -A iac_counts

  project_rows+=("| [Code analysis](html/snyk-code.html) | ${tested_at} | ${sast_crit} | ${sast_high} | ${sast_med} | ${sast_low} |")

  while IFS=$'\t' read -r iac_target iac_crit_t iac_high_t iac_med_t iac_low_t; do
    [[ -n "${iac_target}" ]] || continue
    iac_counts["${iac_target}"]="${iac_crit_t} ${iac_high_t} ${iac_med_t} ${iac_low_t}"
  done < <(count_iac_issues_by_target "${iac_json}")

  while IFS= read -r iac_target; do
    [[ -n "${iac_target}" ]] || continue
    iac_count_row="${iac_counts[${iac_target}]:-0 0 0 0}"
    read -r iac_crit_t iac_high_t iac_med_t iac_low_t <<<"${iac_count_row}"
    project_rows+=("| [${iac_target}](html/snyk-iac.html) | ${tested_at} | ${iac_crit_t} | ${iac_high_t} | ${iac_med_t} | ${iac_low_t} |")
  done < <(list_iac_targets "${iac_json}")

  while IFS=$'\t' read -r sca_target sca_crit_t sca_high_t sca_med_t sca_low_t; do
    [[ -n "${sca_target}" ]] || continue
    project_rows+=("| [${sca_target}](html/snyk-sca.html) | ${tested_at} | ${sca_crit_t} | ${sca_high_t} | ${sca_med_t} | ${sca_low_t} |")
  done < <(count_standard_vulns_by_target "${sca_json}")

  project_rows+=("| [app/docker/Dockerfile.client](html/snyk-container-client.html) | ${tested_at} | ${cc_crit} | ${cc_high} | ${cc_med} | ${cc_low} |")
  project_rows+=("| [app/docker/Dockerfile.server](html/snyk-container-server.html) | ${tested_at} | ${cs_crit} | ${cs_high} | ${cs_med} | ${cs_low} |")

  cat > "${DOCS_DIR}/index.md" <<EOF
# Snyk Scans

This directory contains the latest Snyk scan index for this repository.

## Projects

| Project | Tested | C | H | M | L |
| :--- | :--- | ---: | ---: | ---: | ---: |
$(printf '%s\n' "${project_rows[@]}")

## Aggregate Summary

| Severity | Count |
| :--- | ---: |
| Critical | ${total_crit} |
| High | ${total_high} |
| Medium | ${total_med} |
| Low | ${total_low} |

## Artifacts

| Scan | HTML |
| :--- | :--- |
| SCA | $( [[ -f "${HTML_DIR}/snyk-sca.html" ]] && echo "[snyk-sca.html](html/snyk-sca.html)" || echo "-" ) |
| Code | $( [[ -f "${HTML_DIR}/snyk-code.html" ]] && echo "[snyk-code.html](html/snyk-code.html)" || echo "-" ) |
| Container (client) | $( [[ -f "${HTML_DIR}/snyk-container-client.html" ]] && echo "[snyk-container-client.html](html/snyk-container-client.html)" || echo "-" ) |
| Container (server) | $( [[ -f "${HTML_DIR}/snyk-container-server.html" ]] && echo "[snyk-container-server.html](html/snyk-container-server.html)" || echo "-" ) |
| IaC | $( [[ -f "${HTML_DIR}/snyk-iac.html" ]] && echo "[snyk-iac.html](html/snyk-iac.html)" || echo "-" ) |

## Notes

- Counts are aggregated across SCA, Code, container, and IaC scans.
- Container findings come from real built local images, not Dockerfile-only analysis.
- Generated at: ${timestamp_utc} UTC
EOF
}

# update_readme_block replaces the README section between <!-- [BEGIN_GENERATED_TABLE] --> and <!-- [END_GENERATED_TABLE] --> with an automated security posture table populated with the supplied critical, high, medium, low totals and the scan UTC timestamp.
update_readme_block() {
  local total_crit="$1"
  local total_high="$2"
  local total_med="$3"
  local total_low="$4"
  local timestamp_utc="$5"

  local crit_status high_status med_status low_status
  crit_status="$(status_for Critical "${total_crit}")"
  high_status="$(status_for High "${total_high}")"
  med_status="$(status_for Medium "${total_med}")"
  low_status="$(status_for Low "${total_low}")"

  python3 - "$README_FILE" <<PY
from pathlib import Path
import re
import sys

readme = Path(sys.argv[1])
text = readme.read_text(encoding="utf-8")

begin = "<!-- [BEGIN_GENERATED_TABLE] -->"
end = "<!-- [END_GENERATED_TABLE] -->"

replacement = f'''{begin}
### Automated Security Posture

| Severity | Initial Count | Current Count | Status |
| :--- | :---: | :---: | :--- |
| **Critical** | ${BASELINE_CRITICAL} | ${total_crit} | ${crit_status} |
| **High** | ${BASELINE_HIGH} | ${total_high} | ${high_status} |
| **Medium** | ${BASELINE_MEDIUM} | ${total_med} | ${med_status} |
| **Low** | ${BASELINE_LOW} | ${total_low} | ${low_status} |

*Last scanned (UTC): ${timestamp_utc}*
{end}'''

pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.DOTALL)

if not pattern.search(text):
    raise SystemExit("README markers not found. Add BEGIN/END markers under '## Operational Evidence'.")

updated = pattern.sub(replacement, text, count=1)
readme.write_text(updated, encoding="utf-8")
PY
}

require_cmd jq
require_cmd python3
require_cmd docker

init_snyk_tools

# -----------------------------------------------------------------------------
# 1. Build real images
# -----------------------------------------------------------------------------
build_container_images

# -----------------------------------------------------------------------------
# 2. Run scans
# -----------------------------------------------------------------------------

# Dependency scan
run_snyk_capture \
  "snyk-sca" \
  test \
  --all-projects \
  --detection-depth=4 \
  --exclude=tests,node_modules,docs \
  "${ROOT_DIR}"

# SAST
run_snyk_capture \
  "snyk-code" \
  code test \
  "${ROOT_DIR}"

# Built-image container scans
run_snyk_capture \
  "snyk-container-client" \
  container test \
  "${CLIENT_IMAGE_TAG}"

run_snyk_capture \
  "snyk-container-server" \
  container test \
  "${SERVER_IMAGE_TAG}"

# IaC
run_snyk_capture \
  "snyk-iac" \
  iac test \
  "${ROOT_DIR}/k8s" \
  --exclude=tests

# -----------------------------------------------------------------------------
# 3. Parse counts
# -----------------------------------------------------------------------------
read -r sca_crit sca_high sca_med sca_low < <(count_standard_vulns "${SCAN_JSON_FILES[snyk-sca]}")
read -r sast_crit sast_high sast_med sast_low < <(count_sast_issues "${SCAN_JSON_FILES[snyk-code]}")
read -r cc_crit cc_high cc_med cc_low < <(count_standard_vulns "${SCAN_JSON_FILES[snyk-container-client]}")
read -r cs_crit cs_high cs_med cs_low < <(count_standard_vulns "${SCAN_JSON_FILES[snyk-container-server]}")
read -r iac_crit iac_high iac_med iac_low < <(count_iac_issues "${SCAN_JSON_FILES[snyk-iac]}")

total_crit=$((sca_crit + sast_crit + cc_crit + cs_crit + iac_crit))
total_high=$((sca_high + sast_high + cc_high + cs_high + iac_high))
total_med=$((sca_med + sast_med + cc_med + cs_med + iac_med))
total_low=$((sca_low + sast_low + cc_low + cs_low + iac_low))

TIMESTAMP_UTC="$(date -u '+%Y-%m-%d %H:%M')"

# -----------------------------------------------------------------------------
# 4. Write docs + README
# -----------------------------------------------------------------------------
write_index_md "${total_crit}" "${total_high}" "${total_med}" "${total_low}" "${TIMESTAMP_UTC}"
update_readme_block "${total_crit}" "${total_high}" "${total_med}" "${total_low}" "${TIMESTAMP_UTC}"

cat <<EOF

Done.

Aggregate totals:
  Critical: ${total_crit}
  High:     ${total_high}
  Medium:   ${total_med}
  Low:      ${total_low}

Built images scanned:
  ${CLIENT_IMAGE_TAG}
  ${SERVER_IMAGE_TAG}

Artifacts:
  ${DOCS_DIR}/index.md
  ${HTML_DIR}/
  ${README_FILE}
EOF
