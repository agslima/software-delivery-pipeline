#!/usr/bin/env bash
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Local Trivy scan for this repo
#
# Purpose:
#   - Run local Trivy scans without generating output files
#   - Support one or more scan modes in a single invocation
#
# Supported modes:
#   - fs      : filesystem vulnerability + secret + misconfig scan
#   - config  : IaC / config misconfiguration scan only
#   - image   : local container image scan
#
# Examples:
#   ./scripts/trivy-scan.sh
#   TRIVY_SCAN_MODES=fs ./scripts/trivy-scan.sh
#   TRIVY_SCAN_MODES=config ./scripts/trivy-scan.sh
#   TRIVY_SCAN_MODES=fs,config ./scripts/trivy-scan.sh
#   TRIVY_SCAN_MODES=image TRIVY_IMAGE_REF=file-server-server:local ./scripts/trivy-scan.sh
#
# Notes:
#   - This script is intentionally local-only
#   - It prints results to stdout/stderr and does not write report files
# -----------------------------------------------------------------------------

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

TRIVY_SCAN_MODES="${TRIVY_SCAN_MODES:-fs,config}"
TRIVY_SCAN_PATH="${TRIVY_SCAN_PATH:-${ROOT_DIR}}"
TRIVY_IMAGE_REF="${TRIVY_IMAGE_REF:-}"
TRIVY_SEVERITY="${TRIVY_SEVERITY:-CRITICAL,HIGH,MEDIUM}"
TRIVY_EXIT_CODE="${TRIVY_EXIT_CODE:-0}"
TRIVY_TIMEOUT="${TRIVY_TIMEOUT:-10m}"

# fs scanners: vuln,secret,misconfig
TRIVY_FS_SCANNERS="${TRIVY_FS_SCANNERS:-vuln,secret,misconfig}"

# config scanners are misconfig-focused
TRIVY_CONFIG_SEVERITY="${TRIVY_CONFIG_SEVERITY:-CRITICAL,HIGH,MEDIUM}"

# Common excludes for repo-local scans
TRIVY_SKIP_DIRS="${TRIVY_SKIP_DIRS:-node_modules,.git,.tmp,dist,build,coverage,vendor}"
TRIVY_SKIP_FILES="${TRIVY_SKIP_FILES:-}"

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

require_dir() {
  [[ -d "$1" ]] || die "Missing required directory: $1"
}

usage() {
  cat <<EOF
Usage: $(basename "$0")

Environment variables:
  TRIVY_SCAN_MODES=fs,config,image   Comma-separated modes to run
  TRIVY_SCAN_PATH=/path/to/target    Filesystem/config scan root (default: repo root)
  TRIVY_IMAGE_REF=image:tag          Local image reference for image mode
  TRIVY_SEVERITY=CRITICAL,HIGH,...   Severity filter for fs/image
  TRIVY_CONFIG_SEVERITY=...          Severity filter for config mode
  TRIVY_EXIT_CODE=0|1                Exit code when findings are found
  TRIVY_TIMEOUT=10m                  Trivy timeout
  TRIVY_FS_SCANNERS=vuln,secret,...  Scanners for fs mode
  TRIVY_SKIP_DIRS=...                Comma-separated directories to skip
  TRIVY_SKIP_FILES=...               Comma-separated files to skip

Examples:
  $(basename "$0")
  TRIVY_SCAN_MODES=fs $(basename "$0")
  TRIVY_SCAN_MODES=config $(basename "$0")
  TRIVY_SCAN_MODES=fs,config $(basename "$0")
  TRIVY_SCAN_MODES=image TRIVY_IMAGE_REF=file-server-server:local $(basename "$0")
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_cmd trivy
require_dir "${TRIVY_SCAN_PATH}"

IFS=',' read -r -a SCAN_MODES <<< "${TRIVY_SCAN_MODES}"
IFS=',' read -r -a SKIP_DIRS <<< "${TRIVY_SKIP_DIRS}"
IFS=',' read -r -a SKIP_FILES <<< "${TRIVY_SKIP_FILES}"

build_skip_args() {
  local -n out_ref=$1
  out_ref=()

  local dir
  for dir in "${SKIP_DIRS[@]}"; do
    [[ -n "${dir// }" ]] || continue
    out_ref+=(--skip-dirs "${dir}")
  done

  local file
  for file in "${SKIP_FILES[@]}"; do
    [[ -n "${file// }" ]] || continue
    out_ref+=(--skip-files "${file}")
  done
}

run_fs_scan() {
  local skip_args=()
  build_skip_args skip_args

  log "Running Trivy filesystem scan on: ${TRIVY_SCAN_PATH}"
  trivy fs \
    --scanners "${TRIVY_FS_SCANNERS}" \
    --severity "${TRIVY_SEVERITY}" \
    --timeout "${TRIVY_TIMEOUT}" \
    --exit-code "${TRIVY_EXIT_CODE}" \
    "${skip_args[@]}" \
    "${TRIVY_SCAN_PATH}"
}

run_config_scan() {
  local skip_args=()
  build_skip_args skip_args

  log "Running Trivy config scan on: ${TRIVY_SCAN_PATH}"
  trivy config \
    --severity "${TRIVY_CONFIG_SEVERITY}" \
    --timeout "${TRIVY_TIMEOUT}" \
    --exit-code "${TRIVY_EXIT_CODE}" \
    "${skip_args[@]}" \
    "${TRIVY_SCAN_PATH}"
}

run_image_scan() {
  [[ -n "${TRIVY_IMAGE_REF}" ]] || die "TRIVY_IMAGE_REF is required when TRIVY_SCAN_MODES includes image"

  log "Running Trivy image scan on: ${TRIVY_IMAGE_REF}"
  trivy image \
    --severity "${TRIVY_SEVERITY}" \
    --timeout "${TRIVY_TIMEOUT}" \
    --exit-code "${TRIVY_EXIT_CODE}" \
    "${TRIVY_IMAGE_REF}"
}

normalize_mode() {
  local mode="$1"
  printf '%s' "${mode}" | tr '[:upper:]' '[:lower:]' | xargs
}

main() {
  local seen_fs=0
  local seen_config=0
  local seen_image=0

  local raw_mode mode
  for raw_mode in "${SCAN_MODES[@]}"; do
    mode="$(normalize_mode "${raw_mode}")"

    case "${mode}" in
      fs)
        if [[ ${seen_fs} -eq 0 ]]; then
          run_fs_scan
          seen_fs=1
        fi
        ;;
      config|conf)
        if [[ ${seen_config} -eq 0 ]]; then
          run_config_scan
          seen_config=1
        fi
        ;;
      image)
        if [[ ${seen_image} -eq 0 ]]; then
          run_image_scan
          seen_image=1
        fi
        ;;
      "")
        ;;
      *)
        die "Unsupported scan mode: ${mode}. Supported modes: fs, config, image"
        ;;
    esac
  done
}

main "$@"
