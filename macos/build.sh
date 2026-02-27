#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Building SFL Capture…"
swift build -c release 2>&1

APP="build/SFL Capture.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

cp .build/release/SFLCapture "$APP/Contents/MacOS/SFLCapture"
cp Info.plist "$APP/Contents/Info.plist"

echo ""
echo "Built: $APP"
echo ""
echo "To install, drag to /Applications or run:"
echo "  cp -r \"$APP\" /Applications/"
echo ""
echo "First launch: grant Accessibility permission when prompted."
echo "Then press ⌃⌥I (Control+Option+I) anywhere to capture an idea."
