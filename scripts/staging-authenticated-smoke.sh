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
  if ! node -e 'const fs=require("fs");const inbox=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const history=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const conversation=inbox.find(item=>item.roomId===process.argv[3]);const messages=history.messages;if(!conversation||!conversation.lastMessage||!Array.isArray(messages)||messages.length!==1||typeof messages[0]._id!=="string"||!/^[a-fA-F0-9]{24}$/.test(messages[0]._id)||typeof conversation.lastMessage._id!=="string"||!/^[a-fA-F0-9]{24}$/.test(conversation.lastMessage._id)||conversation.lastMessage._id!==messages[0]._id)throw Error("Inbox/history message IDs must be matching 24-character hexadecimal strings")' "$response_file" "$history_file" "$room_id"; then
    echo "::error::Inbox latest message did not match persisted chat history for $origin."
    rm -f "$response_file" "$history_file"
    return 1
  fi
  local cursor_query
  cursor_query="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const m=x.messages?.[0];if(!m?._id||!m.timestamp)process.exit(1);const p=new URLSearchParams({limit:"10",after:new Date(m.timestamp).toISOString(),afterId:String(m._id)});process.stdout.write(p.toString())' "$history_file")"
  local delta_file
  delta_file="$(mktemp)"
  status="$(curl --silent --show-error --output "$delta_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
    --header 'Accept: application/json' \
    "$base_url/api/chat/history/$encoded_room?$cursor_query")"
  if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!Array.isArray(x.messages))throw Error("Incremental history must return a messages array");for(let i=1;i<x.messages.length;i++){const a=x.messages[i-1],b=x.messages[i];const at=new Date(a.timestamp).getTime(),bt=new Date(b.timestamp).getTime();if(at>bt||(at===bt&&String(a._id)>String(b._id)))throw Error("Incremental messages are not in stable chronological order")}' "$delta_file"; then
    echo "::error::Authenticated incremental chat history failed for $origin (HTTP $status)."
    node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(x.error||x.message)console.error(String(x.error||x.message).slice(0,200));else console.error("Unexpected incremental history response shape");}catch{}' "$delta_file"
    rm -f "$response_file" "$history_file" "$delta_file"
    return 1
  fi
  rm -f "$response_file" "$history_file" "$delta_file"
  echo "PASS authenticated inbox latest message matches persisted history and incremental cursor works $origin"
  check_get "$base_url" "/api/chat/typing?roomId=$encoded_room" "$origin"
}

check_chat_room_reads "$WORKER_URL" "Worker "
check_chat_room_reads "$PAGES_URL" "Pages "

unset id_token
echo "Authenticated staging smoke tests passed on the Worker and Pages API routes."


# Two-account acceptance test. This deliberately writes one uniquely tagged
# message between the two dedicated staging test accounts, then verifies that
# the recipient can retrieve it and persist delivery/read receipts.
: "${STAGING_TEST_EMAIL_B:?STAGING_TEST_EMAIL_B is required}"
: "${STAGING_TEST_PASSWORD_B:?STAGING_TEST_PASSWORD_B is required}"

sign_in_test_account() {
  local email="$1" password="$2" output_var="$3"
  local response_file payload status
  response_file="$(mktemp)"
  payload="$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.argv[2],returnSecureToken:true}))' "$email" "$password")"
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --header 'Content-Type: application/json' --data-binary "$payload" \
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_WEB_API_KEY")"
  unset payload password
  if [[ "$status" != "200" ]]; then
    echo "::error::Firebase sign-in for a dedicated two-account staging test account failed (HTTP $status)."
    rm -f "$response_file"
    return 1
  fi
  local token uid
  token="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!x.idToken||!x.localId)process.exit(1);process.stdout.write(x.idToken)' "$response_file")"
  uid="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(x.localId)' "$response_file")"
  rm -f "$response_file"
  printf -v "${output_var}_TOKEN" '%s' "$token"
  printf -v "${output_var}_UID" '%s' "$uid"
}

sign_in_test_account "$STAGING_TEST_EMAIL" "$STAGING_TEST_PASSWORD" account_a
unset STAGING_TEST_PASSWORD
sign_in_test_account "$STAGING_TEST_EMAIL_B" "$STAGING_TEST_PASSWORD_B" account_b
unset STAGING_TEST_PASSWORD_B

