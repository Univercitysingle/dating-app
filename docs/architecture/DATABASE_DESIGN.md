# Database Design
Last reviewed: 2026-11-07. MongoDB Atlas is the primary application database.

## Known domains
Users/profiles, subscriptions, purchases/transactions, matches, chat metadata, notifications, reports, support tickets/messages, login history, audit events and photo verification records. Verify actual collection names and schema against current Worker and legacy model source before migration.

## Requirements
Document fields/types, owner key, references, indexes, uniqueness, lifecycle, retention/TTL, PII classification and read/write paths for each collection. Use least-privilege DB roles, TLS, bounded queries, stable pagination and projections. Enforce ownership in application logic. Make multi-step financial and entitlement transitions atomic or safely idempotent.

## Connections
Pool and Durable Object shard configuration must be tested against Atlas tier limits. Configured pool capacity is not evidence of concurrent-user capacity.

## Firebase boundary
Firebase RTDB remains chat realtime integration. Document exact paths, rules, membership and cleanup separately.


## Current status and open validation (2026-11-11)

MongoDB Atlas remains the primary application database. The currently documented staging database is `test` on Cluster0, with connection details supplied only through `MONGODB_URI`; do not hardcode database credentials or assume production data is in scope. Firebase RTDB remains the existing chat integration. Redis is a desired secondary cache but is not confirmed as deployed. Confirm actual collection names, indexes, TTL behaviour, Atlas network access, database roles, backup/restore and connection limits against the live configuration before relying on them. GitHub Actions quota exhaustion means no new automated migration acceptance evidence is available at this time.


## Completeness, ownership and verification gaps (2026-11-11)

Treat this specification as a living contract. For each item, record implementation status, automated test, staging evidence, last verified commit, owner, dependency, and rollback/retention impact. Distinguish documented design from verified runtime behaviour. Reconcile against source and staging before release.

Cross-cutting gaps requiring explicit closure: a complete API route/method/authz/schema/error catalogue; MongoDB collection schemas, indexes, uniqueness, TTL and migration/rollback definitions; Firebase RTDB rules and push subscription/delivery/retry lifecycle; tested backup/restore with RPO/RTO; payment replay/idempotency/reconciliation/refund and stale-pending recovery; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; supported browser/device, PWA/offline and notification permission matrix; accessibility checks for keyboard, screen readers, contrast and forms; localization, timezone and RTL readiness. Do not imply these are implemented unless backed by evidence.


## Source-backed Worker collection inventory (2026-11-11)

Use [WORKER_DATABASE_CATALOG.md](./WORKER_DATABASE_CATALOG.md) for the active direct-Worker collection list, observed fields, source-created indexes and legacy Mongoose model comparison. The reviewed Worker source blob was `641b7851e107be99d3f55fbfabcf34595b40e888`.

Important implementation distinction:
- The Worker uses the MongoDB driver directly through the `MongoDBConnection` Durable Object.
- The legacy `models/*.js` files define Mongoose schemas and indexes for the Express code path. Those validators and indexes are not automatically applied to direct Worker writes.
- `MONGODB_DATABASE` overrides the database embedded in `MONGODB_URI`; otherwise the URI default is used. Confirm deployed configuration without exposing the URI.
- Source-created indexes are only a partial inventory. Export actual Atlas indexes and collection metadata before release.

Do not run schema/index migrations based solely on this document. Confirm duplicate data, backup/restore readiness and rollback first.




## Proposed intent and consent data domains (2026-11-18)

The new product specification proposes logical entities for profile preferences, profile intentions, profile tags, first-move preferences, profile links, discovery groups, group-match consents, Pings, private-media grants, privacy preferences and moderation events. These are logical boundaries only, not approved collection names or migrations.

Before implementation:
- Reconcile every proposed entity with the active Worker database catalog and existing collections to avoid duplicate sources of truth.
- Classify orientation, relationship intention and desire data as sensitive. Restrict reads to the owner and explicitly authorised operations; never expose them by default in public profile responses, logs, analytics or advertising systems.
- Model partner links as invitation/acceptance/revocation records with both user IDs, state transitions, timestamps and append-only audit events. Never share credentials or private chats.
- Model group membership and group-match consent per individual member. Activate a group match only after every required member consents.
- Model private-media access as explicit grants with owner, recipient, asset, expiry and revocation. Enforce authorization at the existing media delivery boundary; do not change the CDN Worker as part of this design.
- Define indexes, uniqueness, TTL, deletion propagation, backup retention and rollback before any migration. Preserve MongoDB Atlas as primary and Firebase RTDB as the existing chat integration.

See [Relationship Discovery, Intent and Consent Specification](../features/RELATIONSHIP_DISCOVERY_INTENT_AND_CONSENT_SPEC.md). No new collection, index or route is approved by this design document alone.
