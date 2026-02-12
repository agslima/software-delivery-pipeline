#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE is required (e.g. repo/backend:tag)}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE is required (e.g. repo/frontend:tag)}"
PLATFORM="${PLATFORM:-linux/amd64}"

BUILD_DATE="${BUILD_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%SZ") }"
VCS_REF="${VCS_REF:-$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}"
SOURCE="${SOURCE:-$(git -C "$APP_DIR" config --get remote.origin.url 2>/dev/null || echo unknown)}"
VERSION="${VERSION:-$VCS_REF}"

SBOM_DIR="${SBOM_DIR:-$APP_DIR/artifacts/sbom}"
SIGN_IMAGES="${SIGN_IMAGES:-false}"

mkdir -p "$SBOM_DIR"

build_image() {
  local dockerfile=$1
  local image=$2

  DOCKER_BUILDKIT=1 docker build \
    --pull \
    --platform "$PLATFORM" \
    -f "$dockerfile" \
    -t "$image" \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --build-arg VCS_REF="$VCS_REF" \
    --build-arg VERSION="$VERSION" \
    --build-arg SOURCE="$SOURCE" \
    "$APP_DIR"
}

printf "Building backend image...\n"
build_image "$APP_DIR/docker/Dockerfile.server" "$BACKEND_IMAGE"

printf "Building frontend image...\n"
build_image "$APP_DIR/docker/Dockerfile.client" "$FRONTEND_IMAGE"

if command -v syft >/dev/null 2>&1; then
  printf "Generating SBOMs...\n"
  syft "$BACKEND_IMAGE" -o spdx-json > "$SBOM_DIR/backend.spdx.json"
  syft "$FRONTEND_IMAGE" -o spdx-json > "$SBOM_DIR/frontend.spdx.json"
else
  printf "syft not found; skipping SBOM generation.\n"
fi

if [ "$SIGN_IMAGES" = "true" ]; then
  if command -v cosign >/dev/null 2>&1; then
    printf "Signing images...\n"
    cosign sign --yes "$BACKEND_IMAGE"
    cosign sign --yes "$FRONTEND_IMAGE"
  else
    printf "cosign not found; skipping image signing.\n"
  fi
fi

printf "Build complete.\n"
