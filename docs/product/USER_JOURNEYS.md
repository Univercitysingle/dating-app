# User Journeys and Acceptance
Last reviewed: 2026-11-07. Use isolated Member A, Member B and Superadmin test accounts.

## Registration
Register, verify identity, complete onboarding, sign out/in. Verify invalid tokens, duplicate accounts, incomplete profiles and account restrictions.

## Profile and media
Edit own profile, upload/reorder/delete photo, view public profile as another member. Confirm contact/private fields are absent and media ownership is enforced.

## Discovery and matching
Configure reciprocal preferences, discover and like, complete mutual like, retry/concurrent like, unmatch and verify access revocation. Test gender/preference combinations, filters, blocks and account restrictions.

## Chat
Matched users exchange messages through existing Firebase RTDB. Test unread state, reconnect, duplicate retry, blocked/unmatched access and third-party denial.

## Safety
Report, block/unblock and unmatch. Superadmin reviews and records outcome. Confirm rate limits, duplicate-report policy, audit attribution and admin-only access.

## Payment
Create server-owned pending order; process provider payment; validate trusted callback; grant entitlement once. Test forged, replayed, delayed, mismatched, failed and refunded callbacks.

## Verification
Obtain explicit consent, submit encrypted evidence, reviewer decision, retry/rejection and deletion. Do not claim automated liveness or face matching unless independently integrated and validated.

## Video
Authorised create/join, signalling, STUN/TURN, reconnect, leave/timeout and cleanup. Test restrictive networks and real devices.

## Account closure
Request deletion, revoke access/entitlements, process linked data and document lawful retention exceptions.

Record branch, SHA, environment, test case, result and request ID. Never record credentials, tokens or raw evidence.


## Current execution status (2026-11-11)

Use this journey list as the staging acceptance checklist, not as a claim that every journey currently passes. The call/video journey specifically still requires two real devices, responsive viewport checks, camera switching, minimize/restore, reconnect, restrictive-network/TURN relay validation, audio continuity and measured data usage. Chat realtime security requires deployed Firebase RTDB rule verification. Payment requires a real provider sandbox callback. GitHub Actions quota exhaustion currently prevents a fresh automated workflow run. Record exact commit SHA and evidence for each journey.


## Traceability and outstanding verification (2026-11-11)

Every requirement, metric, journey and finding must map to an implementation reference, test, staging evidence, owner, status, last verified commit, and release decision. Do not infer feature adoption, reliability, security, or capacity from source code or analytics instrumentation alone. Define metric event names, properties, privacy classification, sampling, retention, denominator, exclusion rules, and dashboard ownership before using metrics for decisions.

Keep the following open until supported by evidence: complete API contract and authorization matrix; MongoDB schema/index/TTL and migration inventory; Firebase RTDB rules and push subscription/delivery/revocation tests; backup/restore exercises with RPO/RTO; payment replay/reconciliation/refund/stale-pending tests; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL readiness.
