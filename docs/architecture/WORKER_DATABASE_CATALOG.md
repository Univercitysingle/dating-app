# Active Worker MongoDB collection catalogue

**Source:** `workers/mongodb-connection.js` blob `641b7851e107be99d3f55fbfabcf34595b40e888`  
**Legacy model source:** `models/*.js`  
**Reviewed:** 2026-11-11  
**Status:** Static source inventory, not a live Atlas schema export.

## Database selection

The Worker calls:

```js
client.db(this.env.MONGODB_DATABASE || undefined)
```

Therefore `MONGODB_DATABASE` overrides the database name embedded in `MONGODB_URI`; if it is unset, the URI default is used. Confirm the actual staging and production database names from the deployed Worker configuration without exposing the URI. Never infer the live database solely from a local configuration file.

MongoDB Atlas is the primary application database. The Worker accesses MongoDB through the `MONGODB_CONNECTION` Durable Object binding. Firebase Authentication remains the identity provider, Firebase Realtime Database remains part of chat integration, and the existing CDN Worker/B2 path remains separate.

## Active direct-Worker collections

The following collection names were found in direct MongoDB operations in `workers/mongodb-connection.js`. Collection names are case-sensitive in MongoDB. Field lists below are representative fields observed in source operations, not exhaustive validators.

| Collection | Purpose / observed fields | Notes |
|---|---|---|
| `users` | Firebase `uid`, email, name, profile, preferences, photos, location, role, account status, suspension/deletion markers, verification flags, subscription/entitlement state, private `relationshipPreferences` subdocument | Primary account/profile record. Public profile uses an allowlist; relationship preferences are owner-only and excluded from public profile serialization. |
| `matches` | `user1Uid`, `user2Uid`, `status`, `likedBy`, `superLike`, timestamps | Mutual-like, match and unmatch state. |
| `notifications` | `recipientUid`, `senderUid`, `type`, `status`, timestamps | Like/superlike/match and preference-driven events. |
| `subscriptions` | `userId`, `plan`, `status`, start/end dates, Stripe legacy identifier and WebXPay order references | Payment and entitlement lifecycle. Source contains an index migration for Stripe IDs. |
| `purchases` | `userId`, item identifiers/names/prices, payment/order status and provider metadata | Store purchases and checkout settlement. |
| `reports` | reporter/target UIDs, category, reason, status, admin notes, timestamps | Moderation queue and case outcome. |
| `auditlogs` | admin/actor IDs, action/event type, target, changes, message edit/delete events, timestamps | Audit evidence. Confirm immutability and retention controls at database level. |
| `supporttickets` | owner `userId`, ticket number, subject, status, priority, category, SLA due date, timestamps | User/admin support workflow. |
| `ticketmessages` | ticket ID, sender ID, message, internal-note flag, timestamps | User-visible and internal support messages. |
| `chatmessages` | room ID, sender/receiver UIDs, content, status, timestamp | Worker inbox/history and message moderation operations. Firebase RTDB remains part of the real-time chat integration. |
| `loginhistories` | user ID, IP address, timestamp | Sensitive operational data; restrict access and define retention. |
| `photoVerifications` | user identity, verification state, encrypted evidence metadata, expiry and review fields | Source creates a TTL index on `expiresAt`; confirm actual Atlas index exists. |
| `pushSubscriptions` | UID, endpoint, keys and subscription metadata/preferences | Push subscription registration and revocation. Treat endpoint and keys as sensitive. |
| `chatTyping` | room/user typing state and expiry metadata | Realtime typing/presence support; verify cleanup behaviour. |
| `callSessions` | caller/callee, call state, signalling and lifecycle timestamps | Call state coordination. |
| `videoRooms` | room, host, status, participant and lifecycle fields | Video room lifecycle. |
| `videoRoomTickets` | room/viewer, purchase and paid ticket state | Room access entitlement. |
| `creatorEarnings` | creator, transaction/room and earning amounts | Financial records require reconciliation and retention policy. |
| `darkfantasyprofiles` | UID, consent, visibility and profile data | Feature must remain gated pending legal, age, moderation and payment approvals. |
| `secretcommunitymemberships` | community slug, UID, membership status/role and request/review timestamps | Conditional feature data. |
| `secretcommunityposts` | community posts, status, author and content | Conditional feature data. |

