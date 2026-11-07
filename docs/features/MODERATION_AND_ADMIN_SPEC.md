# Moderation and Administration Specification
Last reviewed: 2026-11-07.

Member controls: report, block, unblock and unmatch, validated server-side and rate-limited. Define categories, evidence limits, duplicate policy and confirmation.

Enforcement: warning, content removal, suspension, ban, appeal and deletion are distinct actions. Restrictions propagate to discovery, chat, calls, payments and admin views.

Admin access uses server-verified roles and least privilege. Ordinary users cannot access queues, audit history, verification evidence or payment administration. Audit actor, target, action, outcome, timestamp and reason without unnecessary sensitive content.

Define queue prioritisation, escalation, ownership and service coverage. Do not promise 24/7 moderation unless staffed.

Tests: user denial, IDOR, role escalation, rate-limit exhaustion, fail-closed limiter, block propagation, duplicate report and audit completeness.