if [[ "$account_a_UID" == "$account_b_UID" ]]; then
  echo "::error::The two staging test credentials resolve to the same Firebase user."
  exit 1
fi

room_id="$account_a_UID-$account_b_UID"
client_message_id="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
message_content="Automated staging chat acceptance test $client_message_id"
send_payload="$(node -e 'process.stdout.write(JSON.stringify({roomId:process.argv[1],receiverUid:process.argv[2],messageContent:process.argv[3],clientMessageId:process.argv[4]}))' "$room_id" "$account_b_UID" "$message_content" "$client_message_id")"
send_file="$(mktemp)"
status="$(curl --silent --show-error --output "$send_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_a_TOKEN" --header 'Content-Type: application/json' \
  --data-binary "$send_payload" "$WORKER_URL/api/chat/send")"
unset send_payload
if [[ "$status" != "201" && "$status" != "200" ]]; then
  echo "::error::Two-account staging message send failed (HTTP $status)."
  rm -f "$send_file"
  exit 1
fi
message_id="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!x._id||x.senderUid!==process.argv[2]||x.receiverUid!==process.argv[3]||x.roomId!==process.argv[4])process.exit(1);process.stdout.write(String(x._id))' "$send_file" "$account_a_UID" "$account_b_UID" "$room_id")"
rm -f "$send_file"
echo "PASS account A sent a persisted message to account B"

encoded_room="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$room_id")"
received_file="$(mktemp)"
status="$(curl --silent --show-error --output "$received_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_b_TOKEN" --header 'Accept: application/json' \
  "$PAGES_URL/api/chat/history/$encoded_room?limit=50")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const m=(x.messages||[]).find(v=>String(v._id)===process.argv[2]);if(!m||m.messageContent!==process.argv[3]||m.senderUid!==process.argv[4]||m.receiverUid!==process.argv[5])process.exit(1)' "$received_file" "$message_id" "$message_content" "$account_a_UID" "$account_b_UID"; then
  echo "::error::Account B could not retrieve the exact message sent by account A."
  rm -f "$received_file"
  exit 1
fi
rm -f "$received_file"
echo "PASS account B received the persisted message through the Pages API"

receipt_payload="$(node -e 'process.stdout.write(JSON.stringify({roomId:process.argv[1],messageIds:[process.argv[2]]}))' "$room_id" "$message_id")"
receipt_file="$(mktemp)"
status="$(curl --silent --show-error --output "$receipt_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_b_TOKEN" --header 'Content-Type: application/json' \
  --data-binary "$receipt_payload" "$WORKER_URL/api/chat/delivered")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(typeof x.deliveredCount!=="number")process.exit(1)' "$receipt_file"; then
  echo "::error::Account B could not persist the message delivery receipt."
  rm -f "$receipt_file"
  exit 1
fi
rm -f "$receipt_file"
echo "PASS account B persisted a delivery receipt"

status="$(curl --silent --show-error --output "$receipt_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_b_TOKEN" --header 'Content-Type: application/json' \
  --data-binary "$receipt_payload" "$WORKER_URL/api/chat/read")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(typeof x.readCount!=="number")process.exit(1)' "$receipt_file"; then
  echo "::error::Account B could not persist the message read receipt."
  rm -f "$receipt_file"
  exit 1
fi
rm -f "$receipt_file"
echo "PASS account B persisted a read receipt"

sender_history="$(mktemp)"
status="$(curl --silent --show-error --output "$sender_history" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_a_TOKEN" --header 'Accept: application/json' \
  "$WORKER_URL/api/chat/history/$encoded_room?limit=50")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const m=(x.messages||[]).find(v=>String(v._id)===process.argv[2]);if(!m||m.status!=="read"||!m.readAt)process.exit(1)' "$sender_history" "$message_id"; then
  echo "::error::Account A did not observe the persisted read receipt from account B."
  rm -f "$sender_history"
  exit 1
fi
rm -f "$sender_history"
unset account_a_TOKEN account_b_TOKEN account_a_UID account_b_UID
echo "PASS two-account send, receive, delivery, and read receipt acceptance test"
