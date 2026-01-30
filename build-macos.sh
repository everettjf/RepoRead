#!/bin/bash

APPNAME="RepoRead"

# Clean any previous build artifacts
echo "Cleaning previous builds..."
rm -rf src/out
rm -rf src-tauri/target

# Make sure dependencies are installed
echo "Installing dependencies..."
cd src
npm install
cd ..
npm install

# Build the frontend
echo "Building frontend..."
npm run build

# Build the app with specific settings for TestFlight
echo "Building Tauri app for macOS..."
npm run tauri build -- --bundles app --target universal-apple-darwin

echo "Build completed. The app package is ready for macOS distribution."

# For macOS package (optional)
echo "Creating macOS installer package..."
rm -f "$APPNAME.pkg"
xcrun productbuild --sign "3rd Party Mac Developer Installer: Feng Zhu (YPV49M8592)" \
  --component "src-tauri/target/universal-apple-darwin/release/bundle/macos/$APPNAME.app" \
  /Applications "$APPNAME.pkg"

echo "Build process completed."