Dynamic collection expressions are also used for purchase/subscription status based on transaction type. The table records the concrete names found in Worker source; it is not proof that every collection currently contains records in Atlas.

## Indexes and constraints observed in source

| Collection | Index / constraint | Source behaviour |
|---|---|---|
| `subscriptions` | Unique partial index on `stripeSubscriptionId` where value is a string | Worker migration drops/recreates legacy `stripeSubscriptionId_1`; handles missing legacy index codes. |
| `users` | 2dsphere index on `location` | Created during discovery operation with timeout guard. |
| `matches` | `{ user1Uid: 1, user2Uid: 1 }` and reverse participant index | Created by discovery/matching path. |
| `darkfantasyprofiles` | Unique `uid` index | Created during profile upsert. |
| `chatmessages` | `{ senderUid: 1, timestamp: -1, _id: -1 }` | Inbox latest-message query. |
| `chatmessages` | `{ receiverUid: 1, timestamp: -1, _id: -1 }` | Inbox latest-message query. |
| `chatmessages` | `{ receiverUid: 1, roomId: 1, status: 1 }` | Unread count aggregation. |
| `chatmessages` | Message-ID index | Created by message edit/delete path; confirm exact options in current source. |
| `photoVerifications` | TTL on `expiresAt`, `expireAfterSeconds: 0` | MongoDB deletes expired documents asynchronously. Confirm evidence lifecycle and legal retention before relying on TTL. |

These are indexes created or migrated by source paths. They are not a complete export of Atlas indexes. Other indexes may exist from Mongoose model declarations, manual Atlas changes, or previous migrations.

## Legacy Mongoose model schemas

The `models/` directory contains legacy Express/Mongoose model definitions. They are not automatically the active Worker schema. Examples:
- `User` declares unique sparse `uid`, unique `email`, a 2dsphere `location` index and descending `lastActiveAt` index, plus profile, lifestyle, preference, role and entitlement fields.
- `Subscription` declares user reference, plan/status enums, counters and start/end dates.
- `Purchase` declares user reference, item ID/name/price and pending/completed/rejected status.
- `Match` declares participant UIDs, match status, `likedBy` and super-like flag.
- `Notification` declares recipient/sender, type and status.
- `Report` declares reporter/target, category, reason, status and admin notes, with reporter/target and status/date indexes.
- `SupportTicket` declares owner, unique ticket number, subject and status.
- `TicketMessage` declares ticket/sender references, message and admin-origin flag.
- `ChatMessage` declares room, sender, receiver, content, timestamp and delivery status.
- `AuditLog` and `LoginHistory` declare administrative audit and login history records.

Mongoose pluralization normally maps these models to lower-case plural collection names. Direct Worker collection names and legacy Mongoose collection names must be compared explicitly before any migration or schema change. Do not assume legacy model validators or indexes are enforced by direct MongoDB driver writes.

## Data integrity and migration requirements

- Add a versioned schema/migration inventory for each collection.
- Verify uniqueness requirements in Atlas, especially user UID/email, match participant pairs, ticket numbers, provider order IDs and idempotency keys.
- Add compound indexes from measured query patterns, not speculative index lists.
- Review TTL only for data that is safe to expire. Do not TTL-delete legal, payment, audit or verification evidence without an approved retention policy.
- Use transactions for coupled payment settlement and entitlement changes where supported by the deployed Atlas tier/configuration.
- Make callbacks and retried writes idempotent.
- Define ownership and deletion propagation across MongoDB, Firebase, media storage, push subscriptions and backups.
- Export actual Atlas collection/index metadata before release and compare it with this document.
- Validate migration rollback using a staging snapshot before applying destructive index changes.

## Required live verification

- [ ] Confirm deployed `MONGODB_DATABASE` selection without exposing credentials.
- [ ] Export Atlas collection list and document counts.
- [ ] Export Atlas indexes and compare with source-created indexes.
- [ ] Verify unique indexes and detect duplicate legacy data before migration.
- [ ] Confirm TTL index and evidence retention policy for `photoVerifications`.
- [ ] Test backup/restore and post-restore index recreation.
- [ ] Run representative query explain plans for discovery, inbox, subscriptions and moderation.
- [ ] Confirm source and live collection names/fields do not drift.
