#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

MODE="${BACKUP_MODE:-compose}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_NAME="${BACKUP_NAME:-prescriptions_${TIMESTAMP}.dump}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-prescriptions_db}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

mkdir -p "$BACKUP_DIR"

require_command pg_dump

run_pg_dump_direct() {
  if [ -n "${DB_PASS_FILE:-}" ] && [ -z "${DB_PASS:-}" ]; then
    DB_PASS="$(cat "${DB_PASS_FILE}")"
  elif [ -z "${DB_PASS:-}" ] && [ -f "${APP_DIR}/secrets/db_pass.txt" ]; then
    DB_PASS="$(cat "${APP_DIR}/secrets/db_pass.txt")"
  fi

  if [ -z "${DB_PASS:-}" ]; then
    echo "DB_PASS or DB_PASS_FILE is required for direct mode." >&2
    exit 1
  fi

  PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_PATH"
}

run_pg_dump_compose() {
  require_command docker
  docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
    pg_dump -U "${DB_USER}" -Fc "${DB_NAME}" > "$BACKUP_PATH"
}

printf "Creating backup at %s...\n" "$BACKUP_PATH"

if [ "$MODE" = "direct" ]; then
  run_pg_dump_direct
else
  run_pg_dump_compose
fi

if [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ] && [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  BACKUP_ENCRYPTION_KEY="$(cat "${BACKUP_ENCRYPTION_KEY_FILE}")"
fi

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  require_command openssl
  openssl enc -aes-256-gcm -salt -pbkdf2 -iter 100000 \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
    -in "$BACKUP_PATH" \
    -out "${BACKUP_PATH}.enc"
  rm -f "$BACKUP_PATH"
  BACKUP_PATH="${BACKUP_PATH}.enc"
  printf "Encrypted backup written to %s\n" "$BACKUP_PATH"
else
  if [ "${BACKUP_REQUIRE_ENCRYPTION:-false}" = "true" ]; then
    echo "BACKUP_REQUIRE_ENCRYPTION=true but no BACKUP_ENCRYPTION_KEY provided." >&2
    exit 1
  fi
  printf "Backup written to %s (unencrypted)\n" "$BACKUP_PATH"
fi
