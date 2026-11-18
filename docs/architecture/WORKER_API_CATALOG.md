# Active Cloudflare Worker API catalogue

**Source:** `workers/index.js` at source blob `f11fd484cf79dc56cb09474254640e9d635cfa54`  
**MongoDB service:** `workers/mongodb-connection.js` at source blob `641b7851e107be99d3f55fbfabcf34595b40e888`  
**Review branch:** `migrate-to-serverless`  
**Reviewed:** 2026-11-11  
**Status:** Static source inventory. It is not a live deployment or complete request/response OpenAPI contract.

## Authentication conventions

- **Firebase-authenticated:** Route verifies the caller's Firebase ID token in the Worker before passing verified claims to the MongoDB Durable Object. Resource ownership and role checks are still enforced in the relevant operation.
- **Admin:** Firebase-authenticated plus database-backed `users.role` check for `admin` or `superadmin`. Some destructive or role-granting actions are superadmin-only.
- **Public/provider:** No Firebase user session is expected, but provider signature or other route-specific validation applies.
- **Secret-authenticated:** Uses a server-side shared secret, not a Firebase user token.
- **Conditional:** Route has feature/configuration gates or different auth rules by action. See notes.

Do not treat this classification as a substitute for checking each handler's current implementation before changing permissions.

## Health, diagnostics and authentication

| Method | Path | Access | Purpose / notes |
|---|---|---|---|
| GET | `/health` | Public | Worker liveness |
| GET | `/ready` | Public | Dependency/configuration readiness probe; current source performs MongoDB ping and configuration checks. It is not proof of Firebase connectivity. |
| GET | `/api/status` | Public | Non-sensitive runtime/configuration status |
| POST | `/api/auth/login` | Public | Superadmin password login and Firebase custom-token issuance; depends on server-side secrets |
| POST | `/api/auth/set-initial-password` | Firebase-authenticated | Set initial password for eligible account |
| GET | `/api/auth/test` | Public diagnostic | Non-sensitive route diagnostic |
| POST | `/api/auth/logout` | Firebase-authenticated | Logout/session endpoint |
| GET | `/api/auth/verify` | Firebase-authenticated | Verify token and return safe identity claims |
| GET | `/api/geolocation` | Firebase-authenticated | Coarse Cloudflare network location only; does not return visitor IP or IP-derived coordinates |

## Profile, discovery, matching and notifications

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET, PUT | `/api/users/me` | Firebase-authenticated | Read/update current profile |
| GET, PUT, DELETE | `/api/users/me/desires` | Firebase-authenticated, adult account, explicit opt-in for writes | Read, save or withdraw private relationship-intention, desire, curiosity and boundary preferences |
| GET, PUT, DELETE | `/api/users/me/location` | Firebase-authenticated, adult account; explicit browser permission for GPS writes | Read location-sharing status, update private GPS location, or revoke location sharing |
| GET | `/api/users/:uid` | Firebase-authenticated | Read public profile with allowlisted fields |
| GET | `/api/users/discover` | Firebase-authenticated | Discovery feed with age, gender, relationship, optional city/country and consented GPS distance filters |
| GET | `/api/users/me/subscriptions` | Firebase-authenticated | Current user's subscription history |
| GET | `/api/users/likes` | Firebase-authenticated | Likes/admirers view |
| POST | `/api/users/photos` | Firebase-authenticated | Upload photo through existing CDN service binding |
| DELETE | `/api/users/photos` | Firebase-authenticated | Delete own photo through existing CDN service binding |
| PUT | `/api/users/photos/order` | Firebase-authenticated | Reorder own photos |
| POST | `/api/users/unmatch/:uid` | Firebase-authenticated | Unmatch |
| POST | `/api/users/block/:uid` | Firebase-authenticated | Block user |
| POST | `/api/users/unblock/:uid` | Firebase-authenticated | Unblock user |
| POST | `/api/swipe/undo` | Firebase-authenticated | Undo last swipe |
| POST | `/api/swipe/like` | Firebase-authenticated | Like |
| POST | `/api/swipe/pass` | Firebase-authenticated | Pass |
| POST | `/api/swipe/superlike` | Firebase-authenticated | Super-like |
| POST | `/api/matches/like/:uid` | Firebase-authenticated | Legacy compatibility like route |
| GET | `/api/matches` | Firebase-authenticated | Match list |
| GET | `/api/matches/confirmed` | Firebase-authenticated | Confirmed match list |
| GET, PUT | `/api/notification-preferences` | Firebase-authenticated | Read/update notification preferences |
| GET | `/api/notifications` | Firebase-authenticated | Read notifications |

