#!/usr/bin/env bash
set -euo pipefail

test -n "$WORKER_URL" || { echo "WORKER_URL is required"; exit 1; }
test -n "$FIREBASE_WEB_API_KEY" || { echo "FIREBASE_WEB_API_KEY is required"; exit 1; }
test -n "$STAGING_DELETION_TEST_EMAIL" || { echo "A dedicated disposable deletion-test email is required"; exit 1; }
test -n "$STAGING_DELETION_TEST_PASSWORD" || { echo "A dedicated disposable deletion-test password is required"; exit 1; }
test -n "$STAGING_DELETION_ADMIN_EMAIL" || { echo "A dedicated staging superadmin email is required"; exit 1; }
test -n "$STAGING_DELETION_ADMIN_PASSWORD" || { echo "A dedicated staging superadmin password is required"; exit 1; }

WORKER_URL="$(printf '%s' "$WORKER_URL" | sed 's:/*$::')"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"; unset target_token admin_token' EXIT

sign_in() {
  local email="$1" password="$2" output="$3" payload status
  payload="$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.argv[2],returnSecureToken:true}))' "$email" "$password")"
  status="$(curl --silent --show-error --output "$output" --write-out '%{http_code}' \
    --header 'Content-Type: application/json' --data-binary "$payload" \
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_WEB_API_KEY")"
  unset payload password
  if [[ "$status" != "200" ]]; then
    echo "::error::Firebase sign-in failed for a dedicated staging acceptance account (HTTP $status)."
    return 1
  fi
}

sign_in "$STAGING_DELETION_TEST_EMAIL" "$STAGING_DELETION_TEST_PASSWORD" "$tmpdir/target-auth.json"
target_token="$(node -e 'const x=require(process.argv[1]);if(!x.idToken||!x.localId)process.exit(1);process.stdout.write(x.idToken)' "$tmpdir/target-auth.json")"
target_uid="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.localId)' "$tmpdir/target-auth.json")"

sign_in "$STAGING_DELETION_ADMIN_EMAIL" "$STAGING_DELETION_ADMIN_PASSWORD" "$tmpdir/admin-auth.json"
admin_token="$(node -e 'const x=require(process.argv[1]);if(!x.idToken||!x.localId)process.exit(1);process.stdout.write(x.idToken)' "$tmpdir/admin-auth.json")"
admin_uid="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.localId)' "$tmpdir/admin-auth.json")"
unset STAGING_DELETION_ADMIN_PASSWORD

if [[ "$target_uid" == "$admin_uid" ]]; then
  echo "::error::The deletion target and superadmin credentials resolve to the same Firebase identity."
  exit 1
fi

status="$(curl --silent --show-error --output "$tmpdir/target-profile.json" --write-out '%{http_code}' \
  --header "Authorization: Bearer $target_token" --header 'Accept: application/json' \
  "$WORKER_URL/api/users/me")"
if [[ "$status" != "200" ]]; then
  echo "::error::Dedicated deletion target profile is not accessible before the test (HTTP $status)."
  exit 1
fi

target_id="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(typeof x._id!=="string"||!/^[a-fA-F0-9]{24}$/.test(x._id)||String(x.email||"").toLowerCase()!==String(process.env.STAGING_DELETION_TEST_EMAIL||"").toLowerCase())process.exit(1);process.stdout.write(x._id)' "$tmpdir/target-profile.json")" || {
  echo "::error::The authenticated target profile did not match the dedicated deletion-test email or a valid MongoDB ID."
  exit 1
}

