#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

MODE="${RESTORE_MODE:-compose}"
BACKUP_FILE="${1:-${BACKUP_FILE:-}}"

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

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 /path/to/backup.dump[.enc]" >&2
  exit 1
fi

if [ "${CONFIRM_RESTORE:-false}" != "true" ]; then
  echo "Refusing to restore without CONFIRM_RESTORE=true" >&2
  exit 1
fi

TEMP_FILE=""

cleanup() {
  if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
    rm -f "$TEMP_FILE"
  fi
}

trap cleanup EXIT

if [[ "$BACKUP_FILE" == *.enc ]]; then
  if [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ] && [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    BACKUP_ENCRYPTION_KEY="$(cat "${BACKUP_ENCRYPTION_KEY_FILE}")"
  fi

  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "BACKUP_ENCRYPTION_KEY is required to decrypt backup." >&2
    exit 1
  fi

  require_command openssl
  TEMP_FILE="$(mktemp)"
  openssl enc -d -aes-256-gcm -salt -pbkdf2 -iter 100000 \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
    -in "$BACKUP_FILE" \
    -out "$TEMP_FILE"
  BACKUP_FILE="$TEMP_FILE"
fi

require_command pg_restore

restore_direct() {
  if [ -n "${DB_PASS_FILE:-}" ] && [ -z "${DB_PASS:-}" ]; then
    DB_PASS="$(cat "${DB_PASS_FILE}")"
  elif [ -z "${DB_PASS:-}" ] && [ -f "${APP_DIR}/secrets/db_pass.txt" ]; then
    DB_PASS="$(cat "${APP_DIR}/secrets/db_pass.txt")"
  fi

  if [ -z "${DB_PASS:-}" ]; then
    echo "DB_PASS or DB_PASS_FILE is required for direct mode." >&2
    exit 1
  fi

  PGPASSWORD="$DB_PASS" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    --clean --if-exists --no-owner --dbname "$DB_NAME" "$BACKUP_FILE"
}

restore_compose() {
  require_command docker
  cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
    pg_restore -U "${DB_USER}" --clean --if-exists --no-owner --dbname "${DB_NAME}"
}

printf "Restoring backup %s into %s...\n" "$BACKUP_FILE" "$DB_NAME"

if [ "$MODE" = "direct" ]; then
  restore_direct
else
  restore_compose
fi

printf "Restore complete.\n"
