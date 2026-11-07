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
