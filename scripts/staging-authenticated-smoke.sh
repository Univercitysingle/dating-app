#!/usr/bin/env bash
set -euo pipefail

: "${WORKER_URL:?WORKER_URL is required}"
: "${PAGES_URL:?PAGES_URL is required}"
: "${FIREBASE_WEB_API_KEY:?FIREBASE_WEB_API_KEY is required}"
: "${STAGING_TEST_EMAIL:?STAGING_TEST_EMAIL is required}"
: "${STAGING_TEST_PASSWORD:?STAGING_TEST_PASSWORD is required}"

WORKER_URL="${WORKER_URL%/}"
PAGES_URL="${PAGES_URL%/}"

# Check public service health before authenticated acceptance tests. Retry
# transient 5xx/network failures, but fail immediately on client-side errors.
verify_public_endpoint() {
  local path="$1" attempt status
  for attempt in 1 2 3 4 5; do
    status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$WORKER_URL$path" || true)"
    if [[ "$status" == "200" ]]; then
      echo "PASS public endpoint $path returned HTTP 200"
      return 0
    fi
    if [[ "$status" =~ ^4[0-9]{2}$ ]]; then
      echo "::error::Public endpoint $path returned non-retryable HTTP $status."
      return 1
    fi
    echo "Attempt $attempt/5: $path returned HTTP ${status:-no response}; retrying."
    sleep 3
  done
  echo "::error::Public endpoint $path did not become healthy after 5 attempts."
  return 1
}

verify_public_endpoint "/health"
verify_public_endpoint "/ready"
verify_public_endpoint "/api/status"
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
unset auth_payload

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

# Verify public Discover cards use the public-profile allowlist. This checks
# both direct Worker access and the Pages /api proxy without exposing profile
# values in CI output.
check_discover_profile_privacy() {
  local base_url="$1"
  local origin="$2"
  local response_file status
  response_file="$(mktemp)"
  status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
    --header 'Accept: application/json' \
    "$base_url/api/users/discover")"
  if [[ "$status" != "200" ]]; then
    echo "::error::Authenticated Discover privacy check failed for $origin (HTTP $status)."
    rm -f "$response_file"
    return 1
  fi
  if ! node -e 'const fs=require("fs");const profiles=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!Array.isArray(profiles))throw Error("Discover response must be an array");const forbidden=new Set(["password","passwordhash","email","emailaddress","email_address","emailid","mail","mobile","mobilenumber","mobile_number","phone","phonenumber","phone_number","whatsapp","whatsappnumber","lastloginip","lastlogindevice","role","birthday","coordinates","latitude","longitude","lat","lng","exactlocation"]);const normalize=k=>k.replace(/[^a-z0-9_]/gi,"").toLowerCase();const visit=(value,path)=>{if(!value||typeof value!=="object")return;if(Array.isArray(value)){for(let i=0;i<value.length;i++)visit(value[i],path+"["+i+"]");return}for(const [key,nested] of Object.entries(value)){if(forbidden.has(normalize(key)))throw Error("Discover profile exposes restricted field: "+path+"."+key);if(key==="location"&&nested&&typeof nested==="object"&&!Array.isArray(nested)){const allowed=new Set(["city","region","state","country","countryCode","cityName"]);for(const locationKey of Object.keys(nested)){if(!allowed.has(locationKey))throw Error("Discover profile exposes non-public location detail: "+locationKey)}}visit(nested,path+"."+key)}};for(const profile of profiles)visit(profile,"profile")' "$response_file"; then
    echo "::error::Discover returned a profile with restricted account, contact, or precise-location data for $origin."
    rm -f "$response_file"
    return 1
  fi
  local count
  count="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(x.length))' "$response_file")"
  rm -f "$response_file"
  echo "PASS Discover public-profile privacy $origin ($count profiles checked)"
}

