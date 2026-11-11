# Product Requirements
Last reviewed: 2026-11-07. Authority: ../PRODUCT_MINDMAP.md.

## Scope
Accounts, profiles, discovery, likes/matches, chat, notifications, reporting/blocking, moderation, subscriptions, store purchases, selfie verification, video experiences, administration and operations.

## Roles
Visitor; authenticated member; paid member with server-granted entitlement; moderator/admin; superadmin. Roles and entitlements are enforced by the API, never trusted from browser input.

## Global requirements
- Verify identity and resource ownership server-side.
- Exclude blocked, suspended, banned, deleted and ineligible accounts consistently.
- Keep email, mobile, password material, login IP and private preferences out of public profiles.
- Validate all input; rate-limit sensitive operations; audit privileged moderation and financial actions.
- Make payment settlement and other value-changing retries idempotent.
- Protect sensitive evidence and media with access controls, encryption and retention.
- Responsive, accessible user journeys and safe, understandable errors.

## Non-functional constraints
Cloudflare Pages/Workers; MongoDB Atlas primary; Firebase Authentication and existing Firebase Realtime Database chat; existing CDN Worker retained; no Vercel. Redis is not assumed deployed. Do not cache private user-specific data in shared caches.

## Acceptance
Every requirement must map to source, tests and staging evidence. Status vocabulary: implemented and tested; implemented, validation outstanding; partial; not implemented; blocked. A UI or route alone is not proof of completion.

## Decisions requiring product approval
Age/jurisdiction rules, supported countries, catalogue/prices/currencies, refund policy, verification service level, video pricing, retention periods and analytics consent.


## Current status clarification (2026-11-11)

Use the status vocabulary above rigorously. The latest call-quality code includes automatic bitrate/resolution/FPS adaptation and audio-first degradation, but its deployment and real-device behaviour remain unverified. The target of 1,000 concurrent users is not capacity-certified. Firebase RTDB rules, WebXPay sandbox settlement, upload lifecycle, mobile/desktop call responsiveness and full core-journey regression require evidence. GitHub Actions quota is exhausted, so the latest source cannot be assumed deployed. Production release and DNS cutover require separate approval.


## Traceability and outstanding verification (2026-11-11)

Every requirement, metric, journey and finding must map to an implementation reference, test, staging evidence, owner, status, last verified commit, and release decision. Do not infer feature adoption, reliability, security, or capacity from source code or analytics instrumentation alone. Define metric event names, properties, privacy classification, sampling, retention, denominator, exclusion rules, and dashboard ownership before using metrics for decisions.

Keep the following open until supported by evidence: complete API contract and authorization matrix; MongoDB schema/index/TTL and migration inventory; Firebase RTDB rules and push subscription/delivery/revocation tests; backup/restore exercises with RPO/RTO; payment replay/reconciliation/refund/stale-pending tests; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL readiness.
