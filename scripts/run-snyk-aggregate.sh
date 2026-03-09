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
#   - docs/snyk/raw/*.json
#   - docs/snyk/raw/*.sarif
#   - docs/snyk/html/*.html (if snyk-to-html is installed)
#   - docs/snyk/index.md
#   - README.md generated table between markers
# -----------------------------------------------------------------------------

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APP_DIR="${ROOT_DIR}/app"
DOCS_DIR="${ROOT_DIR}/docs/snyk"
RAW_DIR="${DOCS_DIR}/raw"
HTML_DIR="${DOCS_DIR}/html"
if [[ -f "${ROOT_DIR}/readme.md" ]]; then
  README_FILE="${ROOT_DIR}/readme.md"
elif [[ -f "${ROOT_DIR}/README.md" ]]; then
  README_FILE="${ROOT_DIR}/README.md"
else
  printf '[ERROR] Could not find README file (expected readme.md or README.md in repo root).\n' >&2
  exit 1
fi

SNYK_ORG="${SNYK_ORG:-7b9d0e67}"
SNYK_VERSION="${SNYK_VERSION:-1.1296.0}"
SNYK_TO_HTML_VERSION="${SNYK_TO_HTML_VERSION:-2.8.0}"

# Built image tags used only for scanning in this script.
CLIENT_IMAGE_TAG="${CLIENT_IMAGE_TAG:-file-server-client:snyk}"
SERVER_IMAGE_TAG="${SERVER_IMAGE_TAG:-file-server-server:snyk}"

BASELINE_CRITICAL="${BASELINE_CRITICAL:-27}"
BASELINE_HIGH="${BASELINE_HIGH:-116}"
BASELINE_MEDIUM="${BASELINE_MEDIUM:-191}"
BASELINE_LOW="${BASELINE_LOW:-345}"

mkdir -p "${RAW_DIR}" "${HTML_DIR}"

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

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

snyk_args_common=()
if [[ -n "${SNYK_ORG}" ]]; then
  snyk_args_common+=(--org="${SNYK_ORG}")
fi

run_snyk_capture() {
  local name="$1"
  shift

  local json_out="${RAW_DIR}/${name}.json"
  local sarif_out="${RAW_DIR}/${name}.sarif"

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

  maybe_html "${json_out}" "${HTML_DIR}/${name}.html"

  if [[ ! -s "${json_out}" ]]; then
    warn "Empty JSON output for ${name}; creating placeholder."
    echo '{}' > "${json_out}"
  fi
}

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

write_index_md() {
  local total_crit="$1"
  local total_high="$2"
  local total_med="$3"
  local total_low="$4"
  local timestamp_utc="$5"

  cat > "${DOCS_DIR}/index.md" <<EOF
# Snyk Scans

This directory contains the raw and rendered outputs for the current repository security posture.

## Aggregate Summary

| Severity | Count |
| :--- | ---: |
| Critical | ${total_crit} |
| High | ${total_high} |
| Medium | ${total_med} |
| Low | ${total_low} |

## Scan Artifacts

### SCA (Dependencies)

| Target | JSON | HTML |
| :--- | :--- | :--- |
| repository dependency scan | [snyk-sca.json](raw/snyk-sca.json) | $( [[ -f "${HTML_DIR}/snyk-sca.html" ]] && echo "[snyk-sca.html](html/snyk-sca.html)" || echo "-" ) |

### SAST

| Target | JSON | HTML |
| :--- | :--- | :--- |
| repository code scan | [snyk-code.json](raw/snyk-code.json) | $( [[ -f "${HTML_DIR}/snyk-code.html" ]] && echo "[snyk-code.html](html/snyk-code.html)" || echo "-" ) |

### Containers

| Target | JSON | HTML |
| :--- | :--- | :--- |
| ${CLIENT_IMAGE_TAG} | [snyk-container-client.json](raw/snyk-container-client.json) | $( [[ -f "${HTML_DIR}/snyk-container-client.html" ]] && echo "[snyk-container-client.html](html/snyk-container-client.html)" || echo "-" ) |
| ${SERVER_IMAGE_TAG} | [snyk-container-server.json](raw/snyk-container-server.json) | $( [[ -f "${HTML_DIR}/snyk-container-server.html" ]] && echo "[snyk-container-server.html](html/snyk-container-server.html)" || echo "-" ) |

### IaC

| Target | JSON | HTML |
| :--- | :--- | :--- |
| k8s/ | [snyk-iac.json](raw/snyk-iac.json) | $( [[ -f "${HTML_DIR}/snyk-iac.html" ]] && echo "[snyk-iac.html](html/snyk-iac.html)" || echo "-" ) |

## Notes

- Counts are aggregated across SCA, SAST, container, and IaC scans.
- Container findings come from real built local images, not Dockerfile-only analysis.
- Generated at: ${timestamp_utc} UTC
EOF
}

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
read -r sca_crit sca_high sca_med sca_low < <(count_standard_vulns "${RAW_DIR}/snyk-sca.json")
read -r sast_crit sast_high sast_med sast_low < <(count_sast_issues "${RAW_DIR}/snyk-code.json")
read -r cc_crit cc_high cc_med cc_low < <(count_standard_vulns "${RAW_DIR}/snyk-container-client.json")
read -r cs_crit cs_high cs_med cs_low < <(count_standard_vulns "${RAW_DIR}/snyk-container-server.json")
read -r iac_crit iac_high iac_med iac_low < <(count_iac_issues "${RAW_DIR}/snyk-iac.json")

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
  ${RAW_DIR}/
  ${HTML_DIR}/
  ${README_FILE}
EOF
