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
