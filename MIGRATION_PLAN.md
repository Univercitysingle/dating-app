# Serverless migration plan

## Target architecture

- **Edge/API:** Cloudflare Workers. Preserve existing client contracts while migrating endpoints in small groups.
- **Coordination:** Durable Objects for shared, strongly consistent coordination such as rate-limit counters and idempotency coordination. They are not the chat transport in this plan.
- **Authentication:** Keep Firebase Authentication. Every protected Worker route must verify Firebase ID tokens server-side, including signature, issuer, audience/project ID, expiry, and relevant claims. Never trust a UID supplied in the request body.
- **Chat:** Keep Firebase Realtime Database listeners as the client realtime delivery path. Enforce conversation membership through server-side authorization and RTDB Security Rules; do not add Socket.IO/WebSocket chat in this migration.
- **Primary database:** Keep MongoDB initially. The confirmed staging database is `test` on Cluster0; set `MONGODB_DATABASE=test` explicitly rather than relying on the database embedded in the connection URI. Cloudflare documents using the native MongoDB Node.js driver in Workers and recommends a Durable Object holding the MongoClient for latency-sensitive persistent connections. Use the official Cloudflare guide: https://developers.cloudflare.com/workers/tutorials/connect-to-mongodb/ . Cloudflare Hyperdrive supports SQL databases, not MongoDB.
- **Secrets:** Configure `MONGODB_URI` with `wrangler secret put MONGODB_URI`; never commit connection strings or credentials. Set `FIREBASE_PROJECT_ID` as a non-secret Worker variable. Use a dedicated development/staging database for the first live probe.
- **Legacy server:** Keep it running as rollback target. Do not change production DNS until parity and cutover checks pass.

## Source inspection findings

The current root server.js is a long-lived Express/HTTP process. It loads all Mongoose models at startup, opens a Mongoose connection, starts in-process trial/subscription expiration jobs, serves static React assets, and initializes Socket.IO. It mounts auth, users, swipe, matches, chat, reports, notifications, support tickets, purchase, subscription, admin, and cron routes. The root package.json combines frontend and backend dependencies. The client initializes Firebase Auth and Realtime Database in src/firebase.js. These are migration boundaries, not code to copy wholesale into a Worker.

## Phases and acceptance gates

### Phase 0: baseline and dependency spike

1. Inventory route contracts, models, middleware order, scheduled jobs, payment/webhook flows, uploads/media, and client call sites.
2. Capture current backend/frontend test results from a clean checkout; identify skipped/TODO tests.
3. Run the Worker unit tests, then test the MongoDB Durable Object against a dedicated staging database. Verify TLS, authentication, connection limits, timeout behavior, and recovery after a transient failure. **Gate:** no database-dependent route migrates until a real staging ping passes.
4. Audit Firebase Realtime Database rules and current chat path/data shape. Confirm only matched conversation members can read/write and privileged operations remain server-controlled.

### Phase 1: Worker foundation

1. Deploy Worker in staging on a separate hostname; production origin stays unchanged.
2. Add request IDs, structured logs, bounded JSON bodies, CORS allowlist, security headers, route-level rate limiting, and consistent error responses.
3. Implement Firebase ID-token verification with Google's published signing keys and strict project/issuer/audience/expiry checks. Reject invalid or missing tokens by default. The initial `GET /api/auth/verify` route is now implemented and returns only the verified UID and email-verification boolean. `GET /api/users/me` now uses the verified UID for a read-only profile lookup.
4. Keep `/ready` dependency-aware: it verifies required configuration and performs a real MongoDB ping through the Durable Object. Firebase is currently configuration-checked only, not connectivity-checked; readiness must not be described as a full Firebase connectivity probe.

### Phase 2: migrate read-only endpoints

The legacy contract for `GET /api/users/me` is authenticated and returns the current MongoDB user after `sanitizeUser`, including computed age and `isPremium` from an active Subscription document. The model is `User` (MongoDB collection `users`), and Subscription records are stored in `subscriptions`. The existing sanitizer currently returns the full owner object, so the Worker must explicitly exclude password hashes and login IP metadata rather than reproduce that exposure.

The Worker now implements a first pass of `GET /api/users/me`: it verifies the Firebase ID token, queries only the matching UID from `test.users`, adds `age`, `id`, `isOnboardingComplete`, and `isPremium`, converts relative photo URLs to the configured CDN hostname, and excludes `password` and `lastLoginIp`. It does not yet reproduce the legacy find-or-create/link-by-email provisioning behavior or Redis cache behavior. Contract tests against representative fixture documents are still required.

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

- `workers/index.js`: Worker liveness endpoint, fail-closed readiness endpoint, and explicit 501 responses for routes not yet migrated.
- `workers/mongodb-connection.js`: Durable Object with a lazy MongoDB Node driver connection and restricted ping operation. It is not a general database query proxy.
- `workers/package.json`: includes MongoDB Node.js driver v6.15 or later.
- `workers/index.test.js`: Node built-in tests for readiness failure/success paths, route scaffold, rate limiter, and MongoDB Durable Object guards.
- `wrangler.jsonc`: Worker and Durable Object bindings with a new migration tag for MongoDB connection class.
- The MongoDB Durable Object is not yet proven against a live database. Unit tests mock the Durable Object binding; they do not establish network/TLS/credentials connectivity.
- `/ready` checks MongoDB using the configured Durable Object and only checks that `FIREBASE_PROJECT_ID` exists. Firebase ID-token verification and Firebase service connectivity are not implemented yet.
- The rate limiter accepts caller-provided keys and is only a scaffold. Derive keys from authenticated identity and enforce abuse protections before production use.
- No application routes are migrated in this phase. Do not deploy to production or change DNS until staging connectivity, authentication, contract, and security gates pass.
