# Moderation and Administration Specification
Last reviewed: 2026-11-07.

Member controls: report, block, unblock and unmatch, validated server-side and rate-limited. Define categories, evidence limits, duplicate policy and confirmation.

Enforcement: warning, content removal, suspension, ban, appeal and deletion are distinct actions. Restrictions propagate to discovery, chat, calls, payments and admin views.

Admin access uses server-verified roles and least privilege. Ordinary users cannot access queues, audit history, verification evidence or payment administration. Audit actor, target, action, outcome, timestamp and reason without unnecessary sensitive content.

Define queue prioritisation, escalation, ownership and service coverage. Do not promise 24/7 moderation unless staffed.

Tests: user denial, IDOR, role escalation, rate-limit exhaustion, fail-closed limiter, block propagation, duplicate report and audit completeness.


## Current implementation status (2026-11-11)

Treat report/block/unmatch, support-ticket message management, admin audit history, abuse controls and role separation as separate acceptance items. Do not infer that a UI control is backed by an authorized API operation. Verify user/admin edit and delete permissions for ticket messages, audit all privileged changes, and test IDOR and role escalation with separate accounts. The current project priority is to finish core authentication, discovery and messaging before broadening admin scope. GitHub Actions quota exhaustion prevents fresh CI confirmation; retain unverified items as outstanding.


## Operational completeness and acceptance gaps (2026-11-11)

Maintain a feature-level matrix with owner, implementation status, test coverage, staging evidence, last verified commit, operational dependency, and explicit release gate. Source presence alone is not completion. Verify API and frontend behaviour against the active Worker and deployed client, and keep planned capabilities labelled as planned.

The following cross-cutting acceptance items must be explicitly covered where relevant: API route/method/authentication/authorization and error contracts; MongoDB schema/index/uniqueness/TTL and migration behaviour; Firebase RTDB security rules and push notification subscription, delivery, retry and revocation; backup/restore drills with RPO/RTO; payment callback replay, idempotency, reconciliation, refunds and stale pending checkout recovery; moderation permissions for editing/deleting user and admin ticket/chat messages plus immutable audit records; account export/deletion propagation and backup retention; browser/device/PWA/offline/notification permission coverage; keyboard/screen-reader/contrast/form accessibility; localization, timezone and RTL support. Any unverified dependency remains a release blocker or documented limitation.
