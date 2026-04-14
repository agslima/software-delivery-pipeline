#!/usr/bin/env bash
set -euo pipefail

TARGET=$1
NAME=$2
OUT_DIR=$3
ZAP_IMG=$4

docker run --rm \
  --network host \
  -v "$OUT_DIR:/zap/wrk/:rw" \
  "$ZAP_IMG" zap-baseline.py \
  -t "$TARGET" \
  -n /zap/wrk/context.context \
  -c /zap/wrk/rules.tsv \
  -r "zap-${NAME}.html" \
  -J "zap-${NAME}.json" \
  -I || true

test -s "$OUT_DIR/zap-${NAME}.json"
jq -e 'type=="object"' "$OUT_DIR/zap-${NAME}.json" >/dev/null
