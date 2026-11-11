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
