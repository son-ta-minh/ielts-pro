#!/bin/sh

# Create a directory for the certificates if it doesn't exist
CERTS_DIR="./certs"
if [ ! -d "$CERTS_DIR" ]; then
    mkdir -p "$CERTS_DIR"
fi

# Check if certificate and key already exist
KEY_FILE="$CERTS_DIR/localhost.key"
CERT_FILE="$CERTS_DIR/localhost.crt"

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    echo "Certificates already exist. Skipping generation."
    exit 0
fi

# Generate the private key and self-signed certificate
echo "Generating self-signed certificate..."
openssl req -x509 -newkey rsa:4096 -nodes -sha256 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -days 365 \
  -subj "/C=US/ST=California/L=San Francisco/O=MyProject/OU=Dev/CN=localhost"

echo "Certificates generated successfully in $CERTS_DIR"
