# API Reference
Last reviewed: 2026-11-07. Keep this contract aligned with actual Worker route registrations.

## Route domains
Authentication, users/profiles, swipe/likes, matches, chat, notifications, reports/moderation, subscriptions, purchases/payments, support, admin, status/readiness and scheduled tasks.

## Per-route catalogue
Record exact method/path, purpose, authentication, authorization, validated request, response schema, side effects, rate limit, idempotency, error codes and test references. Derive exact paths from source, not controller filenames.

## Contract rules
Protected routes verify Firebase ID tokens server-side. Check ownership and role after authentication. Never trust client UID, role, price, entitlement or payment status. Exclude sensitive profile fields. Bound pagination and request bodies. Return safe errors without stack traces or secrets.

Update this document and contract tests whenever a route changes.


## Current route verification status (2026-11-11)

This file is a route-domain and contract checklist, not an exhaustive verified endpoint inventory. Exact methods, paths, middleware, response schemas and side effects must be derived from current Worker route registration and tests at the target commit. Do not infer route availability from legacy Express controllers or UI links. GitHub Actions quota is exhausted, so a fresh CI route-inventory run is not available. Record the tested source SHA and test evidence when the workflow can run again. Keep client UID, role, price, payment status and entitlement claims untrusted; verify Firebase identity and resource authorization server-side.


## Completeness, ownership and verification gaps (2026-11-11)

Treat this specification as a living contract. For each item, record implementation status, automated test, staging evidence, last verified commit, owner, dependency, and rollback/retention impact. Distinguish documented design from verified runtime behaviour. Reconcile against source and staging before release.

Cross-cutting gaps requiring explicit closure: a complete API route/method/authz/schema/error catalogue; MongoDB collection schemas, indexes, uniqueness, TTL and migration/rollback definitions; Firebase RTDB rules and push subscription/delivery/retry lifecycle; tested backup/restore with RPO/RTO; payment replay/idempotency/reconciliation/refund and stale-pending recovery; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; supported browser/device, PWA/offline and notification permission matrix; accessibility checks for keyboard, screen readers, contrast and forms; localization, timezone and RTL readiness. Do not imply these are implemented unless backed by evidence.
