# Payment and Subscription Specification
Last reviewed: 2026-11-07. Critical acceptance specification.

Server and verified provider settlement are authoritative. Browser redirects, client-submitted prices and entitlement flags are never proof of payment.

Callback requirements: verify provider signature; bind to server-created order; compare user, SKU, amount and currency; validate status/timestamp/nonce where supported; reject replay, stale, malformed and mismatched callbacks; persist idempotently; grant entitlement once only after trusted settlement.

Define order states, subscription start/end, renewal, cancellation, grace, expiry, refunds, chargebacks and account deletion. Premium must not grant unrelated add-on access. Disabled SKUs remain unavailable.

Test success, decline, timeout, invalid signature, replay, wrong amount/currency/user/order, delayed callback, duplicate callback, refund, dispute and expiry using provider sandbox. Record external approval separately.
