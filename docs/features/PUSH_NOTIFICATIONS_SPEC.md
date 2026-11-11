# Push notifications specification

**Status:** Target specification. Do not assume push delivery is fully implemented or deployed until source and provider tests prove it.
**Scope:** Browser push and in-app notifications for matches, messages, calls, verification, moderation and account events.

## Architecture and lifecycle

1. A signed-in user explicitly opts in through the browser permission prompt.
2. The client registers the service worker and requests a PushSubscription.
3. The subscription is sent to an authenticated API endpoint. The server binds it to the verified Firebase UID, validates endpoint/key shape and records browser/device metadata with minimal retention.
4. The server emits notification jobs from authoritative events. The client must not be allowed to forge another user's notification.
5. Delivery attempts use bounded retries, exponential backoff and deduplication keys. Permanent provider errors invalidate the subscription.
6. Logout, account deletion, user revocation and browser subscription changes must remove or disable the server-side subscription.
7. Notification preferences, quiet hours and category settings are applied before delivery.

## Event categories

| Category | Example | Default policy |
|---|---|---|
| Match | New mutual match | User preference |
| Message | New message | User preference, avoid message body on lock screen by default |
| Call | Incoming call | Separate call notification preference |
| Verification | Verification status | User preference |
| Moderation | Account or report outcome | Required service notice where applicable |
| Billing | Payment/subscription status | Required transactional notice where applicable |
| System | Security and account event | Required where security-critical |

## Security and privacy

- Never trust a UID, event owner or target recipient supplied by the browser.
- Do not include email, mobile, sensitive profile attributes, verification evidence or payment details in push payloads.
- Use generic lock-screen text by default. Deep links must re-check authentication and authorization.
- Protect subscription endpoints against CSRF, replay and cross-account binding.
- Store VAPID/private keys only as server-side secrets.
- Treat push delivery as best effort. In-app state remains authoritative.
- Apply per-account/device rate limits and deduplicate repeated events.

## Reliability and observability

Track accepted, queued, delivered where provider feedback exists, expired, invalidated, retried and permanently failed counts. Do not label a provider acceptance as user-visible delivery. Avoid logging full endpoints or cryptographic subscription keys.

## Acceptance tests

- Permission denied, granted and revoked.
- Multiple devices and subscription rotation.
- Logout and account deletion invalidation.
- Cross-user subscription registration rejected.
- Duplicate event produces one notification.
- Provider timeout and 4xx/5xx retry policy.
- Quiet hours and category preferences.
- Sensitive content omitted from lock-screen payload.
- Deep link requires a valid session and resource authorization.
- Service worker update and old-subscription cleanup.

## Implementation evidence required

Record the actual service-worker path, API routes, database collection/index, VAPID configuration, provider, retry queue, test files, staging deployment SHA and two-device test results before changing this document's status to implemented.
