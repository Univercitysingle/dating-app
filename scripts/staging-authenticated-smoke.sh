#!/usr/bin/env bash
set -euo pipefail

: "${WORKER_URL:?WORKER_URL is required}"
: "${STAGING_TEST_FIREBASE_ID_TOKEN:?STAGING_TEST_FIREBASE_ID_TOKEN is required}"

WORKER_URL="${WORKER_URL%/}"
AUTH_HEADER="Authorization: Bearer ${STAGING_TEST_FIREBASE_ID_TOKEN}"

check_get() {
  local path="$1"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json' \
    "$WORKER_URL$path")"

  if [[ "$status" != "200" ]]; then
    echo "::error::Authenticated GET $path returned HTTP $status"
    # Print only a sanitized error field, never the response body or user data.
    node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const m=x.error||x.message;if(m)console.error(String(m).slice(0,240));}catch{}' "$response_file"
    rm -f "$response_file"
    return 1
  fi

  if ! node -e 'const fs=require("fs");JSON.parse(fs.readFileSync(process.argv[1],"utf8"))' "$response_file"; then
    echo "::error::Authenticated GET $path returned non-JSON content."
    rm -f "$response_file"
    return 1
  fi

  rm -f "$response_file"
  echo "PASS authenticated GET $path -> HTTP 200 (JSON)"
}

# Read-only checks only. These requests do not create messages, uploads,
# support tickets, subscriptions, or payment transactions.
check_get "/api/users/me"
check_get "/api/users/discover"
check_get "/api/users/likes"
check_get "/api/users/me/subscriptions"

echo "Authenticated staging smoke tests passed."
