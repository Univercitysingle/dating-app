# Disaster recovery and backup standard

**Status:** Required operating standard. Backup configuration and restore success are not verified by this document.
**Scope:** MongoDB Atlas, Firebase Authentication/Realtime Database, Cloudflare configuration, and media metadata. The existing CDN Worker and private Backblaze B2 implementation remain out of scope for modification.

## Recovery objectives

RPO and RTO must be approved by the product owner and infrastructure owner before production launch. Until approved, record them as **TBD**, not as achieved objectives. Define separate objectives for user/profile data, chat, authentication, payment/entitlement records, moderation evidence, and media objects.

## Backup inventory to confirm

| System | Data/configuration | Required evidence |
|---|---|---|
| MongoDB Atlas | Application collections, indexes, validators and critical metadata | Backup policy export, last successful backup, retention and restore test |
| Firebase RTDB | Chat paths and rules | Export/backup method, rules export, restore test and access validation |
| Firebase Auth | User identities and provider configuration | Recovery/export capability and tested account restoration process |
| Cloudflare | Pages/Worker source, bindings, routes, cron schedules and secrets inventory | Git source SHA, non-secret configuration export, secret owner/rotation record |
| B2/CDN | Media objects and object metadata | Existing CDN/B2 owner-provided recovery evidence; do not change CDN Worker here |

Never store secrets in backups or this document in plaintext. Secret recovery must use the approved secret manager and access-controlled rotation process.

## Restore procedure

1. Declare an incident and assign incident commander, data owner and technical operator.
2. Identify the last known-good backup and establish the recovery point.
3. Restore into an isolated environment first. Never overwrite production during initial validation.
4. Validate collection counts, indexes, unique constraints, sample document integrity and application compatibility.
5. Restore Firebase rules before allowing client access. Test that unrelated users cannot read or write restored chat rooms.
6. Validate payment/entitlement consistency against provider records. Do not replay callbacks blindly.
7. Validate user deletion, moderation restrictions and retention requirements before reopening access.
8. Obtain owner approval, record evidence and perform controlled cutover.
9. Monitor error rates, data divergence and delayed jobs after recovery.

## Required recurring exercises

- Confirm backup completion and retention monthly.
- Perform a documented restore drill at least quarterly or at the approved organizational cadence.
- Test a Firebase RTDB rules restore and negative access cases.
- Reconcile a sample of payment records and entitlements after restore.
- Record measured RPO/RTO, exceptions, owner, date, commit/config revision and remediation actions.

## Open acceptance checklist

- [ ] MongoDB Atlas backup policy and retention verified.
- [ ] MongoDB restore drill completed and measured.
- [ ] Firebase RTDB export/backup and restore method verified.
- [ ] Firebase Authentication recovery procedure verified.
- [ ] Cloudflare configuration reconstruction procedure verified.
- [ ] CDN/B2 recovery owner and evidence confirmed without modifying the CDN Worker.
- [ ] RPO/RTO approved by accountable owners.
- [ ] Restore drill evidence stored in an access-controlled location.


## Operator procedure: isolated recovery drill

