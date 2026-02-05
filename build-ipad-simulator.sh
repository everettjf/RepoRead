#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

BUILD_DIR="$ROOT_DIR/src-tauri/gen/apple/build"

# Tauri iOS export may fail with "Directory not empty (os error 66)" if old artifacts remain.
echo "Cleaning stale iOS build artifacts..."
rm -rf "$BUILD_DIR/arm64-sim/RepoRead.app" "$BUILD_DIR/reporead_iOS.xcarchive"

echo "Building iPad simulator app..."
bun run tauri ios build --target aarch64-sim --debug --ci

APP_PATH="$ROOT_DIR/src-tauri/gen/apple/build/arm64-sim/RepoRead.app"
if [ ! -d "$APP_PATH" ]; then
  echo "Error: simulator app not found at $APP_PATH"
  exit 1
fi

echo "Done."
echo "Simulator app: $APP_PATH"
