#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-YPV49M8592}"

echo "Building iPad device IPA (debugging export)..."
APPLE_DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  bun run tauri ios build --target aarch64 --export-method debugging --ci

IPA_PATH="$ROOT_DIR/src-tauri/gen/apple/build/arm64/RepoRead.ipa"
if [ ! -f "$IPA_PATH" ]; then
  echo "Error: IPA not found at $IPA_PATH"
  exit 1
fi

echo "Done."
echo "Device IPA: $IPA_PATH"
