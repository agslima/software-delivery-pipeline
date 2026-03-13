#!/usr/bin/env sh
set -eu

# Generate a local self-signed certificate pair for the demo Nginx entrypoint when no certs exist.
CERT_DIR="${NGINX_CERT_DIR:-/tmp/nginx-certs}"
CERT_FILE="${CERT_DIR}/tls.crt"
KEY_FILE="${CERT_DIR}/tls.key"

if [ -s "$CERT_FILE" ] && [ -s "$KEY_FILE" ]; then
  exit 0
fi

mkdir -p "$CERT_DIR"
umask 077

openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" >/dev/null 2>&1
