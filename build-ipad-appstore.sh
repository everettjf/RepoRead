#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-YPV49M8592}"
# Support multiple common env var names.
APPLE_ID="${APPLE_ID:-${APPSTORE_CONNECT_APPLE_ID:-${ASC_APPLE_ID:-}}}"
APP_SPECIFIC_PASSWORD="${APP_SPECIFIC_PASSWORD:-${APPSTORE_CONNECT_APP_SPECIFIC_PASSWORD:-${ASC_APP_SPECIFIC_PASSWORD:-}}}"
BUILD_DIR="$ROOT_DIR/src-tauri/gen/apple/build"

if [ -z "$APPLE_ID" ] || [ -z "$APP_SPECIFIC_PASSWORD" ]; then
  echo "Error: missing App Store credentials in environment variables."
  echo "Supported names:"
  echo "  APPLE_ID or APPSTORE_CONNECT_APPLE_ID or ASC_APPLE_ID"
  echo "  APP_SPECIFIC_PASSWORD or APPSTORE_CONNECT_APP_SPECIFIC_PASSWORD or ASC_APP_SPECIFIC_PASSWORD"
  echo "Example:"
  echo "  APPLE_ID='you@example.com' APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx' ./build-ipad-appstore.sh"
  exit 1
fi

echo "Cleaning stale App Store artifacts..."
rm -rf "$BUILD_DIR/arm64/RepoRead.ipa" "$BUILD_DIR/reporead_iOS.xcarchive"

echo "Building App Store IPA..."
APPLE_DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  bun run tauri ios build --target aarch64 --export-method app-store-connect --ci

IPA_PATH="$ROOT_DIR/src-tauri/gen/apple/build/arm64/RepoRead.ipa"
if [ ! -f "$IPA_PATH" ]; then
  echo "Error: IPA not found at $IPA_PATH"
  exit 1
fi

echo "Uploading IPA to App Store Connect..."
xcrun altool --upload-app \
  --type ios \
  --file "$IPA_PATH" \
  --username "$APPLE_ID" \
  --password "$APP_SPECIFIC_PASSWORD"

echo "Done."
echo "Uploaded: $IPA_PATH"