The following commands are templates for an operator with approved provider access. They require the age encryption tool (https://age-encryption.org/) and an approved recipient/identity. Use a dedicated encrypted backup location and a separate restore project/database. Do not run restore commands against production.

Set an age recipient public key for backup creation and retain the corresponding private identity in the approved secret manager. Do not put the private identity in the repository, shell history, or backup directory. Use Bash with `set -o pipefail` so a failed export cannot be mistaken for a successful encrypted backup.

### MongoDB Atlas

Create a compressed, encrypted logical backup. The pipeline encrypts the dump before it reaches the destination:

```bash
set -euo pipefail
: "${MONGODB_URI:?Set the source Atlas connection string}"
: "${BACKUP_FILE:?Set an encrypted backup destination}"
: "${AGE_RECIPIENT:?Set the approved age recipient public key}"
mongodump --uri="$MONGODB_URI" --db=test --archive --gzip \
  | age -r "$AGE_RECIPIENT" -o "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

Restore into an isolated database namespace, not the production `test` namespace:

```bash
set -euo pipefail
: "${RESTORE_MONGODB_URI:?Set an isolated Atlas restore connection string}"
: "${BACKUP_FILE:?Set the encrypted backup archive path}"
: "${AGE_IDENTITY_FILE:?Set the protected age private identity file}"
sha256sum -c "$BACKUP_FILE.sha256"
age -d -i "$AGE_IDENTITY_FILE" "$BACKUP_FILE" \
  | mongorestore --uri="$RESTORE_MONGODB_URI" --archive --gzip \
      --nsFrom='test.*' --nsTo='test_restore.*'
```

After restore, compare collection counts and index definitions against the source inventory. Run application read-only smoke tests against the isolated database. Do not switch the Worker secret to the restored database until the owner approves the drill.

### Firebase Realtime Database and Authentication

Export RTDB data as an encrypted stream. Do not redirect the raw JSON export to a persistent plaintext file:

```bash
set -euo pipefail
: "${FIREBASE_PROJECT_ID:?Set the source Firebase project ID}"
: "${BACKUP_FILE:?Set an encrypted backup destination}"
: "${AGE_RECIPIENT:?Set the approved age recipient public key}"
firebase database:get / --project "$FIREBASE_PROJECT_ID" \
  | age -r "$AGE_RECIPIENT" -o "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

Restore only into a dedicated Firebase recovery project. The temporary plaintext file is created with owner-only permissions and removed on exit:

```bash
set -euo pipefail
: "${FIREBASE_RESTORE_PROJECT_ID:?Set the dedicated recovery project ID}"
: "${BACKUP_FILE:?Set the encrypted RTDB backup path}"
: "${AGE_IDENTITY_FILE:?Set the protected age private identity file}"
sha256sum -c "$BACKUP_FILE.sha256"
umask 077
RESTORE_FILE="$(mktemp)"
trap 'rm -f "$RESTORE_FILE"' EXIT
age -d -i "$AGE_IDENTITY_FILE" "$BACKUP_FILE" > "$RESTORE_FILE"
firebase database:set / "$RESTORE_FILE" --project "$FIREBASE_RESTORE_PROJECT_ID"
firebase deploy --only database --project "$FIREBASE_RESTORE_PROJECT_ID"
```

Export Firebase Authentication users to a protected temporary file, encrypt it, and remove the plaintext temporary file:

```bash
set -euo pipefail
: "${FIREBASE_PROJECT_ID:?Set the source Firebase project ID}"
: "${BACKUP_FILE:?Set an encrypted backup destination}"
: "${AGE_RECIPIENT:?Set the approved age recipient public key}"
umask 077
AUTH_EXPORT="$(mktemp)"
trap 'rm -f "$AUTH_EXPORT"' EXIT
firebase auth:export "$AUTH_EXPORT" --project "$FIREBASE_PROJECT_ID" --format=json
age -r "$AGE_RECIPIENT" -o "$BACKUP_FILE" "$AUTH_EXPORT"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
```

Authentication exports contain sensitive identity data. Encrypt them, restrict access, record export time, and validate password-hash import requirements before attempting any import. Never use a production identity export as test data.

The rules source file is not a substitute for a rules export from the live Firebase project. Preserve the reviewed source file and separately capture the deployed rules/configuration revision as evidence. Do not deploy rules to production as part of a backup test.

### Cloudflare and secrets

Reconstruct Pages and Worker code from the exact approved Git commit on `migrate-to-serverless`. Recreate bindings, Durable Object migrations, service bindings, routes, cron triggers and non-secret variables from the checked-in configuration and deployment workflow. Re-provision secrets from the approved secret manager. Cloudflare secrets cannot be recovered from Git and must never be written into this repository.

### Evidence required to close a restore drill

- [ ] Backup timestamp, source project/database and archive checksum recorded.
- [ ] Backup retention and encryption verified in the provider console.
- [ ] Restore completed into an isolated environment.
- [ ] MongoDB collection counts, indexes and representative records validated.
- [ ] Firebase chat membership and rules tested with two separate test identities.
- [ ] Authentication recovery/import tested without touching production accounts.
- [ ] Payment records reconciled against the merchant portal before entitlement validation.
- [ ] Measured restore duration and recoverable data point recorded.
- [ ] Technical owner and product owner sign-off recorded.

A successful backup job is not a successful restore drill. Do not mark this gap closed until the isolated restore and negative-access tests have evidence.
