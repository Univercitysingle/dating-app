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
