#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="${APP_DIR}/server"
COMPOSE_FILE="${APP_DIR}/docker-compose.test-db.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run this script." >&2
  exit 1
fi

TEST_DB_PORT="${TEST_DB_PORT:-5433}"
TEST_DB_USER="${TEST_DB_USER:-postgres}"
TEST_DB_NAME="${TEST_DB_NAME:-prescriptions_test}"

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  elif [ -r /dev/urandom ]; then
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
  else
    date +%s%N
  fi
}

if [ -z "${TEST_DB_PASS:-}" ]; then
  TEST_DB_PASS="$(generate_secret)"
fi

cleanup() {
  docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
}

trap cleanup EXIT

printf "Starting Postgres via docker compose...\n"

TEST_DB_PORT="$TEST_DB_PORT" \
TEST_DB_USER="$TEST_DB_USER" \
TEST_DB_PASS="$TEST_DB_PASS" \
TEST_DB_NAME="$TEST_DB_NAME" \
docker compose -f "$COMPOSE_FILE" up -d

printf "Waiting for Postgres to be ready...\n"

READY=0
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T test-postgres \
    pg_isready -U "$TEST_DB_USER" -d "$TEST_DB_NAME" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "Postgres did not become ready in time." >&2
  exit 1
fi

printf "Running audit integration test...\n"

cd "$SERVER_DIR"
TEST_DB_HOST=localhost \
TEST_DB_PORT="$TEST_DB_PORT" \
TEST_DB_USER="$TEST_DB_USER" \
TEST_DB_PASS="$TEST_DB_PASS" \
TEST_DB_NAME="$TEST_DB_NAME" \
npm test -- tests/integration/audit.repository.test.js