check_discover_profile_privacy "$WORKER_URL" "Worker"
check_discover_profile_privacy "$PAGES_URL" "Pages"

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
  if ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!Array.isArray(x))throw Error("Inbox response must be an array");const ids=[];for(const c of x){if(!c||typeof c.roomId!=="string"||!c.lastMessage||c.lastMessage.roomId!==c.roomId)throw Error("Inbox conversation is missing a consistent room and latest message");const allowedMessageFields=new Set(["_id","roomId","senderUid","receiverUid","messageContent","timestamp","status","deliveredAt","readAt","clientMessageId"]);for(const key of Object.keys(c.lastMessage)){if(!allowedMessageFields.has(key))throw Error("Inbox latest message exposes unapproved field: "+key)}if(!c.otherUser||typeof c.otherUser!=="object")throw Error("Inbox conversation is missing its public counterpart profile");for(const field of ["password","email","mobileNumber","location","lastLoginIp","lastLoginDevice"]){if(Object.prototype.hasOwnProperty.call(c.otherUser,field))throw Error("Inbox counterpart profile exposes restricted field: "+field)}ids.push(c.roomId)}if(new Set(ids).size!==ids.length)throw Error("Inbox contains duplicate conversations")' "$response_file"; then
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
  if ! node -e 'const fs=require("fs");const inbox=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const history=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const conversation=inbox.find(item=>item.roomId===process.argv[3]);const messages=history.messages;const allowed=new Set(["_id","roomId","senderUid","receiverUid","messageContent","timestamp","status","deliveredAt","readAt","clientMessageId"]);if(!conversation||!conversation.lastMessage||!Array.isArray(messages)||messages.length!==1||typeof messages[0]._id!=="string"||!/^[a-fA-F0-9]{24}$/.test(messages[0]._id)||typeof conversation.lastMessage._id!=="string"||!/^[a-fA-F0-9]{24}$/.test(conversation.lastMessage._id)||conversation.lastMessage._id!==messages[0]._id)throw Error("Inbox/history message IDs must be matching 24-character hexadecimal strings");for(const message of messages){for(const key of Object.keys(message)){if(!allowed.has(key))throw Error("Chat history exposes unapproved message field: "+key)}}' "$response_file" "$history_file" "$room_id"; then
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
  local before_query
  before_query="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const m=x.messages?.[0];if(!m?._id||!m.timestamp)process.exit(1);const p=new URLSearchParams({limit:"10",before:new Date(m.timestamp).toISOString(),beforeId:String(m._id)});process.stdout.write(p.toString())' "$history_file")"
  local older_file
  older_file="$(mktemp)"
  status="$(curl --silent --show-error --output "$older_file" --write-out '%{http_code}' \
    --header "Authorization: Bearer $id_token" \
    --header 'Accept: application/json' \
    "$base_url/api/chat/history/$encoded_room?$before_query")"
  if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const page=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const cursor=JSON.parse(fs.readFileSync(process.argv[2],"utf8")).messages?.[0];if(!cursor||!Array.isArray(page.messages)||page.messages.length>10)throw Error("Older history page has an invalid shape or size");let previous=null;for(const m of page.messages){if(!/^[a-fA-F0-9]{24}$/.test(String(m._id)))throw Error("Older history contains an invalid message ID");const t=Date.parse(m.timestamp),ct=Date.parse(cursor.timestamp);if(!Number.isFinite(t)||t>ct||(t===ct&&String(m._id)>=String(cursor._id)))throw Error("Older history returned a message at or after its cursor");if(previous){const pt=Date.parse(previous.timestamp);if(pt>t||(pt===t&&String(previous._id)>String(m._id)))throw Error("Older history is not in stable chronological order")}previous=m}' "$older_file" "$history_file"; then
    echo "::error::Authenticated before-cursor chat history failed for $origin (HTTP $status)."
    node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(x.error||x.message)console.error(String(x.error||x.message).slice(0,200));else console.error("Unexpected older history response shape");}catch{}' "$older_file"
    rm -f "$response_file" "$history_file" "$delta_file" "$older_file"
    return 1
  fi
  rm -f "$response_file" "$history_file" "$delta_file" "$older_file"
  echo "PASS authenticated incremental and before-cursor chat history ordering $origin"
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

