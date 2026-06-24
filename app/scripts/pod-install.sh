#!/usr/bin/env bash
#
# Install CocoaPods for the prebuilt iOS project, with retries.
#
# Run from the `app/` directory AFTER `expo prebuild` has regenerated `ios/`
# (the Podfile is patched by plugins/withAllowNonModularIncludes during
# prebuild, so the patched Podfile must already exist). A cold pod install with
# static frameworks + react-native-firebase + the New Architecture occasionally
# flakes on a fresh runner, so we retry before giving up.

set -euo pipefail

if [ ! -d "ios" ]; then
  echo "::error::ios/ not found — run 'expo prebuild --platform ios' first" >&2
  exit 1
fi

cd ios

max_attempts=3
attempt=1
while true; do
  echo "--- pod install (attempt ${attempt}/${max_attempts}) ---"
  if bundle exec pod install --repo-update; then
    echo "pod install succeeded"
    exit 0
  fi

  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "::error::pod install failed after ${max_attempts} attempts" >&2
    exit 1
  fi

  wait_seconds=$((attempt * 15))
  echo "pod install failed; retrying in ${wait_seconds}s..."
  sleep "${wait_seconds}"
  attempt=$((attempt + 1))
done
