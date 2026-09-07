#!/usr/bin/env bash
#
# Verify an Instagram access token before it goes into Secret Manager, and
# print the two values the publisher needs (see docs/instagram.md).
#
# The token is read from the environment or prompted for silently; it is never
# echoed, never written to a file, and never passed on a command line where it
# would land in shell history or `ps`.
#
#   IG_TOKEN=... ./scripts/verify-instagram-token.sh
#   IG_TOKEN=... IG_APP_SECRET=... ./scripts/verify-instagram-token.sh   # also upgrades to long-lived
#
# With IG_APP_SECRET set, a short-lived token (the ~1 hour one the App
# Dashboard hands you) is exchanged for the 60-day long-lived token the
# scheduled Function actually needs. Without it, the script only reports what
# the token already is.

set -euo pipefail

readonly IG_API_VERSION="v26.0"
readonly GRAPH="https://graph.instagram.com"

if [[ -z "${IG_TOKEN:-}" ]]; then
  read -rsp "Instagram access token: " IG_TOKEN
  echo
fi
if [[ -z "${IG_TOKEN}" ]]; then
  echo "No token given." >&2
  exit 1
fi

# curl reads the token from a config file on stdin rather than taking it in
# argv, so it stays out of `ps` output on a shared machine.
graph_get() {
  local path="$1" query="$2"
  printf 'url = "%s/%s/%s?%s&access_token=%s"\n' "$GRAPH" "$IG_API_VERSION" "$path" "$query" "$IG_TOKEN" |
    curl --silent --show-error --config -
}

die_on_api_error() {
  local body="$1" what="$2"
  if jq -e '.error' >/dev/null 2>&1 <<<"$body"; then
    echo "FAILED (${what}): $(jq -r '.error.message // "unknown error"' <<<"$body")" >&2
    exit 1
  fi
}

echo "1. Identifying the account"
me="$(graph_get "me" "fields=user_id,username,account_type")"
die_on_api_error "$me" "reading the account"

username="$(jq -r '.username // "?"' <<<"$me")"
user_id="$(jq -r '.user_id // .id // empty' <<<"$me")"
account_type="$(jq -r '.account_type // "not reported"' <<<"$me")"

echo "   username ......... @${username}"
echo "   user id .......... ${user_id}"
echo "   account type ..... ${account_type}"

if [[ -z "$user_id" ]]; then
  echo "FAILED: the API returned no user id, so there is nothing to publish to." >&2
  exit 1
fi
case "$account_type" in
  BUSINESS | CREATOR | "not reported") ;;
  *)
    echo "FAILED: account type is ${account_type}. Content publishing needs BUSINESS or CREATOR." >&2
    exit 1
    ;;
esac

if [[ -n "${IG_APP_SECRET:-}" ]]; then
  echo
  echo "2. Exchanging for a long-lived token"
  exchanged="$(
    printf 'url = "%s/access_token?grant_type=ig_exchange_token&client_secret=%s&access_token=%s"\n' \
      "$GRAPH" "$IG_APP_SECRET" "$IG_TOKEN" | curl --silent --show-error --config -
  )"
  if jq -e '.error' >/dev/null 2>&1 <<<"$exchanged"; then
    # Already long-lived is the common, harmless case: Meta refuses to exchange
    # a token that is not short-lived, and says so in the error.
    echo "   not exchanged: $(jq -r '.error.message' <<<"$exchanged")"
    echo "   (if the token is already long-lived, this is expected)"
  else
    IG_TOKEN="$(jq -r '.access_token' <<<"$exchanged")"
    days="$(( $(jq -r '.expires_in' <<<"$exchanged") / 86400 ))"
    echo "   exchanged. Valid for ${days} days."
    echo "   NOTE: the long-lived token below is the one to store, not the one you pasted."
  fi
else
  echo
  echo "2. Skipping the long-lived exchange (IG_APP_SECRET not set)"
  echo "   Set it if the token came straight from the App Dashboard: those are"
  echo "   short-lived and expire in about an hour."
fi

echo
echo "3. Checking the publishing quota"
limit="$(graph_get "${user_id}/content_publishing_limit" "fields=quota_usage")"
if jq -e '.error' >/dev/null 2>&1 <<<"$limit"; then
  echo "   could not read it: $(jq -r '.error.message' <<<"$limit")"
  echo "   This usually means the instagram_business_content_publish scope is missing."
else
  used="$(jq -r '.data[0].quota_usage // 0' <<<"$limit")"
  echo "   used ${used} of 100 posts in the last 24 h"
fi

echo
echo "Store these two, then uncomment the instagramJourney export in functions/src/index.ts:"
echo
echo "  firebase functions:secrets:set INSTAGRAM_USER_ID      # ${user_id}"
echo "  firebase functions:secrets:set INSTAGRAM_ACCESS_TOKEN # printed below, once"
echo
echo "Access token (copy it now, it is not stored anywhere):"
echo "${IG_TOKEN}"