# Exercise two simultaneous requests with a fresh idempotency key. Both calls
# must resolve to the same persisted message even when they race at insertion.
race_message_id="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
race_content="Automated concurrent idempotency acceptance test $race_message_id"
race_payload="$(node -e 'process.stdout.write(JSON.stringify({roomId:process.argv[1],receiverUid:process.argv[2],messageContent:process.argv[3],clientMessageId:process.argv[4]}))' "$room_id" "$account_b_UID" "$race_content" "$race_message_id")"
race_file_a="$(mktemp)"
race_file_b="$(mktemp)"
race_status_a_file="$(mktemp)"
race_status_b_file="$(mktemp)"
(
  curl --silent --show-error --output "$race_file_a" --write-out '%{http_code}' \
    --header "Authorization: Bearer $account_a_TOKEN" --header 'Content-Type: application/json' \
    --data-binary "$race_payload" "$WORKER_URL/api/chat/send" > "$race_status_a_file"
) &
race_pid_a=$!
(
  curl --silent --show-error --output "$race_file_b" --write-out '%{http_code}' \
    --header "Authorization: Bearer $account_a_TOKEN" --header 'Content-Type: application/json' \
    --data-binary "$race_payload" "$WORKER_URL/api/chat/send" > "$race_status_b_file"
) &
race_pid_b=$!
wait "$race_pid_a"
wait "$race_pid_b"
race_status_a="$(cat "$race_status_a_file")"
race_status_b="$(cat "$race_status_b_file")"
race_result="$(node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const b=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));if(!a._id||String(a._id)!==String(b._id)||a.clientMessageId!==process.argv[3]||b.clientMessageId!==process.argv[3])process.exit(1);process.stdout.write(String(a._id))' "$race_file_a" "$race_file_b" "$race_message_id" 2>/dev/null || true)"
rm -f "$race_file_a" "$race_file_b" "$race_status_a_file" "$race_status_b_file"
if [[ ( "$race_status_a" != "200" && "$race_status_a" != "201" ) || ( "$race_status_b" != "200" && "$race_status_b" != "201" ) || -z "$race_result" ]]; then
  echo "::error::Concurrent idempotent sends did not return the same persisted message (HTTP $race_status_a / $race_status_b)."
  exit 1
fi
echo "PASS simultaneous duplicate sends returned one persisted message"

# Retry the exact request with the same clientMessageId. The API must return
# the original persisted message rather than inserting a duplicate.
retry_payload="$(node -e 'process.stdout.write(JSON.stringify({roomId:process.argv[1],receiverUid:process.argv[2],messageContent:process.argv[3],clientMessageId:process.argv[4]}))' "$room_id" "$account_b_UID" "$message_content" "$client_message_id")"
retry_file="$(mktemp)"
status="$(curl --silent --show-error --output "$retry_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_a_TOKEN" --header 'Content-Type: application/json' \
  --data-binary "$retry_payload" "$WORKER_URL/api/chat/send")"
retry_same_message="false"
retry_key_returned="false"
if [[ -s "$retry_file" ]]; then
  retry_same_message="$(node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(String(x._id)===process.argv[2]))}catch{process.stdout.write("false")}' "$retry_file" "$message_id")"
  retry_key_returned="$(node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(x.clientMessageId===process.argv[2]))}catch{process.stdout.write("false")}' "$retry_file" "$client_message_id")"
fi
if [[ "$status" != "200" && "$status" != "201" ]] || [[ "$retry_same_message" != "true" || "$retry_key_returned" != "true" ]]; then
  echo "::error::Idempotent retry failed (HTTP $status, original_message_returned=$retry_same_message, retry_key_returned=$retry_key_returned)."
  rm -f "$retry_file"
  exit 1
fi
rm -f "$retry_file"
echo "PASS duplicate send retry returned the original message"

# Reusing the same key with different content must be rejected, not persisted.
conflict_payload="$(node -e 'process.stdout.write(JSON.stringify({roomId:process.argv[1],receiverUid:process.argv[2],messageContent:process.argv[3],clientMessageId:process.argv[4]}))' "$room_id" "$account_b_UID" "$message_content conflict" "$client_message_id")"
conflict_file="$(mktemp)"
status="$(curl --silent --show-error --output "$conflict_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_a_TOKEN" --header 'Content-Type: application/json' \
  --data-binary "$conflict_payload" "$WORKER_URL/api/chat/send")"
if [[ "$status" != "409" ]]; then
  echo "::error::Reusing a clientMessageId with different content should return HTTP 409, got $status."
  rm -f "$conflict_file"
  exit 1
fi
rm -f "$conflict_file"
echo "PASS conflicting idempotency key reuse rejected with HTTP 409"

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

