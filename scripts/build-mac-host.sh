#!/bin/bash
# Research-only Mac menu bar bundle: no Node server, remote listener,
# capture/input/files permissions, or auto-start are included.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$#" -gt 0 ]]; then DEST="$1"; else DEST="$REPO_ROOT/build"; fi
APP="$DEST/FLOATDESK Mac Host.app"
mkdir -p "$APP/Contents/MacOS"
cp "$REPO_ROOT/native/macos/MacHost-Info.plist" "$APP/Contents/Info.plist"
xcrun swiftc -parse-as-library "$REPO_ROOT/native/macos/FloatdeskMacHost.swift" "$REPO_ROOT/native/macos/FloatdeskLocalService.swift" \
  -o "$APP/Contents/MacOS/FloatdeskMacHost"
plutil -lint "$APP/Contents/Info.plist"

# Ad-hoc CI signing proves only bundle integrity, NOT identity, notarization
# or macOS Screen Recording / Accessibility permission.
if [[ "$(printenv FLOATDESK_ADHOC_SIGN || true)" == "1" ]]; then
  codesign --force --sign - --timestamp=none "$APP"
  codesign --verify --deep --strict "$APP"
fi
printf 'Built research-only Mac shell: %s\n' "$APP"
