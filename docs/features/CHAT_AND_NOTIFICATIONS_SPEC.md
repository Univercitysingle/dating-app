# Chat and Notifications Specification
Last reviewed: 2026-11-10.

Firebase Realtime Database remains an optional realtime chat integration. The Cloudflare Worker remains responsible for authoritative conversation authorization. The browser listener is enabled only when `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC=true`.

**Security prerequisite:** Firebase Realtime Database rules and project IAM must independently restrict direct client access. The deployed rules have not yet been externally verified. Do not treat Worker authorization as protection for direct browser RTDB reads. See [Firebase RTDB Security Review](../security/FIREBASE-RTDB-REVIEW-2026-11-10.md). Keep the client realtime listener disabled in production until the required external rule checks pass.

Required behaviours: send/receive, ordering, read/unread where supported, typing/presence where enabled, reconnect/offline recovery, safe attachments, notification preferences and stale membership cleanup. Block, unmatch, suspension and deletion revoke access through the authoritative Worker API and, once verified, the RTDB rules.

Notifications originate from trusted server events, respect preferences and avoid duplicates on retries. Prefer event-driven updates; fallback polling must be bounded and backoff-capable. Client notification reads must be scoped to the authenticated recipient.

Acceptance: member send/receive, third-party denial, block/unmatch denial, duplicate retry, reconnect, unread state, preference enforcement, rate limits, unauthenticated RTDB denial, cross-room RTDB denial, cross-user notification denial, and revocation after unmatch/block/suspension/deletion.


## Current validation note (2026-11-11)

Firebase RTDB client rules and IAM remain externally unverified as recorded in the security review dated 2026-11-10. Keep direct client realtime sync disabled until unauthenticated, non-member, blocked/unmatched and cross-user notification tests pass against deployed rules. Worker-side authorization does not protect direct RTDB listeners. GitHub Actions quota exhaustion currently prevents a fresh automated deployment/acceptance run. Do not mark realtime chat security as complete based solely on Worker unit tests.


## Operational completeness and acceptance gaps (2026-11-11)

Maintain a feature-level matrix with owner, implementation status, test coverage, staging evidence, last verified commit, operational dependency, and explicit release gate. Source presence alone is not completion. Verify API and frontend behaviour against the active Worker and deployed client, and keep planned capabilities labelled as planned.

The following cross-cutting acceptance items must be explicitly covered where relevant: API route/method/authentication/authorization and error contracts; MongoDB schema/index/uniqueness/TTL and migration behaviour; Firebase RTDB security rules and push notification subscription, delivery, retry and revocation; backup/restore drills with RPO/RTO; payment callback replay, idempotency, reconciliation, refunds and stale pending checkout recovery; moderation permissions for editing/deleting user and admin ticket/chat messages plus immutable audit records; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification permission coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL support. Any unverified dependency remains a release blocker or documented limitation.
