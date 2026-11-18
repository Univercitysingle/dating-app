# System Architecture
Last reviewed: 2026-11-07.

## Components
React on Cloudflare Pages; API on Cloudflare Workers; Durable Objects for shared state/coordination and configured Mongo connection handling; MongoDB Atlas primary; Firebase Authentication; existing Firebase Realtime Database chat; existing CDN Worker in front of private Backblaze B2; WebXPay integration; WebRTC with STUN/TURN; GitHub Actions.

## Trust boundaries
Browser input is untrusted. Worker verifies Firebase identity and resource authorization. MongoDB is the application system of record. Firebase RTDB rules and Worker checks both enforce conversation membership. CDN proxy owns B2 credentials. Payment callbacks require provider authenticity and order/amount/currency validation.

## Invariants
MongoDB remains primary; Firebase chat remains; existing CDN Worker is not changed; no Vercel; all changes on migrate-to-serverless; no private data in shared caches; Redis is not considered deployed without evidence.

## External validation
Verify RTDB rules, Atlas network/roles, CDN staging isolation, TURN configuration and payment callback credentials. A staging deploy is not production approval.


## Current implementation and verification status (2026-11-11)

The approved hosting target remains Cloudflare Pages for the frontend and Cloudflare Workers for API routes. MongoDB Atlas is the primary application database. Firebase Authentication and the existing Firebase Realtime Database chat integration remain. The existing CDN Worker/private Backblaze B2 path is retained and is outside the current change scope. Redis is a preferred secondary cache, not a verified deployed component. Durable Object bindings must be checked against the active Wrangler configuration and Cloudflare environment before relying on them.

GitHub Actions quota is exhausted. The latest call-quality source change is recorded at `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`, but its deployment and browser-level behaviour are not confirmed. No production cutover is approved. Validate Firebase RTDB rules externally, MongoDB Atlas access controls, TURN relay allocation, and end-to-end integrations before release. A configured integration is not proof of successful live connectivity.


## Operational completeness and acceptance gaps (2026-11-11)

Maintain a feature-level matrix with owner, implementation status, test coverage, staging evidence, last verified commit, operational dependency, and explicit release gate. Source presence alone is not completion. Verify API and frontend behaviour against the active Worker and deployed client, and keep planned capabilities labelled as planned.

The following cross-cutting acceptance items must be explicitly covered where relevant: API route/method/authentication/authorization and error contracts; MongoDB schema/index/uniqueness/TTL and migration behaviour; Firebase RTDB security rules and push notification subscription, delivery, retry and revocation; backup/restore drills with RPO/RTO; payment callback replay, idempotency, reconciliation, refunds and stale pending checkout recovery; moderation permissions for editing/deleting user and admin ticket/chat messages plus immutable audit records; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification permission coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL support. Any unverified dependency remains a release blocker or documented limitation.


## Call credential abuse controls (2026-11-18)

The Worker applies independent per-account Durable Object limits to standard call ICE configuration and paid Video Rooms ICE configuration: 20 credential requests per user per 60 seconds per route family. This is intentionally scoped to credential issuance, not signalling, call polling, history or media traffic. Limiter unavailability fails closed. Source and regression tests are committed, but execution and staging/device validation remain pending; do not treat this as verified runtime protection until those gates pass.
