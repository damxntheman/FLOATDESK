#!/bin/bash
# FLOATDESK M12 — fail-closed production release gate.
# This script NEVER obtains certificates or credentials and NEVER signs apps.
# It MUST refuse the CI ad-hoc development bundle. Only the Mac owner/developer
# can later provide a reviewed Developer ID team identifier externally.
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Release blocked: pass exactly one compiled .app bundle." >&2
  exit 2
fi
APP="$1"
TEAM="$(printenv FLOATDESK_EXPECTED_TEAM_ID || true)"
if [[ ! -d "$APP" ]]; then
  echo "Release blocked: compiled .app was not found." >&2
  exit 2
fi
if [[ ! "$TEAM" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Release blocked: a reviewed Developer ID Team ID is required." >&2
  exit 2
fi
if ! codesign --verify --deep --strict --verbose=2 "$APP" >/dev/null 2>&1; then
  echo "Release blocked: code signature verification failed." >&2
  exit 3
fi
DETAILS="$(codesign -dv --verbose=4 "$APP" 2>&1)"
HAS_AUTHORITY=0
HAS_TEAM=0
HAS_RUNTIME=0
# Read actual fields, never incidental text in an executable path or label.
# CS_RUNTIME is 0x10000; other CodeDirectory flags may be present as well.
FLAGS_PATTERN='^CodeDirectory[[:space:]].*[[:space:]]flags=0x([[:xdigit:]]{1,8})\([^)]*\)([[:space:]]|$)'
while IFS= read -r LINE; do
  if [[ "$LINE" == "Authority=Developer ID Application: "* ]]; then HAS_AUTHORITY=1; fi
  if [[ "$LINE" == "TeamIdentifier=$TEAM" ]]; then HAS_TEAM=1; fi
  if [[ "$LINE" =~ $FLAGS_PATTERN ]]; then
    FLAGS=$((16#${BASH_REMATCH[1]}))
    if (( (FLAGS & 0x10000) != 0 )); then HAS_RUNTIME=1; fi
  fi
done <<< "$DETAILS"
if [[ "$HAS_AUTHORITY" != 1 || "$HAS_TEAM" != 1 ]]; then
  echo "Release blocked: not signed by the expected Developer ID Application team." >&2
  exit 3
fi
if [[ "$HAS_RUNTIME" != 1 ]]; then
  echo "Release blocked: no hardened runtime detected." >&2
  exit 3
fi
if ! spctl --assess --type execute --verbose=4 "$APP" >/dev/null 2>&1; then
  echo "Release blocked: Gatekeeper assessment failed (notarization must be checked)." >&2
  exit 4
fi
# Production still requires native security, XPC/TCC/privacy and device review.
echo "Signature, team, runtime and Gatekeeper checks passed."
echo "Manual security and real-device release approval STILL required."
