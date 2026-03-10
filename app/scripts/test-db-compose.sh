#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${APP_DIR}/docker-compose.test-db.yml"

ACTION="${1:-up}"

# generate_secret generates a 16-byte hexadecimal secret and writes it to stdout, preferring openssl, then /dev/urandom, and falling back to a timestamp if neither is available.
generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  elif [[ -r /dev/urandom ]]; then
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
  else
    date +%s%N
  fi
}

if [[ -z "${TEST_DB_PASS:-}" ]]; then
  export TEST_DB_PASS
  TEST_DB_PASS="$(generate_secret)"
fi

case "$ACTION" in
  up)
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  reset)
    docker compose -f "$COMPOSE_FILE" down -v
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  *)
    echo "Usage: $0 {up|down|reset|status}"
    exit 1
    ;;
 esac
