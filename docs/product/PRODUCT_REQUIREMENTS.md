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
