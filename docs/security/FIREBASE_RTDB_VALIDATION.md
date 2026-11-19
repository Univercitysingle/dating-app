# Firebase Realtime Database Security Validation

**Source revision:** `8017d92aede13608574c498d9e324bf0edcdb9d8`  
**Branch:** `migrate-to-serverless`  
**Status:** Source regression checks passed. Live Firebase rules and two-account acceptance are not yet verified.

## Scope

The repository's `firebase.json` points Firebase CLI at `database.rules.json`. The rules currently:
- Deny root-level reads and writes.
- Permit a chat-room read only when the authenticated UID is present in `chatParticipants/{roomId}/{uid}` with value `true`.
- Deny client writes to chat history and both membership indexes.
- Permit notification reads only beneath the authenticated recipient's UID.
- Deny client writes to notifications.
- Deny all other paths by default.

The Worker manages chat membership and writes through its service credentials. Do not enable direct browser Realtime Database sync merely because the source rules or unit tests pass.

## Automated source checks

The Worker test command is `node --test *.test.js` from `workers/`. It includes `workers/firebase-rtdb-rules.test.js`, which checks:
1. Root default-deny and the exact allowlisted top-level paths.
2. Authenticated membership predicate for chat reads and denial of chat writes.
3. Client denial on `chatParticipants` and `chatUserRooms`.
4. Recipient-only notification reads and denial of client writes.
5. Firebase CLI configuration points to `database.rules.json`.

The test file was included in Worker staging workflow run [44598481067](https://github.com/Univercitysingle/dating-app/actions/runs/44598481067), which completed successfully for source SHA `8017d92aede13608574c498d9e324bf0edcdb9d8`. That workflow deploys the Cloudflare Worker and runs Worker tests. It does not deploy Firebase rules or prove the live Firebase project's active rules.

## Required Firebase Emulator and two-account acceptance

Before deploying the rules or enabling browser RTDB sync, run the Firebase Database Emulator against the exact rules file and retain sanitized test output. Verify the following matrix:

| Identity | Path/action | Expected result |
|---|---|---|
| Unauthenticated | Read any chat room | Denied |
| Authenticated non-member A | Read room belonging to B and C | Denied |
| Authenticated member B | Read room where membership index says B=true | Allowed |
| Authenticated member B | Write chat history directly | Denied |
| Authenticated user A | Read B's membership index | Denied |
| Authenticated user A | Write either membership index | Denied |
| Authenticated recipient A | Read notifications/A | Allowed |
| Authenticated user B | Read notifications/A | Denied |
| Any client identity | Write notifications/A | Denied |
| Blocked or unmatched user | Read room after Worker revokes membership | Denied |
| Previously removed member | Read room using stale client session after index revocation | Denied |

Use two disposable Firebase test accounts and a disposable room. Seed membership and notifications through an Admin SDK test fixture, not through client writes. Confirm the test setup itself does not grant broad emulator or production access. Do not use real user conversations or production notification content as fixtures.

## Deployment and rollback gate

1. Confirm the Firebase project ID and database instance in the Firebase Console.
2. Export or otherwise preserve the currently deployed rules for rollback.
3. Run Emulator tests against this exact source file.
4. Review Firebase IAM and service-account scope independently from RTDB rules.
5. Deploy with the Firebase CLI only after the test matrix passes and the owner approves the production/staging project change.
6. Read the deployed rules back from Firebase Console and record the deployment timestamp, project, operator, and sanitized evidence.
7. Repeat the two-account negative/positive checks against the intended Firebase environment.
8. Keep `ENABLE_FIREBASE_REALTIME_SYNC` and `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC` disabled until the deployed rules and client compatibility are confirmed.

A passing GitHub Actions run, a source JSON test, or a successful Cloudflare deployment is not evidence that Firebase rules were deployed.
