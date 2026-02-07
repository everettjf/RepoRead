#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_DIR="$ROOT_DIR"
TAP_DIR_DEFAULT="$ROOT_DIR/../homebrew-tap"
TAP_DIR="${TAP_DIR:-$TAP_DIR_DEFAULT}"
TAP_REPO="everettjf/homebrew-tap"
CASK_PATH="Casks/reporead.rb"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd bun
require_cmd git
require_cmd gh
require_cmd shasum

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

cd "$REPO_DIR"

./inc_patch_version.sh

VERSION=$(bun -e "console.log(require('./package.json').version)")
TAG="v$VERSION"

bun run tauri build

DMG_PATH=$(ls -t src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1 || true)
if [ -z "$DMG_PATH" ]; then
  echo "No .dmg found at src-tauri/target/release/bundle/dmg/" >&2
  exit 1
fi

DMG_DIR=$(dirname "$DMG_PATH")
RELEASE_DMG_PATH="$DMG_DIR/RepoRead.dmg"
if [ "$(basename "$DMG_PATH")" != "RepoRead.dmg" ]; then
  cp -f "$DMG_PATH" "$RELEASE_DMG_PATH"
else
  RELEASE_DMG_PATH="$DMG_PATH"
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists. Skipping create." >&2
else
  gh release create "$TAG" "$RELEASE_DMG_PATH" -t "$TAG" -n "RepoRead $TAG"
fi

SHA256=$(shasum -a 256 "$RELEASE_DMG_PATH" | awk '{print $1}')

if [ ! -d "$TAP_DIR/.git" ]; then
  git clone "https://github.com/$TAP_REPO.git" "$TAP_DIR"
fi

cd "$TAP_DIR"

if [ ! -f "$CASK_PATH" ]; then
  echo "Cask not found: $TAP_DIR/$CASK_PATH" >&2
  exit 1
fi

sed -i '' "s/^  version \".*\"/  version \"$VERSION\"/" "$CASK_PATH"
sed -i '' "s/^  sha256 \".*\"/  sha256 \"$SHA256\"/" "$CASK_PATH"

git add "$CASK_PATH"
git commit -m "bump reporead to $VERSION"
git push

echo "Done. Released $TAG and updated Homebrew cask."
