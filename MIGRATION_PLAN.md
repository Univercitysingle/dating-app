# Serverless migration plan

## Target architecture

- **Edge/API:** Cloudflare Workers. Preserve existing client contracts while migrating endpoints in small groups.
- **Coordination:** Durable Objects for shared, strongly consistent coordination such as rate-limit counters and idempotency coordination. They are not the chat transport in this plan.
- **Authentication:** Keep Firebase Authentication. Every protected Worker route must verify Firebase ID tokens server-side, including signature, issuer, audience/project ID, expiry, and relevant claims. Never trust a UID supplied in the request body.
- **Chat:** Keep Firebase Realtime Database listeners as the client realtime delivery path. Enforce conversation membership through server-side authorization and RTDB Security Rules; do not add Socket.IO/WebSocket chat in this migration.
- **Primary database:** Keep MongoDB initially, but do not assume Mongoose can be copied into a Worker unchanged. Prove a supported, maintained Workers-compatible path to MongoDB Atlas before migrating database-dependent routes. Do not ship an unverified connectivity workaround.
- **Legacy server:** Keep it running as rollback target. Do not change production DNS until parity and cutover checks pass.

## Source inspection findings

The current root server.js is a long-lived Express/HTTP process. It loads all Mongoose models at startup, opens a Mongoose connection, starts in-process trial/subscription expiration jobs, serves static React assets, and initializes Socket.IO. It mounts auth, users, swipe, matches, chat, reports, notifications, support tickets, purchase, subscription, admin, and cron routes. The root package.json combines frontend and backend dependencies. The client initializes Firebase Auth and Realtime Database in src/firebase.js. These are migration boundaries, not code to copy wholesale into a Worker.

## Phases and acceptance gates

### Phase 0: baseline and dependency spike
1. Inventory route contracts, models, middleware order, scheduled jobs, payment/webhook flows, uploads/media, and client call sites.
2. Capture current backend/frontend test results from a clean checkout; identify skipped/TODO tests.
3. Prove MongoDB access from the intended Workers deployment using a supported, maintained integration. Test TLS, authentication, connection limits, timeouts, and failure behavior. **Gate:** no DB-dependent route migrates until this passes.
4. Audit Firebase Realtime Database rules and current chat path/data shape. Confirm only matched conversation members can read/write and privileged operations remain server-controlled.

### Phase 1: Worker foundation
1. Deploy Worker in staging on a separate hostname; production origin stays unchanged.
2. Add request IDs, structured logs, bounded JSON bodies, CORS allowlist, security headers, route-level rate limiting, and consistent error responses.
3. Implement Firebase ID-token verification with Google's published signing keys and strict project/issuer/audience checks. Reject invalid or missing tokens by default.
4. Add dependency-aware readiness checks only after real MongoDB and Firebase connectivity probes exist.

### Phase 2: migrate read-only endpoints
Move status/profile/read-only endpoints one group at a time. Preserve response schemas and pagination. Add contract tests comparing legacy and Worker responses on fixture data.

### Phase 3: write paths and business invariants
Migrate profile updates, swipes/matches, reports, notifications, subscriptions/purchases, and admin/cron operations separately. Enforce authorization and idempotency server-side. Keep payment webhooks on tested routes with signature verification. Move cron work to Cloudflare Cron Triggers only after jobs are idempotent and safe to retry; never run scheduled work per request.

### Phase 4: chat and realtime
Keep Firebase Realtime Database listeners for realtime updates. The Worker API validates identity and membership for chat writes or credential/rule bootstrap. Define RTDB Security Rules and test cross-user access, unmatched users, blocked users, deleted matches, and stale memberships. Retire Socket.IO only after the client no longer depends on it.

### Phase 5: cutover and rollback
1. Run regression, security, load, and data-integrity tests in staging.
2. Compare read results where safe; avoid duplicate writes.
3. Canary traffic and monitor errors, latency, Mongo connection pressure, Firebase rule denials, and payment failures.
4. Keep legacy server and rollback config available through an observation window.
5. Remove old routes/dependencies/server only after verified parity and rollback expiry.

## Branch contents and limitations

- workers/index.js: minimal Worker entry point with liveness/readiness endpoints and explicit 501 responses for routes not yet migrated.
- RateLimiter Durable Object: persistent per-key counter scaffold, not wired to business routes. Add authenticated key derivation and abuse protections before production use.
- workers/index.test.js: Node built-in tests for scaffold behavior.
- wrangler.jsonc: Worker and Durable Object binding.
- MONGO_API_BASE_URL is only a placeholder for a proven Mongo-compatible gateway or supported connector, not an existing service.
- /ready intentionally returns 503 even when variables exist until real dependency probes are implemented.
- The Durable Object accepts caller-provided keys and is only a scaffold. Do not expose it publicly or use it as an authorization boundary.
- No application routes are migrated in this initial branch. This is intentional until database connectivity and Firebase token verification are validated.
