# Firebase Realtime Database Security Review

Date: 2026-11-19
Branch: `migrate-to-serverless`

## Scope and release decision

This review covers Firebase Realtime Database client access and the Cloudflare Worker synchronization path. It does not change Firebase Console settings, deployed rules, Firebase IAM, IPG, or the CDN Worker.

**Client realtime synchronization remains disabled until the deployed Firebase rules and IAM configuration are independently verified.** The repository now contains a reviewable rules source at `database.rules.json`; committing that file does not deploy it to Firebase.

## Source-controlled client rules

The rules in `database.rules.json` enforce:

- Root-level reads and writes denied by default.
- Chat reads require a signed-in user whose UID is explicitly present in `chatParticipants/{roomId}`.
- Client writes to chats, membership records, inverse indexes, and notifications denied.
- `chatParticipants` and `chatUserRooms` are not client-readable.
- Notifications are readable only by the matching recipient UID.

The Worker uses Firebase Admin credentials for trusted writes. Admin SDK access bypasses client RTDB rules, so Worker authorization and service-account IAM remain security boundaries.

## Worker membership lifecycle implemented

- `syncChatRoomMembership` writes the per-user inverse index at `chatUserRooms/{uid}/{roomId}` before granting the room membership at `chatParticipants/{roomId}`.
- Authorized chat-history requests backfill membership and messages for legacy conversations.
- Unmatch and block revoke the room grant and both inverse-index entries.
- Account suspension and permanent ban revoke all indexed rooms and discover legacy rooms from MongoDB chat history.
- Account deletion revokes memberships before Firebase identity deletion.
- Revocation failures are surfaced as retry-pending rather than reported as completed.
- Restoring an account does not grant access to rooms that have been revoked. Authorized chat-history backfill can re-establish membership only when the conversation remains eligible.

## Required Firebase Console verification

1. Export the currently deployed Realtime Database rules and compare them with `database.rules.json`.
2. Confirm the Firebase project ID and database URL match the Cloudflare staging environment.
3. Review the service account's IAM roles and reduce them to the minimum required for token issuance and RTDB access.
4. Confirm service-account credentials are Worker secrets and never exposed as frontend build variables.
5. Run the negative tests below against the deployed Firebase project using two test accounts.

## Required live negative tests

- Anonymous read/write to `/chats/{roomId}`: denied.
- Authenticated non-member read/write to another room: denied.
- Authorized participant read while membership is active: allowed.
- Former participant read after unmatch or block: denied.
- Suspended, banned, and deleted account read: denied after revocation.
- User A read/write under `/notifications/UserB`: denied.
- Client write to `chatParticipants`, `chatUserRooms`, or any chat message: denied.
- Worker membership grant and revocation: verify both room membership and inverse indexes.

## Remaining release blockers

- Deployed Firebase Console rules have not been independently exported and verified in this repository.
- Firebase service-account IAM least-privilege review remains outstanding.
- Two-account live tests for unmatch, block, suspension, deletion, and reactivation remain outstanding.
- Push subscription delivery and revocation tests remain outstanding.
- Backup/restore exercises, payment reconciliation tests, accessibility and browser/device coverage remain separate release gates.

Do not enable `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC` or `ENABLE_FIREBASE_REALTIME_SYNC` for production until the external evidence and negative tests above are complete.
