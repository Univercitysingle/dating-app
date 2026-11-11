# Terms and Community Guidelines
Status: policy outline, not approved legal terms. Last reviewed: 2026-11-07.

Decisions required: eligibility/minimum age and age assurance; account accuracy/impersonation; consent and respectful conduct; harassment/discrimination; prohibited content and non-consensual media; report/block/moderation/appeal; subscription billing/cancellation/refunds; user content rights; privacy/deletion; geographic availability.

Explain how users report concerns, block members and appeal decisions. Do not promise continuous moderation coverage unless staffed and operationally supported.

Qualified counsel must review consumer, privacy, payment and country-specific requirements before publication. This is an internal checklist, not a contract.


## Publication status (2026-11-11)

This remains an internal policy checklist and is not approved legal terms or a published community standard. Before launch, resolve minimum age and age assurance, operator and market jurisdiction, user content and consent, prohibited content, report/block/unmatch enforcement, moderation response coverage, appeals, billing/cancellation/refunds, privacy and deletion. Dark Fantasy must remain disabled until its separate legal, age-assurance, processor and moderation gates are approved. Do not publish this outline as a binding contract.


## Operational evidence gaps and controls (2026-11-11)

For each control or procedure, identify the owner, prerequisites, exact command or dashboard path where safe, expected result, failure handling, evidence location, last verified commit, and review cadence. Never document a procedure as proven until it has been exercised in the intended environment. Keep production and staging instructions distinct.

Required evidence areas to maintain: route-level API authorization and error-contract tests; MongoDB schema/index/TTL and migration/rollback checks; Firebase RTDB rule tests and push notification lifecycle; MongoDB backup/restore and Firebase recovery exercises with approved RPO/RTO; payment callback replay/idempotency/reconciliation/refund and stale-checkout tests; moderation and support-ticket message permissions with immutable audit history; account export/deletion and backup retention; browser/device/PWA/offline and notification-permission matrix; keyboard, screen-reader, contrast and form accessibility; localization, timezone and RTL checks. Capacity targets, service objectives and recovery objectives remain proposed until measured and approved.
