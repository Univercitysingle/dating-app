# Matching and Discovery Specification
Last reviewed: 2026-11-18.

Eligibility is server-authoritative and must satisfy both users' preferences, visibility, account status, age/location rules and product exclusions. Exclude self, blocked pairs in either direction, suspended/banned/deleted accounts and ineligible profiles.

Likes must validate verified actor identity and target, reject self-like, prevent duplicates and handle concurrent reciprocal likes without duplicate matches. Define pass, undo, re-like and unmatch semantics. Unmatch revokes chat/call permissions. Ranking never overrides safety or eligibility.

Acceptance: preference combinations including Other/everyone where supported; reciprocal mismatch; age/location boundaries; empty results; blocks both directions; account restrictions; simultaneous likes; retries; undo; unmatch; stable pagination.


## Current acceptance status (2026-11-11)

This document defines required behaviour, not a claim that every edge case has passed. The current release priority remains authentication/profile management first, discovery/likes/matching second, then conversations/messaging. Require multi-account staging tests for reciprocal preference combinations, blocked pairs in both directions, duplicate/concurrent likes, pagination, unmatch and access revocation. The latest verified Cloudflare Pages workflow is run #725 at frontend commit `23fe494112f57870878221f9ba7da9ba2a29eac5` (success). The latest verified staging Worker deployment is run #1010 at Worker commit `d2ac08fcb21cc0baff4faadfbadf8f5563a14861` (success). The frontend commit is newer, but the intervening commits contain no Worker source changes. Record exact source SHA and evidence before changing feature statuses to complete.


## Operational completeness and acceptance gaps (2026-11-11)

Maintain a feature-level matrix with owner, implementation status, test coverage, staging evidence, last verified commit, operational dependency, and explicit release gate. Source presence alone is not completion. Verify API and frontend behaviour against the active Worker and deployed client, and keep planned capabilities labelled as planned.

The following cross-cutting acceptance items must be explicitly covered where relevant: API route/method/authentication/authorization and error contracts; MongoDB schema/index/uniqueness/TTL and migration behaviour; Firebase RTDB security rules and push notification subscription, delivery, retry and revocation; backup/restore drills with RPO/RTO; payment callback replay, idempotency, reconciliation, refunds and stale pending checkout recovery; moderation permissions for editing/deleting user and admin ticket/chat messages plus immutable audit records; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification permission coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL support. Any unverified dependency remains a release blocker or documented limitation.
