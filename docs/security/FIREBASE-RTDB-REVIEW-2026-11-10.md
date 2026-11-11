# Firebase Realtime Database Security Review

Date: 2026-11-10
Branch: `migrate-to-serverless`

## Scope

This review covers the Firebase Realtime Database integration only. IPG and the CDN Worker are explicitly out of scope. No Firebase console settings or live database data were changed.

## Repository findings

- No `database.rules.json`, `firebase.json`, or `.firebaserc` is present in this branch.
- The Cloudflare Worker/backend writes chat messages under `chats/{roomId}/{messageId}` using the Firebase Admin SDK.
- It writes notifications under `notifications/{recipientUid}/{notificationId}`.
- The web chat page can attach an RTDB `onChildAdded` listener at `chats/{chatId}` when `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC=true`.
- The VAPT assessment already records that Firebase Admin SDK writes bypass client RTDB rules and that the deployed project's external rules and IAM settings have not been inspected.

## Security conclusion

**Firebase RTDB client access remains unverified and is a production release blocker.** Repository inspection cannot establish the rules currently deployed in the Firebase console. Do not assume that Worker authorization protects direct browser RTDB reads.

The current message path contains room IDs and message data, but the repository does not establish a Firebase-side, rules-readable authoritative membership/eligibility record for each room. Therefore, a permissive rule based only on an authenticated user's UID, a supplied room ID, or message sender/receiver fields would be unsafe. Do not deploy such a rule.

## Required Firebase Console actions

1. Open Firebase Console for the configured project and inspect Realtime Database > Rules. Export/copy the currently deployed rules before making changes.
2. Confirm unauthenticated reads and writes are denied.
3. Confirm an authenticated third party cannot read another room's messages by guessing or learning its room ID.
4. Confirm only the intended participants can read a room, and that block, unmatch, suspension, and account deletion revoke access.
5. Confirm users cannot write arbitrary messages, impersonate another sender, alter timestamps, or write notifications for another UID.
6. Confirm the `notifications/{uid}` path is readable only by that UID and is not client-writable unless a separately validated write use case requires it.
7. Verify Firebase service-account IAM is least-privilege and credentials are not exposed in frontend build variables.
8. Record the deployed rules version and run the negative tests below before enabling realtime sync in production.

## Required negative tests

- Unauthenticated read and write to `/chats/{roomId}`: denied.
- Authenticated non-member read and write to `/chats/{roomId}`: denied.
- Participant read of an authorized room: allowed only while membership is active.
- Former participant read after unmatch or block: denied.
- Suspended/deleted account read: denied.
- User A read/write under `/notifications/UserB`: denied.
- Client write attempting to set another `senderUid` or `recipientUid`: denied.

## Safe implementation decision

No RTDB rules file was invented or deployed because the authoritative membership model and live Firebase rules are not available in this repository. Keep the realtime client listener disabled until the external rules are verified. Server-side Admin SDK writes remain subject to the Worker application's own authorization checks.

## Follow-up evidence required

- Screenshot or exported JSON of the deployed RTDB rules (secrets redacted).
- Firebase project IAM/service-account review.
- Results of the negative tests above.
- Confirmation whether `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC` is enabled in the staging and production Pages environments.


## Follow-up status (2026-11-11)

No external Firebase Console evidence has been added since this review. Deployed RTDB rules, project IAM and negative-test results remain unverified. Keep `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC` disabled in production until the evidence listed above is collected and reviewed. Do not create permissive rules based only on a client-supplied room ID or message fields. GitHub Actions quota exhaustion does not change this security conclusion.


## Traceability and outstanding verification (2026-11-11)

Every requirement, metric, journey and finding must map to an implementation reference, test, staging evidence, owner, status, last verified commit, and release decision. Do not infer feature adoption, reliability, security, or capacity from source code or analytics instrumentation alone. Define metric event names, properties, privacy classification, sampling, retention, denominator, exclusion rules, and dashboard ownership before using metrics for decisions.

Keep the following open until supported by evidence: complete API contract and authorization matrix; MongoDB schema/index/TTL and migration inventory; Firebase RTDB rules and push subscription/delivery/revocation tests; backup/restore exercises with RPO/RTO; payment replay/reconciliation/refund/stale-pending tests; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL readiness.
