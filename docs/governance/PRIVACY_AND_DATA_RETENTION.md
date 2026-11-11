# Privacy and Data Retention
Status: design baseline requiring legal/privacy review. Last reviewed: 2026-11-07.

Inventory account identifiers, profile/contact data, location, preferences, photos, chat, reports/evidence, payments, login/security events, verification and analytics. For each define purpose, lawful basis, controller/processor, location, access, retention, deletion, backup expiry and cross-border transfer.

Collect minimum necessary data. Explain use before collection. Protect data in transit/at rest. Restrict sensitive data and audit privileged access. Do not place sensitive data in public profiles, analytics, general logs or shared caches.

Define access/export, correction, consent withdrawal, account deletion, retention exceptions and legal holds. Deletion must revoke access and entitlements consistently.

This is not a legal privacy notice. Obtain qualified review for operating entity and each market, including biometric/sensitive data and cross-border transfers.


## Current implementation considerations (2026-11-11)

The photo-verification guide documents encrypted MongoDB evidence with a seven-day TTL target and immediate deletion on review; confirm actual TTL execution, backup expiry and key recovery before treating deletion as complete. Chat, reports, support messages, login/security events, location and sensitive add-on preferences need documented retention periods and access controls. The existing CDN Worker remains unchanged and is outside this documentation scope. This document remains a design baseline, not a legally approved privacy notice. Obtain qualified review for UAE/operator jurisdiction and each launch market, especially biometric and other sensitive personal data.


## Verification and governance gaps (2026-11-11)

This document is not evidence of legal approval, provider certification, production deployment, or operational acceptance. Record the responsible owner, implementation state, test evidence, staging evidence, last verified commit, data classification, retention rule, dependency, and release approval for each requirement.

Explicitly track applicable gaps: payment/provider callback replay and reconciliation, refunds, duplicate settlement and stale pending recovery; verification evidence access controls, encryption, review audit and deletion/retention; user-data export and deletion propagation across MongoDB, Firebase, media storage and backups; documented backup/restore exercises and approved RPO/RTO; moderator access and ticket/chat message edit/delete policy with immutable audit history; notification opt-in/revocation and delivery failures; accessibility, supported browsers/devices, PWA/offline behaviour, localization, timezone and RTL. Do not mark an item complete without reproducible evidence and an assigned approver.
