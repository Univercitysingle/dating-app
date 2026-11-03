#!/usr/bin/env bash
set -euo pipefail

: "${WORKER_URL:?WORKER_URL is required}"
: "${PAGES_URL:?PAGES_URL is required}"
: "${FIREBASE_WEB_API_KEY:?FIREBASE_WEB_API_KEY is required}"
: "${STAGING_TEST_EMAIL:?STAGING_TEST_EMAIL is required}"
: "${STAGING_TEST_PASSWORD:?STAGING_TEST_PASSWORD is required}"

WORKER_URL="${WORKER_URL%/}"
PAGES_URL="${PAGES_URL%/}"
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
  local base_url="$1"
  local path="$2"
  local origin="$3"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
    --header 'Accept: application/json' \
    "$base_url$path")"

  if [[ "$status" != "200" ]]; then
    echo "::error::Authenticated GET $origin$path returned HTTP $status"
    # Print only a sanitized error field, never the response body or user data.
    node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const m=x.error||x.message;if(m)console.error(String(m).slice(0,240));}catch{}' "$response_file"
    rm -f "$response_file"
    return 1
  fi

  if ! node -e 'const fs=require("fs");JSON.parse(fs.readFileSync(process.argv[1],"utf8"))' "$response_file"; then
    echo "::error::Authenticated GET $origin$path returned non-JSON content."
    rm -f "$response_file"
    return 1
  fi

  rm -f "$response_file"
  echo "PASS authenticated GET $origin$path -> HTTP 200 (JSON)"
}

# Read-only checks only. These requests do not create messages, uploads,
# support tickets, subscriptions, or payment transactions.
paths=(
  "/api/users/me"
  "/api/users/discover"
  "/api/users/likes"
  "/api/users/me/subscriptions"
  "/api/chat/conversations"
)

for path in "${paths[@]}"; do
  check_get "$WORKER_URL" "$path" "Worker "
done

for path in "${paths[@]}"; do
  check_get "$PAGES_URL" "$path" "Pages "
done

# Exercise authenticated chat reads using a real room from the dedicated test
# account. These GET requests do not create messages or alter delivery state.
check_chat_room_reads() {
  local base_url="$1"
  local origin="$2"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
    --header 'Accept: application/json' \
    "$base_url/api/chat/conversations")"
  if [[ "$status" != "200" ]]; then
    echo "::error::Authenticated GET $origin/api/chat/conversations returned HTTP $status"
    rm -f "$response_file"
    return 1
  fi
  if ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!Array.isArray(x))throw Error("Inbox response must be an array");const ids=[];for(const c of x){if(!c||typeof c.roomId!=="string"||!c.lastMessage||c.lastMessage.roomId!==c.roomId)throw Error("Inbox conversation is missing a consistent room and latest message");ids.push(c.roomId)}if(new Set(ids).size!==ids.length)throw Error("Inbox contains duplicate conversations")' "$response_file"; then
    echo "::error::Authenticated GET $origin/api/chat/conversations returned an invalid inbox structure."
    rm -f "$response_file"
    return 1
  fi
  echo "PASS authenticated inbox structure $origin (unique rooms with matching latest messages)"
  local room_id
  room_id="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const c=Array.isArray(x)?x[0]:null;process.stdout.write(c&&typeof c.roomId==="string"?c.roomId:"")' "$response_file")"
  if [[ -z "$room_id" ]]; then
    rm -f "$response_file"
    echo "SKIP authenticated chat history/typing reads for $origin (test account has no conversations)"
    return 0
  fi
  local encoded_room
  encoded_room="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$room_id")"
  local history_file
  history_file="$(mktemp)"
  status="$(curl --silent --show-error --output "$history_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
    --header 'Accept: application/json' \
    "$base_url/api/chat/history/$encoded_room?limit=1")"
  if [[ "$status" != "200" ]]; then
    echo "::error::Authenticated GET $origin/api/chat/history returned HTTP $status"
    rm -f "$response_file" "$history_file"
    return 1
  fi
  if ! node -e 'const fs=require("fs");const inbox=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const history=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const conversation=inbox.find(item=>item.roomId===process.argv[3]);const messages=history.messages;if(!conversation||!conversation.lastMessage||!Array.isArray(messages)||messages.length!==1||String(conversation.lastMessage._id)!==String(messages[0]._id))throw Error("Inbox latest message does not match newest persisted history message")' "$response_file" "$history_file" "$room_id"; then
    echo "::error::Inbox latest message did not match persisted chat history for $origin."
    rm -f "$response_file" "$history_file"
    return 1
  fi
  rm -f "$response_file" "$history_file"
  echo "PASS authenticated inbox latest message matches persisted chat history $origin"
  check_get "$base_url" "/api/chat/typing?roomId=$encoded_room" "$origin"
}

check_chat_room_reads "$WORKER_URL" "Worker "
check_chat_room_reads "$PAGES_URL" "Pages "

unset id_token
echo "Authenticated staging smoke tests passed on the Worker and Pages API routes."