## Support, moderation and administration

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/support-attachments` | Firebase-authenticated | Upload support attachment |
| GET, POST | `/api/support-tickets` | Firebase-authenticated | List/create own tickets |
| GET | `/api/support-tickets/:ticketId` | Firebase-authenticated, owner | Ticket detail and public messages |
| POST | `/api/support-tickets/:ticketId/messages` | Firebase-authenticated, owner | Add ticket message |
| PATCH, DELETE | `/api/support-tickets/:ticketId/messages/:messageId` | Firebase-authenticated, ownership and message policy | Edit/delete own eligible ticket message |
| POST | `/api/support-tickets/:ticketId/feedback` | Firebase-authenticated, owner | Submit ticket feedback |
| GET | `/api/admin/support-tickets` | Admin | List tickets |
| GET | `/api/admin/support-tickets/:ticketId` | Admin | Ticket detail |
| POST | `/api/admin/support-tickets/:ticketId/messages` | Admin | Reply/internal note, depending on payload |
| PATCH, DELETE | `/api/admin/support-tickets/:ticketId/messages/:messageId` | Admin | Edit/delete message |
| PUT | `/api/admin/support-tickets/:ticketId/status` | Admin | Update ticket status |
| POST | `/api/reports` | Firebase-authenticated | Submit report |
| GET | `/api/admin/reports` | Admin | Report queue |
| GET | `/api/admin/reports/:reportId` | Admin | Report detail |
| POST | `/api/admin/reports/:reportId/action` | Admin | Moderation action |
| GET | `/api/admin/users` | Admin | User list |
| GET | `/api/admin/users/stats` | Admin | User statistics |
| GET | `/api/admin/users/:objectId` | Admin | User detail |
| POST | `/api/admin/users` | Admin; role elevation restricted | Create user |
| PUT, DELETE | `/api/admin/users/:objectId` | Admin; deletion restrictions apply | Update/delete user |
| PUT | `/api/admin/users/:objectId/subscription` | Admin | Update plan |
| GET | `/api/admin/transactions` | Admin | Transaction list |
| GET | `/api/admin/analytics/summary` | Admin | Analytics summary |
| GET | `/api/admin/analytics/export` | Admin | CSV export |
| GET | `/api/admin/payment-logs` | Admin | Payment logs |
| GET | `/api/admin/user-activity/login-history` | Admin | Login history |
| GET | `/api/admin/audit-logs` | Admin | Audit history |
| GET | `/api/admin/users/purchases` | Admin | Purchase listing |
| POST | `/api/admin/users/purchases/:id/approve` | Admin | Legacy purchase approval action remains in source |
| POST | `/api/admin/users/purchases/:id/reject` | Admin | Legacy purchase rejection action remains in source |
| POST | `/api/admin/users/purchases/:id/record-refund` | Admin | Record refund action |

**Payment administration discrepancy:** The Worker still exposes the purchase approve/reject route family. This does not prove that manual bank-slip approval is active in the UI or should remain a supported business process. Product owner must decide whether to remove/deprecate these actions in favour of gateway-authoritative payment status. Do not expose them as a recommended operational workflow without that decision.

## Verification

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET, POST, DELETE | `/api/verification` | Firebase-authenticated | Read status, submit, or withdraw own verification |
| GET | `/api/admin/photo-verifications` | Admin | Review queue |
| GET | `/api/admin/photo-verifications/:id` | Admin | Verification detail |
| GET | `/api/admin/photo-verifications/:id/evidence` | Admin, evidence-specific checks | Retrieve evidence |
| POST | `/api/admin/photo-verifications/:id/action` | Admin | Approve/reject/review action |

## Payments and subscriptions

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/purchase/store-item` | Firebase-authenticated | Create server-priced store purchase and return checkout form |
| POST | `/api/subscription` | Firebase-authenticated | Create subscription checkout |
| POST | `/api/subscription/abandon` | Firebase-authenticated | Abandon eligible pending subscription |
| GET | `/api/purchase/status/:id` | Firebase-authenticated, owner | Read own purchase status |
| GET | `/api/subscription/status/:id` | Firebase-authenticated, owner | Read own subscription status |
| POST | `/api/webxpay/response` | Public/provider callback | Verify provider signature and settle mapped order idempotently |

The callback must be treated as a provider-facing endpoint. Do not add Firebase-auth requirements that would block the gateway. Callback authenticity, order mapping, replay behaviour and settlement must be tested with provider sandbox transactions.

