# API Reference
Last reviewed: 2026-11-07. Keep this contract aligned with actual Worker route registrations.

## Route domains
Authentication, users/profiles, swipe/likes, matches, chat, notifications, reports/moderation, subscriptions, purchases/payments, support, admin, status/readiness and scheduled tasks.

## Per-route catalogue
Record exact method/path, purpose, authentication, authorization, validated request, response schema, side effects, rate limit, idempotency, error codes and test references. Derive exact paths from source, not controller filenames.

## Contract rules
Protected routes verify Firebase ID tokens server-side. Check ownership and role after authentication. Never trust client UID, role, price, entitlement or payment status. Exclude sensitive profile fields. Bound pagination and request bodies. Return safe errors without stack traces or secrets.

Update this document and contract tests whenever a route changes.
