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