## Push notifications

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/push/vapid-public-key` | Public | Return public VAPID key |
| POST | `/api/push/subscriptions` | Firebase-authenticated | Register own push subscription |
| DELETE | `/api/push/subscriptions` | Firebase-authenticated | Remove own subscription |

Push delivery is best-effort. Confirm actual provider delivery, retry and subscription cleanup separately.

## Calls, video rooms and chat

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/calls/ice-config` | Firebase-authenticated | Return configured ICE servers |
| GET | `/api/video-rooms/ice-config` | Firebase-authenticated | Return ICE configuration for video rooms |
| GET | `/api/video-rooms/earnings` | Firebase-authenticated | Creator earnings |
| POST | `/api/video-rooms/:roomId/ticket` | Firebase-authenticated | Create room ticket/payment checkout |
| GET | `/api/video-rooms` | Firebase-authenticated | List rooms |
| POST | `/api/video-rooms` | Firebase-authenticated | Create room |
| POST | `/api/video-rooms/:roomId/join` | Firebase-authenticated | Join room |
| POST | `/api/video-rooms/:roomId/leave` | Firebase-authenticated | Leave room |
| POST | `/api/video-rooms/:roomId/end` | Firebase-authenticated, host/role checks | End room |
| POST | `/api/calls/start` | Firebase-authenticated | Start call |
| GET | `/api/calls/poll` | Firebase-authenticated | Poll call state |
| GET | `/api/calls/history` | Firebase-authenticated | Call history |
| GET | `/api/calls/incoming` | Firebase-authenticated | Incoming call state |
| POST | `/api/calls/signal` | Firebase-authenticated | WebRTC signalling |
| POST | `/api/calls/action` | Firebase-authenticated | Answer/reject/end call action |
| GET | `/api/chat/history/:roomId` | Firebase-authenticated, participant | Read conversation history |
| GET | `/api/chat/conversations` | Firebase-authenticated | Inbox/conversation list |
| GET | `/api/chat/typing` | Firebase-authenticated, participant | Read typing state |
| POST | `/api/chat/send` | Firebase-authenticated, participant | Send message |
| POST | `/api/chat/delivered` | Firebase-authenticated, participant | Mark delivery |
| POST | `/api/chat/read` | Firebase-authenticated, participant | Mark read |
| POST | `/api/chat/typing` | Firebase-authenticated, participant | Set typing state |
| PATCH, DELETE | `/api/chat/messages/:messageId` | Firebase-authenticated, sender/admin policy | Edit/delete message with audit record |

**Rate-limit exception:** The Worker applies an IP-scoped edge rate limit to `/api/*` except `/api/calls/*`. Call routes therefore require their own verified abuse/rate controls. Confirm route-level limits before production.

## Dark Fantasy and communities

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/dark-fantasy/catalog` | Conditional region/feature gate | Public catalogue |
| GET | `/api/dark-fantasy/status` | Firebase-authenticated, feature/region gate | Eligibility/status |
| GET, PUT, DELETE | `/api/dark-fantasy/profile` | Firebase-authenticated, feature/region gate | Own profile |
| GET | `/api/dark-fantasy/discover` | Firebase-authenticated, feature/region gate | Discovery |
| POST | `/api/dark-fantasy/purchase` | Firebase-authenticated, age/account/payment gates | Purchase |
| GET | `/api/dark-fantasy/communities` | Firebase-authenticated, feature/region gate | List communities |
| GET | `/api/dark-fantasy/communities/:slug` | Firebase-authenticated, feature/region gate | Community detail |
| GET | `/api/dark-fantasy/communities/:slug/requests` | Firebase-authenticated, membership/role check | Join requests |
| POST | `/api/dark-fantasy/communities/:slug/join` | Firebase-authenticated | Request membership |
| GET, POST | `/api/dark-fantasy/communities/:slug/posts` | Firebase-authenticated | List/create posts |
| POST | `/api/dark-fantasy/communities/:slug/posts/:postId/comments` | Firebase-authenticated | Comment |
| POST | `/api/dark-fantasy/communities/:slug/posts/:postId/reaction` | Firebase-authenticated | React |
| POST | `/api/dark-fantasy/communities/:slug/requests/:uid/decision` | Firebase-authenticated, moderator/owner check | Decide membership request |

**Critical configuration mismatch:** `wrangler.jsonc` staging variables set `DARK_FANTASY_ENABLED=true` and `DARK_FANTASY_ALLOWED_COUNTRIES=*`. The catalogue route's shared `darkFantasyRegionGate` rejects wildcard-only configuration, while the community and main Dark Fantasy handlers explicitly accept `*` as global access. This creates inconsistent gating. Keep the feature unavailable until the owner chooses a reviewed country allowlist and the inconsistent wildcard logic is corrected and tested. Do not rely on a source comment as proof that all routes fail closed.

## Scheduled jobs

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/cron/trials` | Secret-authenticated | Trial expiry job |
| POST | `/api/cron/subscriptions` | Secret-authenticated | Subscription expiry job |

The Worker checks the configured cron secret and uses separate job scopes. The staging Wrangler configuration also declares an hourly Cloudflare Cron Trigger. Verify actual deployed trigger state before relying on it.

## Response and error conventions

The Worker returns JSON for most API routes and applies `no-store` headers to sensitive API responses. Observed common status classes include:
- `200`: successful read/update/action.
- `201`: created resource.
- `400`: malformed or invalid input.
- `401`: missing/invalid Firebase token.
- `403`: authenticated but not authorized/eligible.
- `404`: missing resource or intentionally concealed/disabled feature.
- `405`: unsupported HTTP method.
- `409`: state conflict or duplicate/pending operation.
- `429`: rate limit.
- `502/503`: upstream/provider/dependency unavailable.

Exact per-route response schemas are not yet formalized. Add request/response JSON schemas and contract tests before treating this as a complete OpenAPI replacement.

## Verification procedure

1. Compare this catalogue with current route handlers and client API calls.
2. Add a route inventory test that asserts method, path pattern, auth category and admin requirement.
3. Exercise anonymous, expired-token, wrong-owner, blocked-user and wrong-role cases.
4. Test pagination, malformed ObjectIds, oversized bodies, provider timeouts and duplicate requests.
5. Record staging deployment SHA and test run. Do not infer live route availability from source alone.
