#!/bin/bash
set -e  # Exit on any error

APPNAME="RepoRead"
APP_PATH="src-tauri/target/universal-apple-darwin/release/bundle/macos/$APPNAME.app"

# Clean any previous build artifacts
echo "Cleaning previous builds..."
rm -rf dist
rm -rf src-tauri/target/universal-apple-darwin

# Make sure dependencies are installed
echo "Installing dependencies..."
bun install

# Build the Tauri app for macOS universal binary
echo "Building Tauri app for macOS..."
bun run tauri build --bundles app --target universal-apple-darwin

# Check if build succeeded
if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH"
    exit 1
fi

echo "Build completed. The app package is ready for macOS distribution."

# Create macOS installer package for App Store
echo "Creating macOS installer package..."
rm -f "$APPNAME.pkg"
xcrun productbuild --sign "3rd Party Mac Developer Installer: Feng Zhu (YPV49M8592)" \
  --component "$APP_PATH" \
  /Applications "$APPNAME.pkg"

echo "Build process completed successfully."
echo "Package created: $APPNAME.pkg"
