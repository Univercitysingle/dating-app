#!/usr/bin/env bash
set -euo pipefail

: "${WORKER_URL:?WORKER_URL is required}"
: "${FIREBASE_WEB_API_KEY:?FIREBASE_WEB_API_KEY is required}"
: "${STAGING_TEST_EMAIL:?STAGING_TEST_EMAIL is required}"
: "${STAGING_TEST_PASSWORD:?STAGING_TEST_PASSWORD is required}"

WORKER_URL="${WORKER_URL%/}"
auth_file="$(mktemp)"
trap 'rm -f "$auth_file"' EXIT

# Sign in the dedicated staging test account to obtain a fresh Firebase ID token.
auth_payload="$(node -e 'process.stdout.write(JSON.stringify({email:process.env.STAGING_TEST_EMAIL,password:process.env.STAGING_TEST_PASSWORD,returnSecureToken:true}))')"
auth_status="$(curl --silent --show-error --output "$auth_file" --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --data-binary "$auth_payload" \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_WEB_API_KEY")"
if [[ "$auth_status" != "200" ]]; then
  echo "::error::Firebase sign-in for the dedicated staging test account failed (HTTP $auth_status). Check the test credentials and Email/Password provider configuration."
  exit 1
fi

id_token="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!x.idToken)process.exit(1);process.stdout.write(x.idToken)' "$auth_file")"
unset auth_payload STAGING_TEST_PASSWORD

check_get() {
  local path="$1"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
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

unset id_token
echo "Authenticated staging smoke tests passed."
