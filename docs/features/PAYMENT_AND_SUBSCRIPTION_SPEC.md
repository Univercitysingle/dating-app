# Payment and Subscription Specification
Last reviewed: 2026-11-07. Critical acceptance specification.

Server and verified provider settlement are authoritative. Browser redirects, client-submitted prices and entitlement flags are never proof of payment.

Callback requirements: verify provider signature; bind to server-created order; compare user, SKU, amount and currency; validate status/timestamp/nonce where supported; reject replay, stale, malformed and mismatched callbacks; persist idempotently; grant entitlement once only after trusted settlement.

Define order states, subscription start/end, renewal, cancellation, grace, expiry, refunds, chargebacks and account deletion. Premium must not grant unrelated add-on access. Disabled SKUs remain unavailable.

Test success, decline, timeout, invalid signature, replay, wrong amount/currency/user/order, delayed callback, duplicate callback, refund, dispute and expiry using provider sandbox. Record external approval separately.


## Current payment status (2026-11-11)

WebXPay remains the intended provider integration. Automated code tests or a callback route do not establish a successful live/sandbox transaction. Require provider sandbox evidence for success, decline, invalid signature, duplicate/replay, amount/currency/order mismatch, expiry and entitlement revocation. Failed or abandoned pending checkout must be recoverable without granting entitlement or leaving the user permanently blocked by stale pending state. Admin payment screens must reflect provider settlement state rather than manual approval of bank slips. Do not modify live IPG/provider settings as part of this documentation update. GitHub Actions quota exhaustion means fresh workflow verification is unavailable.


## Verification and governance gaps (2026-11-11)

This document is not evidence of legal approval, provider certification, production deployment, or operational acceptance. Record the responsible owner, implementation state, test evidence, staging evidence, last verified commit, data classification, retention rule, dependency, and release approval for each requirement.

Explicitly track applicable gaps: payment/provider callback replay and reconciliation, refunds, duplicate settlement and stale pending recovery; verification evidence access controls, encryption, review audit and deletion/retention; user-data export and deletion propagation across MongoDB, Firebase, media storage and backups; documented backup/restore exercises and approved RPO/RTO; moderator access and ticket/chat message edit/delete policy with immutable audit history; notification opt-in/revocation and delivery failures; accessibility, supported browsers/devices, PWA/offline behaviour, localization, timezone and RTL. Do not mark an item complete without reproducible evidence and an assigned approver.
