#!/bin/bash

# Ensure we are in project root (check for package.json)
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory (where package.json is)."
    exit 1
fi

ZIP_FILE=$1

if [ -z "$ZIP_FILE" ]; then
    echo "Usage: ./deploy/patch_source.sh <path_to_zip_file>"
    echo "Example: ./deploy/patch_source.sh deploy/update.zip"
    exit 1
fi

if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Error: File $ZIP_FILE not found."
    exit 1
fi

TMP_DIR="deploy/tmp_extract"
echo "🧹 Cleaning up temp directories..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "📦 Unzipping $ZIP_FILE..."
if ! unzip -q "$ZIP_FILE" -d "$TMP_DIR"; then
    echo "❌ Error: Failed to unzip file."
    exit 1
fi

# Determine the actual root of the extracted files
# (Handles cases where zip contains a single top-level folder like 'vocab-pro-main/')
EXTRACTED_ROOT="$TMP_DIR"
COUNT=$(ls -1 "$TMP_DIR" | wc -l)
if [ "$COUNT" -eq 1 ]; then
    ITEM=$(ls -1 "$TMP_DIR")
    if [ -d "$TMP_DIR/$ITEM" ]; then
        EXTRACTED_ROOT="$TMP_DIR/$ITEM"
        echo "📂 Detected nested root folder: $ITEM"
    fi
fi

# Conflict Detection: .env.local
if [ -f ".env.local" ] && [ -f "$EXTRACTED_ROOT/.env.local" ]; then
    echo "--------------------------------------------------------"
    echo "⚠️  CONFLICT DETECTED: .env.local"
    echo "--------------------------------------------------------"
    echo "Your local configuration differs from the update."
    echo "Difference (Local < vs > Update):"
    diff ".env.local" "$EXTRACTED_ROOT/.env.local" | head -n 10
    echo "..."
    echo "--------------------------------------------------------"
    
    read -p "Do you want to OVERWRITE your local .env.local? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "🛡️  Keeping your local .env.local (Removing from update payload...)"
        rm "$EXTRACTED_ROOT/.env.local"
    else
        echo "⚠️  Overwriting .env.local with new version."
    fi
fi

# Conflict Detection: metadata.json (optional, but good practice)
if [ -f "metadata.json" ] && [ -f "$EXTRACTED_ROOT/metadata.json" ]; then
    # We usually overwrite metadata.json as it contains app structure, but let's just log it
    echo "ℹ️  Updating metadata.json..."
fi

echo "🚀 Patching source code..."
# Copy all files from extracted root to current directory
# -a: archive mode (preserves permissions, etc)
# -v: verbose
cp -a "$EXTRACTED_ROOT/." .

echo "🧹 Cleaning up..."
rm -rf "$TMP_DIR"

echo "✅ Update complete! You can now run ./deploy/deploy.sh or ./deploy/deploy_docker.sh"
