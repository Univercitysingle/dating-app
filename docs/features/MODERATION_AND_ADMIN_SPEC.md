# Moderation and Administration Specification
Last reviewed: 2026-11-07.

Member controls: report, block, unblock and unmatch, validated server-side and rate-limited. Define categories, evidence limits, duplicate policy and confirmation.

Enforcement: warning, content removal, suspension, ban, appeal and deletion are distinct actions. Restrictions propagate to discovery, chat, calls, payments and admin views.

Admin access uses server-verified roles and least privilege. Ordinary users cannot access queues, audit history, verification evidence or payment administration. Audit actor, target, action, outcome, timestamp and reason without unnecessary sensitive content.

Define queue prioritisation, escalation, ownership and service coverage. Do not promise 24/7 moderation unless staffed.

Tests: user denial, IDOR, role escalation, rate-limit exhaustion, fail-closed limiter, block propagation, duplicate report and audit completeness.


## Current implementation status (2026-11-11)

Treat report/block/unmatch, support-ticket message management, admin audit history, abuse controls and role separation as separate acceptance items. Do not infer that a UI control is backed by an authorized API operation. Verify user/admin edit and delete permissions for ticket messages, audit all privileged changes, and test IDOR and role escalation with separate accounts. The current project priority is to finish core authentication, discovery and messaging before broadening admin scope. GitHub Actions quota exhaustion prevents fresh CI confirmation; retain unverified items as outstanding.
