# Integration Specification
Last reviewed: 2026-11-07.

- Firebase Authentication: verify ID token signature, project/issuer/audience, expiry and required claims. Never trust body UID/role.
- Firebase RTDB: retained for chat. Test member-only access, blocked/unmatched restrictions and stale membership cleanup.
- MongoDB Atlas: primary store; secrets remain in secret storage; validate TLS, network restrictions, least privilege, pool limits and backups.
- Existing CDN Worker/private B2: app uses configured CDN hostname. B2 credentials remain in proxy. Do not modify CDN Worker or move its secrets into this app.
- WebXPay: verify callback authenticity, order, amount, currency, status and replay/idempotency using provider-approved rules. Browser redirect is not settlement proof.
- WebRTC/TURN: document short-lived credentials, ICE fallback, room permissions, bandwidth and network testing.
- Cloudflare: document bindings and secret names, never values; keep staging/production separated where possible.

Every integration needs an owner, test environment, failure/retry policy, monitoring and rollback.