# Verify that inbox unread counts include the newly received messages, then
# decrease by exactly one after the selected message is marked as read.
inbox_before_read="$(mktemp)"
status="$(curl --silent --show-error --output "$inbox_before_read" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_b_TOKEN" --header 'Accept: application/json' \
  "$WORKER_URL/api/chat/conversations")"
if [[ "$status" != "200" ]]; then
  echo "::error::Account B could not retrieve its inbox before the read-count check (HTTP $status)."
  rm -f "$inbox_before_read"
  exit 1
fi
unread_before_read="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const c=x.find(v=>v.roomId===process.argv[2]);if(!c||!Number.isInteger(c.unreadCount)||c.unreadCount<1)process.exit(1);process.stdout.write(String(c.unreadCount))' "$inbox_before_read" "$room_id" 2>/dev/null || true)"
rm -f "$inbox_before_read"
if [[ -z "$unread_before_read" ]]; then
  echo "::error::Account B inbox did not report a positive unread count for the staging conversation."
  exit 1
fi
echo "PASS account B inbox reports unread messages"

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

inbox_after_read="$(mktemp)"
status="$(curl --silent --show-error --output "$inbox_after_read" --write-out '%{http_code}' \
  --header "Authorization: Bearer $account_b_TOKEN" --header 'Accept: application/json' \
  "$WORKER_URL/api/chat/conversations")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const c=x.find(v=>v.roomId===process.argv[2]);if(!c||c.unreadCount!==Number(process.argv[3])-1)process.exit(1)' "$inbox_after_read" "$room_id" "$unread_before_read"; then
  echo "::error::Account B inbox unread count did not decrease by exactly one after marking the message as read."
  rm -f "$inbox_after_read"
  exit 1
fi
rm -f "$inbox_after_read"
echo "PASS inbox unread count decreased after read receipt"

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
echo "PASS two-account send, receive, delivery, and read receipt acceptance test"

# Exercise the authenticated per-account chat-send limit using only the
# dedicated staging test pair. Thirty concurrent unique sends must be accepted
# exactly once; the next send must be rejected with HTTP 429 and Retry-After.
ACCOUNT_B_TOKEN="$account_b_TOKEN" ACCOUNT_A_UID="$account_a_UID" ACCOUNT_B_UID="$account_b_UID" WORKER_URL="$WORKER_URL" node <<'NODE'
const { randomUUID } = require("node:crypto");

const token = process.env.ACCOUNT_B_TOKEN;
const senderUid = process.env.ACCOUNT_B_UID;
const receiverUid = process.env.ACCOUNT_A_UID;
const workerUrl = process.env.WORKER_URL.replace(/\/$/, "");
const roomId = senderUid + "-" + receiverUid;

async function send(clientMessageId) {
  return fetch(workerUrl + "/api/chat/send", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      roomId,
      receiverUid,
      messageContent: "Automated rate-limit acceptance " + clientMessageId,
      clientMessageId
    })
  });
}

(async () => {
  const keys = Array.from({ length: 30 }, () => randomUUID());
  const responses = await Promise.all(keys.map(send));
  const bodies = await Promise.all(responses.map(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => ({}))
  })));
  const accepted = bodies.filter((item) => item.status === 200 || item.status === 201);
  const ids = accepted.map((item) => String(item.body._id || ""));
  if (accepted.length !== 30 || ids.some((id) => !/^[a-fA-F0-9]{24}$/.test(id)) || new Set(ids).size !== 30) {
    process.stderr.write("Concurrent chat-send acceptance failed: expected 30 successful unique persisted messages; received " + accepted.length + " successes.\n");
    process.exit(1);
  }

  const blocked = await send(randomUUID());
  const retryAfter = Number(blocked.headers.get("retry-after") || 0);
  if (blocked.status !== 429 || !Number.isInteger(retryAfter) || retryAfter < 1) {
    process.stderr.write("Chat-send rate limit failed: expected HTTP 429 with a positive Retry-After header; received HTTP " + blocked.status + ".\n");
    process.exit(1);
  }
  process.stdout.write("PASS 30 concurrent authenticated chat sends persisted uniquely; request 31 rejected with HTTP 429\n");
})().catch((error) => {
  process.stderr.write("Concurrent chat-send acceptance failed: " + String(error && error.message || "unexpected error").slice(0, 180) + "\n");
  process.exit(1);
});
NODE
unset account_a_TOKEN account_b_TOKEN account_a_UID account_b_UID
