#!/usr/bin/env bash
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Snyk security aggregation for this repo
#
# v2 design:
#   - Bash performs orchestration only
#   - Python parses scan outputs and renders docs
#   - Scan metadata is persisted as files under .tmp/snyk-run/
#
# Scans:
#   - SCA:        repo dependency scan via --all-projects
#   - SAST:       entire codebase
#   - Containers: built images from:
#                   - app/docker/Dockerfile.client
#                   - app/docker/Dockerfile.server
#   - IaC:        k8s/ (excluding k8s/tests/)
#
# Outputs:
#   - docs/snyk/html/*.html            (optional, if snyk-to-html is available)
#   - docs/snyk/index.md
#   - README.md generated block between markers
#
# Notes:
#   - SARIF is treated as temporary parse input only; it is not persisted in docs/
#   - JSON scan outputs are persisted in .tmp/snyk-run/scans/ for the Python renderer
#   - Report sanitization is intentionally narrow and only redacts one known
#     Snyk false-positive token pattern found in rule/example metadata
# -----------------------------------------------------------------------------

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APP_DIR="${ROOT_DIR}/app"
DOCS_DIR="${ROOT_DIR}/docs/snyk"
HTML_DIR="${DOCS_DIR}/html"
TMP_ROOT="${ROOT_DIR}/.tmp/snyk-run"
SCAN_DIR="${TMP_ROOT}/scans"
IAC_STAGE_DIR="${TMP_ROOT}/iac-stage"
META_FILE="${TMP_ROOT}/scan-metadata.json"
RENDER_SCRIPT="${ROOT_DIR}/scripts/security/render_snyk_report.py"
BASELINE_FILE="${DOCS_DIR}/baseline.json"

if [[ -f "${ROOT_DIR}/README.md" ]]; then
  README_FILE="${ROOT_DIR}/README.md"
elif [[ -f "${ROOT_DIR}/readme.md" ]]; then
  README_FILE="${ROOT_DIR}/readme.md"
else
  printf '[ERROR] Could not find README file (expected README.md or readme.md in repo root).\n' >&2
  exit 1
fi

SNYK_ORG="${SNYK_ORG:-a.agnaldosilva}"
SNYK_VERSION="${SNYK_VERSION:-1.1296.0}"
SNYK_TO_HTML_VERSION="${SNYK_TO_HTML_VERSION:-2.8.0}"

CLIENT_IMAGE_TAG="${CLIENT_IMAGE_TAG:-file-server-client:snyk}"
SERVER_IMAGE_TAG="${SERVER_IMAGE_TAG:-file-server-server:snyk}"

RUN_SCA="${RUN_SCA:-1}"
RUN_SAST="${RUN_SAST:-1}"
RUN_CONTAINER="${RUN_CONTAINER:-1}"
RUN_IAC="${RUN_IAC:-1}"

WRITE_HTML="${WRITE_HTML:-1}"
UPDATE_README="${UPDATE_README:-1}"

mkdir -p "${DOCS_DIR}" "${HTML_DIR}" "${SCAN_DIR}"

# log prints an informational message prefixed with [INFO].
log() {
  printf '[INFO] %s\n' "$*"
}

# warn writes its arguments as a warning message to stderr prefixed with [WARN].
warn() {
  printf '[WARN] %s\n' "$*" >&2
}

# die prints an error message to stderr and exits with status 1.
die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

# require_cmd ensures the specified executable is available on PATH and exits with an error message if it is not.
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

# require_file ensures the specified path refers to an existing regular file; exits with an error message if it does not.
require_file() {
  [[ -f "$1" ]] || die "Missing required file: $1"
}

# require_dir ensures the specified directory exists; otherwise it aborts with an error.
require_dir() {
  [[ -d "$1" ]] || die "Missing required directory: $1"
}

# cleanup removes the temporary working directory (${TMP_ROOT}) and exits with the original command's exit status.
cleanup() {
  local rc=$?
  rm -rf "${TMP_ROOT}"
  exit "${rc}"
}

trap cleanup EXIT

