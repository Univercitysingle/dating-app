# Feature Roadmap
Last reviewed: 2026-11-07. This is prioritisation, not a delivery-date promise.

| Priority | Workstream | Exit evidence |
|---|---|---|
| P0 | Payments | Verified callback, order binding, idempotency, entitlement lifecycle, reconciliation tests |
| P0 | Media | Authenticated upload/read/delete and support attachment staging tests using unchanged CDN |
| P0 | Core journeys | Multi-account registration, discovery, match, chat, report/block and deletion |
| P0 | Security | IDOR/authorization, admin boundaries, secrets review and high-risk remediation |
| P1 | Verification | Consent, encrypted evidence, review, retry, deletion and legal review |
| P1 | Video rooms | Permissions, signalling, TURN, cleanup, moderation and billing acceptance |
| P1 | Performance | Repeatable load tests and dependency telemetry |
| P2 | Analytics | Event taxonomy, accuracy, privacy and dashboards |
| P2 | Optimisation | Onboarding, discovery ranking and notification tuning based on evidence |

Release gates: tests, security review, staging evidence and rollback. Production requires separate approval.


## Roadmap status update (2026-11-11)

Current execution order remains: (1) authentication and profile management, (2) discovery, likes and matching, (3) conversations and messaging, then API error handling and broader admin/security hardening. Call/video quality adaptation exists in source but is not deployment- or device-validated. Firebase RTDB rule verification, WebXPay sandbox acceptance, media integration checks and responsive two-device call testing remain open. GitHub Actions quota exhaustion is blocking fresh automated release evidence. Do not assign delivery dates or mark roadmap items complete without evidence.


## Traceability and outstanding verification (2026-11-11)

Every requirement, metric, journey and finding must map to an implementation reference, test, staging evidence, owner, status, last verified commit, and release decision. Do not infer feature adoption, reliability, security, or capacity from source code or analytics instrumentation alone. Define metric event names, properties, privacy classification, sampling, retention, denominator, exclusion rules, and dashboard ownership before using metrics for decisions.

Keep the following open until supported by evidence: complete API contract and authorization matrix; MongoDB schema/index/TTL and migration inventory; Firebase RTDB rules and push subscription/delivery/revocation tests; backup/restore exercises with RPO/RTO; payment replay/reconciliation/refund/stale-pending tests; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL readiness.



## Intent-first dating product expansion (2026-11-18)

The product expansion is a deliberate blend of fast swipe discovery, intentional conversation controls, and flexible relationship exploration. Detailed requirements are in [RELATIONSHIP_DISCOVERY_INTENT_AND_CONSENT_SPEC.md](../features/RELATIONSHIP_DISCOVERY_INTENT_AND_CONSENT_SPEC.md).

| Priority | Workstream | Scope | Exit evidence |
|---|---|---|---|
| P0 | Product and privacy foundation | Launch-country/legal review, 18+ age assurance, identity taxonomy, sensitive-data classification, threat model | Approved jurisdiction matrix, data map, retention policy, authorization matrix |
| P1 | Intent-rich individual profiles | Optional relationship intentions, identity fields, interests/desire tags, glossary, field-level visibility | Multi-account tests, public API privacy tests, preference migration tests |
| P1 | Intent-aware discovery | Swipe, intent filters, explainable ranking, mutual eligibility | Reciprocal preference, block, pagination, ranking and fairness tests |
| P1 | Intentional interactions | First-move preferences, prompt-first opener, invitation, Pings and note controls | Opener permission, spam, moderation, cooldown and notification tests |
| P1 | Privacy controls | Incognito, pause discovery, private-photo grants, approximate location | Non-discovery tests, grant expiry/revocation and media authorization tests |
| P2 | Consensual partner links | Invitation/acceptance, linked visibility, independent accounts, unlink | Dual-consent, unilateral revocation, block, deletion and chat-isolation tests |
| P2 | Group discovery and chat | Group membership, per-member acceptance, group matches and moderation | All-member consent, membership revocation, reporting and abuse/load tests |
| P3 | Optimisation and premium | Relevance experiments, advanced filters, privacy-safe insights | Privacy review, fairness monitoring, subscription and revenue acceptance |

**Important sequencing:** do not begin group discovery before individual consent, report/block, unmatch, chat membership, account deletion and audit behaviour are proven. Do not monetise safety, consent revocation, reporting, blocking or baseline privacy. Do not use sensitive identity or desire data for advertising or sell it.

All new work stays on migrate-to-serverless and preserves the current Cloudflare/MongoDB/Firebase/CDN architecture. These items are planned until source, automated tests and staging evidence exist.
