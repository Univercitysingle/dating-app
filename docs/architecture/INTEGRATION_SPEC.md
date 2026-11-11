# Integration Specification
Last reviewed: 2026-11-11.

- Firebase Authentication: verify ID token signature, project/issuer/audience, expiry and required claims. Never trust body UID/role.
- Firebase RTDB: retained for chat. Test member-only access, blocked/unmatched restrictions and stale membership cleanup.
- MongoDB Atlas: primary store; secrets remain in secret storage; validate TLS, network restrictions, least privilege, pool limits and backups.
- Existing CDN Worker/private B2: app uses configured CDN hostname. B2 credentials remain in proxy. Do not modify CDN Worker or move its secrets into this app.
- WebXPay: verify callback authenticity, order, amount, currency, status and replay/idempotency using provider-approved rules. Browser redirect is not settlement proof.
- WebRTC/TURN: ExpressTURN is the primary relay when both `EXPRESSTURN_USERNAME` and `EXPRESSTURN_PASSWORD` are configured; Turnix provides short-lived fallback credentials through `TURNIX_API_TOKEN`. Provider ordering is covered by Worker tests, but live secret configuration, relay allocation, quota and real-network behaviour still require staging evidence. Keep all credentials server-side.
- Cloudflare: document bindings and secret names, never values; keep staging/production separated where possible.

Every integration needs an owner, test environment, failure/retry policy, monitoring and rollback.


## Current integration verification (2026-11-11)

Cloudflare Pages/Workers, MongoDB Atlas, Firebase Authentication, Firebase RTDB, the existing CDN Worker/private B2 path, WebXPay and WebRTC/TURN are the documented integration boundaries. The CDN Worker is explicitly unchanged. GitHub Actions quota is exhausted, and current source deployment is not confirmed. Firebase RTDB deployed rules and IAM remain externally unverified; keep direct browser realtime sync disabled until rules pass the documented negative tests. WebXPay sandbox settlement, TURN relay allocation and real-device call behaviour require live evidence. Do not treat configured secrets, bindings or code paths as successful integration tests. Redis remains a preferred secondary cache, not an established integration.


## Completeness, ownership and verification gaps (2026-11-11)

Treat this specification as a living contract. For each item, record implementation status, automated test, staging evidence, last verified commit, owner, dependency, and rollback/retention impact. Distinguish documented design from verified runtime behaviour. Reconcile against source and staging before release.

Cross-cutting gaps requiring explicit closure: a complete API route/method/authz/schema/error catalogue; MongoDB collection schemas, indexes, uniqueness, TTL and migration/rollback definitions; Firebase RTDB rules and push subscription/delivery/retry lifecycle; tested backup/restore with RPO/RTO; payment replay/idempotency/reconciliation/refund and stale-pending recovery; moderation message edit/delete permissions and immutable audit events; account export/deletion propagation and backup retention; supported browser/device, PWA/offline and notification permission matrix; accessibility checks for keyboard, screen readers, contrast and forms; localization, timezone and RTL readiness. Do not imply these are implemented unless backed by evidence.