# Independently inspect the target through the superadmin endpoint. This extra
# marker prevents accidentally selecting an ordinary staging user.
status="$(curl --silent --show-error --output "$tmpdir/admin-before.json" --write-out '%{http_code}' \
  --header "Authorization: Bearer $admin_token" --header 'Accept: application/json' \
  "$WORKER_URL/api/admin/users/$target_id")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(String(x.email||"").toLowerCase()!==String(process.env.STAGING_DELETION_TEST_EMAIL||"").toLowerCase()||x.role!=="user"||x.name!=="Disposable Account Deletion Test"||x.plan!=="basic"||["deletion_pending","deleted"].includes(x.accountStatus))process.exit(1)' "$tmpdir/admin-before.json"; then
  echo "::error::Target must be a basic-plan user named 'Disposable Account Deletion Test' and match the dedicated email secret. No deletion was attempted."
  exit 1
fi

completed=false
for attempt in $(seq 1 30); do
  status="$(curl --silent --show-error --output "$tmpdir/delete.json" --write-out '%{http_code}' \
    --request DELETE --header "Authorization: Bearer $admin_token" \
    --header 'Accept: application/json' "$WORKER_URL/api/admin/users/$target_id")"
  state="$(node -e 'const fs=require("fs");try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write([x.deletionStatus||"",x.firebaseAuthDeletionStatus||"",x.cdnAssetCleanupStatus||"",x.anonymizationStatus||""].join("|"))}catch{}' "$tmpdir/delete.json")"

  if [[ "$status" == "200" && "$state" == *"completed|completed"* ]]; then
    completed=true
    break
  fi
  if [[ "$status" != "202" ]]; then
    echo "::error::Account deletion acceptance returned unexpected HTTP $status on attempt $attempt."
    exit 1
  fi
  if [[ "$state" == *"manual_review_required"* || "$state" == *"awaiting_credentials"* || "$state" == *"retry_pending"* ]]; then
    echo "::error::Account deletion requires manual review or external credentials. Acceptance stopped without bypassing the safety gate."
    exit 1
  fi
  echo "Account deletion cleanup is continuing in bounded batches (attempt $attempt/30)."
done

if [[ "$completed" != "true" ]]; then
  echo "::error::Account deletion did not complete within thirty bounded cleanup attempts."
  exit 1
fi

status="$(curl --silent --show-error --output "$tmpdir/target-after.json" --write-out '%{http_code}' \
  --header "Authorization: Bearer $target_token" --header 'Accept: application/json' \
  "$WORKER_URL/api/users/me")"
if [[ "$status" != "401" && "$status" != "403" ]]; then
  echo "::error::Deleted target token still accessed /api/users/me (HTTP $status)."
  exit 1
fi

status="$(curl --silent --show-error --output "$tmpdir/admin-after.json" --write-out '%{http_code}' \
  --header "Authorization: Bearer $admin_token" --header 'Accept: application/json' \
  "$WORKER_URL/api/admin/users/$target_id")"
if [[ "$status" != "200" ]] || ! node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(x.accountStatus!=="deleted"||x.anonymizationStatus!=="completed"||x.name!=="Deleted user"||x.email!=="deleted+"+String(x._id).toLowerCase()+"@account.invalid"||!Array.isArray(x.photos)||x.photos.length!==0)process.exit(1);for(const k of ["mobileNumber","phoneNumber","contactNumber","birthday","gender","bio","location","lastLoginIp","lastLoginDevice","password"])if(Object.prototype.hasOwnProperty.call(x,k))process.exit(1)' "$tmpdir/admin-after.json"; then
  echo "::error::Admin verification did not confirm the anonymized account state."
  exit 1
fi

status="$(curl --silent --show-error --output "$tmpdir/relogin.json" --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --data-binary "$(node -e 'process.stdout.write(JSON.stringify({email:process.env.STAGING_DELETION_TEST_EMAIL,password:process.env.STAGING_DELETION_TEST_PASSWORD,returnSecureToken:true}))')" \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_WEB_API_KEY")"
if [[ "$status" == "200" ]]; then
  echo "::error::Firebase still allowed sign-in for the deleted staging identity."
  exit 1
fi

unset target_token admin_token STAGING_DELETION_TEST_PASSWORD
echo "PASS dedicated staging account deletion, Firebase revocation, CDN cleanup, and MongoDB profile anonymization."
