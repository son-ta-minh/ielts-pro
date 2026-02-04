#!/bin/bash

# Generates certificates for localhost development
# Tries mkcert first (trusted), falls back to openssl (self-signed)

CERT_DIR=".certs"
mkdir -p "$CERT_DIR"

# Clean old certs
rm -f "$CERT_DIR"/*.pem

echo "[INFO] Checking for mkcert..."

if command -v mkcert &> /dev/null; then
    echo "[INFO] mkcert found. Generating trusted certificate..."
    cd "$CERT_DIR"
    mkcert -install
    mkcert localhost 127.0.0.1 ::1
    echo "[SUCCESS] Trusted certificates generated in $CERT_DIR"
else
    echo "[INFO] mkcert not found. Falling back to OpenSSL (Self-Signed)..."
    openssl req -x509 -newkey rsa:2048 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days 365 -nodes \
        -subj "/C=US/ST=Dev/L=Local/O=VocabPro/CN=localhost"
    echo "[SUCCESS] Self-signed certificates generated in $CERT_DIR"
    echo "[WARN] You will need to bypass browser security warnings for this certificate."
fi
