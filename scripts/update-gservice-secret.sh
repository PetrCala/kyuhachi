#!/usr/bin/env bash
set -euo pipefail

PLIST="app/GoogleService-Info.plist"

if [[ ! -f "$PLIST" ]]; then
  echo "Error: $PLIST not found. Run from repo root." >&2
  exit 1
fi

base64 -i "$PLIST" | gh secret set GOOGLE_SERVICE_INFO_PLIST_BASE64
echo "Secret GOOGLE_SERVICE_INFO_PLIST_BASE64 updated."
