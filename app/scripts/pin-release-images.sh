#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="${OUTPUT_FILE:-${APP_DIR}/.env.release}"

BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE is required (e.g. repo/backend:tag)}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE is required (e.g. repo/frontend:tag)}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command docker

resolve_digest() {
  local image=$1
  local digest
  docker pull "$image" >/dev/null
  digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$image")
  if [ -z "$digest" ]; then
    echo "Failed to resolve digest for $image" >&2
    exit 1
  fi
  echo "$digest"
}

BACKEND_DIGEST=$(resolve_digest "$BACKEND_IMAGE")
FRONTEND_DIGEST=$(resolve_digest "$FRONTEND_IMAGE")

cat <<EOF2 > "$OUTPUT_FILE"
# Release image digests
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
BACKEND_IMAGE=$BACKEND_DIGEST
FRONTEND_IMAGE=$FRONTEND_DIGEST
EOF2

printf "Wrote %s\n" "$OUTPUT_FILE"