# usage prints the script usage and documents supported environment variables.
usage() {
  cat <<EOF
Usage: $(basename "$0")

Environment variables:
  SNYK_ORG=...                Snyk org slug
  SNYK_VERSION=...            Snyk CLI version used by npx fallback
  SNYK_TO_HTML_VERSION=...    snyk-to-html version used by npx fallback

  RUN_SCA=1|0                 Enable dependency scanning
  RUN_SAST=1|0                Enable code scanning
  RUN_CONTAINER=1|0           Enable image build + container scanning
  RUN_IAC=1|0                 Enable IaC scanning

  WRITE_HTML=1|0              Generate HTML reports when possible
  UPDATE_README=1|0           Rewrite generated README block

  CLIENT_IMAGE_TAG=...        Local tag for built client image
  SERVER_IMAGE_TAG=...        Local tag for built server image
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_cmd jq
require_cmd python3
require_cmd rsync

require_dir "${DOCS_DIR}"
require_file "${BASELINE_FILE}"
require_file "${RENDER_SCRIPT}"

if [[ "${RUN_SCA}" == "1" || "${RUN_SAST}" == "1" || "${RUN_CONTAINER}" == "1" ]]; then
  require_dir "${APP_DIR}"
fi

if [[ "${RUN_CONTAINER}" == "1" ]]; then
  require_cmd docker
  require_file "${APP_DIR}/docker/Dockerfile.client"
  require_file "${APP_DIR}/docker/Dockerfile.server"
fi

if [[ "${RUN_IAC}" == "1" ]]; then
  require_dir "${ROOT_DIR}/k8s"
fi

# init_snyk_tools initializes SNYK_CMD and SNYK_TO_HTML_CMD to the appropriate command invocations for `snyk` and `snyk-to-html`, preferring locally installed binaries and falling back to `npx` with the configured versions; if `snyk` is absent `npx` is required, and if `snyk-to-html` is unavailable and `npx` is not present `SNYK_TO_HTML_CMD` is left empty.
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

snyk_args_common=()
if [[ -n "${SNYK_ORG}" ]]; then
  snyk_args_common+=(--org="${SNYK_ORG}")
fi

# sanitize_report_file redacts Snyk token-shaped sample values (in-place) from the given report file if it is non-empty.
sanitize_report_file() {
  local report_file="$1"
  [[ -s "${report_file}" ]] || return 0

  # Intentionally narrow redaction:
  # Snyk Code rule/example metadata may embed token-shaped sample values that can
  # trigger secret scanners on generated artifacts. We only redact this one known
  # false-positive pattern rather than applying broad generic secret masking.
  perl -i -pe 's/SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/SG.REDACTED.REDACTED/g' "${report_file}"
}

# maybe_html generates an HTML report from a Snyk JSON output when HTML generation is enabled and snyk-to-html is available.
# It accepts the input JSON path as the first argument and the desired output HTML path as the second argument; if rendering fails or the tool is unavailable it emits a warning.
maybe_html() {
  local in_json="$1"
  local out_html="$2"

  [[ "${WRITE_HTML}" == "1" ]] || return 0

  if [[ ${#SNYK_TO_HTML_CMD[@]} -gt 0 ]]; then
    "${SNYK_TO_HTML_CMD[@]}" -i "${in_json}" -o "${out_html}" >/dev/null 2>&1 || \
      warn "Failed to render HTML report for ${in_json}"
  else
    warn "snyk-to-html not found; skipping HTML generation for ${in_json}"
  fi
}

# write_metadata_entry appends a scan entry to the metadata JSON file (META_FILE), creating the file with a `scans` array if missing; the entry includes name, kind, json_path, html_path, source_ref, parse_input_path, and parse_input_format.
write_metadata_entry() {
  local name="$1"
  local kind="$2"
  local json_path="$3"
  local html_path="$4"
  local source_ref="$5"
  local parse_input_path="$6"
  local parse_input_format="$7"

  python3 - "${META_FILE}" "${name}" "${kind}" "${json_path}" "${html_path}" "${source_ref}" "${parse_input_path}" "${parse_input_format}" <<'PY'
import json
import sys
from pathlib import Path

meta_path = Path(sys.argv[1])
name = sys.argv[2]
kind = sys.argv[3]
json_path = sys.argv[4]
html_path = sys.argv[5]
source_ref = sys.argv[6]
parse_input_path = sys.argv[7]
parse_input_format = sys.argv[8]
repo_root = meta_path.resolve().parents[2]


def to_repo_relative(path_value: str) -> str | None:
    if not path_value:
        return None
    path = Path(path_value).resolve()
    return str(path.relative_to(repo_root))

if meta_path.exists():
    data = json.loads(meta_path.read_text(encoding="utf-8"))
else:
    data = {"scans": []}

data["scans"].append({
    "name": name,
    "kind": kind,
    "json_path": to_repo_relative(json_path),
    "html_path": to_repo_relative(html_path),
    "source_ref": source_ref,
    "parse_input_path": to_repo_relative(parse_input_path),
    "parse_input_format": parse_input_format,
})

meta_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
}

# run_snyk_capture runs a Snyk scan identified by `name` and records its outputs and metadata.
# It executes the Snyk command with the provided arguments and writes a JSON report to .tmp/snyk-run/scans/<name>.json and a SARIF temp file to .tmp/snyk-run/<name>.sarif.tmp.
# For `sast` scans the SARIF file is used as the parse input; for other kinds the JSON file is used. If an output is empty a minimal placeholder file is created.
# If WRITE_HTML=1 it will attempt to render an HTML report and place it under docs/snyk/html/<name>.html when available.
# On an execution error (Snyk exit code greater than 1) the function aborts the script; otherwise it records a metadata entry with name, kind, report paths, source_ref, parse_input_path, and parse_input_format.
run_snyk_capture() {
  local name="$1"
  local kind="$2"
  local source_ref="$3"
  shift 3

  local json_out="${SCAN_DIR}/${name}.json"
  local sarif_tmp="${TMP_ROOT}/${name}.sarif.tmp"
  local html_out="${HTML_DIR}/${name}.html"

  local parse_input_path=""
  local parse_input_format=""
  local html_input=""
  local html_path=""

  log "Running Snyk scan: ${name}"

  set +e
  "${SNYK_CMD[@]}" "$@" \
    "${snyk_args_common[@]}" \
    --json-file-output="${json_out}" \
    --sarif-file-output="${sarif_tmp}"
  local rc=$?
  set -e

  # Snyk:
  # 0 = no issues
  # 1 = issues found
  # >1 = execution error
  if [[ ${rc} -gt 1 ]]; then
    die "Snyk command failed for ${name} with exit code ${rc}"
  fi

  sanitize_report_file "${json_out}"
  sanitize_report_file "${sarif_tmp}"

  case "${kind}" in
    sast)
      # Snyk Code reporting should parse from SARIF temp input.
      if [[ ! -s "${sarif_tmp}" ]]; then
        warn "Empty SARIF output for ${name}; creating placeholder."
        printf '{"runs":[]}\n' > "${sarif_tmp}"
      fi
      parse_input_path="${sarif_tmp}"
      parse_input_format="sarif"
      html_input="${sarif_tmp}"
      ;;

    *)
      if [[ ! -s "${json_out}" ]]; then
        warn "Empty JSON output for ${name}; creating placeholder."
        printf '{}\n' > "${json_out}"
      fi
      parse_input_path="${json_out}"
      parse_input_format="json"
      html_input="${json_out}"
      ;;
  esac

  if [[ "${WRITE_HTML}" == "1" ]]; then
    maybe_html "${html_input}" "${html_out}"
    if [[ -f "${html_out}" ]]; then
      html_path="${html_out}"
    fi
  fi

  write_metadata_entry \
    "${name}" \
    "${kind}" \
    "${json_out}" \
    "${html_path}" \
    "${source_ref}" \
    "${parse_input_path}" \
    "${parse_input_format}"
}

# build_container_images builds Docker images for the client and server from the Dockerfiles in "${APP_DIR}/docker" and tags them with "${CLIENT_IMAGE_TAG}" and "${SERVER_IMAGE_TAG}" respectively.
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

# prepare_iac_scan_dir creates the IaC staging directory and synchronizes the repository's k8s/ contents into it, excluding any tests/ subdirectory.
prepare_iac_scan_dir() {
  local src="${ROOT_DIR}/k8s"
  local dst="${IAC_STAGE_DIR}/k8s"

  rm -rf "${IAC_STAGE_DIR}"
  mkdir -p "${dst}"
  rsync -a --exclude 'tests/' "${src}/" "${dst}/"
}

init_snyk_tools
echo '{"scans":[]}' > "${META_FILE}"

if [[ "${RUN_CONTAINER}" == "1" ]]; then
  build_container_images
fi

if [[ "${RUN_SCA}" == "1" ]]; then
  run_snyk_capture \
    "snyk-sca" \
    "sca" \
    "${ROOT_DIR}" \
    test \
    --all-projects \
    --detection-depth=4 \
    --exclude=tests,node_modules,docs,tmp \
    "${ROOT_DIR}"
fi

if [[ "${RUN_SAST}" == "1" ]]; then
  run_snyk_capture \
    "snyk-code" \
    "sast" \
    "${ROOT_DIR}" \
    code test \
    "${ROOT_DIR}"
fi

if [[ "${RUN_CONTAINER}" == "1" ]]; then
  run_snyk_capture \
    "snyk-container-client" \
    "container" \
    "${CLIENT_IMAGE_TAG}" \
    container test \
    "${CLIENT_IMAGE_TAG}"

  run_snyk_capture \
    "snyk-container-server" \
    "container" \
    "${SERVER_IMAGE_TAG}" \
    container test \
    "${SERVER_IMAGE_TAG}"
fi

if [[ "${RUN_IAC}" == "1" ]]; then
  prepare_iac_scan_dir

  run_snyk_capture \
    "snyk-iac" \
    "iac" \
    ".tmp/snyk-run/iac-stage/k8s" \
    iac test \
    "${IAC_STAGE_DIR}/k8s"
fi

TIMESTAMP_UTC="$(date -u '+%Y-%m-%d %H:%M')"

log "Rendering consolidated report"
python3 "${RENDER_SCRIPT}" \
  --metadata "${META_FILE}" \
  --baseline "${BASELINE_FILE}" \
  --docs-dir "${DOCS_DIR}" \
  --html-dir "${HTML_DIR}" \
  --readme "${README_FILE}" \
  --timestamp-utc "${TIMESTAMP_UTC}" \
  --update-readme "${UPDATE_README}"

cat <<EOF

Done.

Artifacts:
  ${DOCS_DIR}/index.md
  ${HTML_DIR}/
  ${README_FILE}
EOF
