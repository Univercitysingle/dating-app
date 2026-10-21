# Serverless migration plan

## Target architecture

- **Edge/API:** Cloudflare Workers. Preserve existing client contracts while migrating endpoints in small groups.
- **Coordination:** Durable Objects for shared, strongly consistent coordination such as rate-limit counters and idempotency coordination. They are not the chat transport in this plan.
- **Authentication:** Keep Firebase Authentication. Every protected Worker route must verify Firebase ID tokens server-side, including signature, issuer, audience/project ID, expiry, and relevant claims. Never trust a UID supplied in the request body.
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

## Current branch status (2026-10-21)

### Implemented on migrate-to-serverless

- Cloudflare Worker foundation, liveness/readiness endpoints, Firebase ID-token verification, rate limiting via Durable Objects, and MongoDB Durable Object access.
- Current-user provisioning/profile reads and updates, public-profile privacy filtering, discovery/matches/swipes, likes, notifications, block/unblock, and photo ordering.
- User reports and database-backed admin report listing/detail/moderation.
- User support ticket create/list/detail/message operations and admin support ticket list/detail/reply/status operations.
- Purchase/subscription status reads with ObjectId validation and owner checks.
- Admin read APIs for user listing/detail, dashboard statistics, transaction listing, analytics summary/CSV export, payment logs, login history, and audit logs.
- Admin user creation/update/deletion/plan-update routes with database-backed role checks and superadmin restrictions.
- Staging deployment workflow and anonymous-access smoke tests. Worker tests and staging smoke tests have passed on recent commits; check the latest run before considering the current branch validated.

### Still not complete / requires integration work

- **Media uploads:** Profile-photo upload/deletion uses private Backblaze B2 with the existing CDN URL contract and constrained proxy. Bank-slip support uploads validated JPEG/PNG/GIF files to private B2, stores server-owned plan metadata for `basic_1m`, `premium_1m`, and `premium_3m`, lets owners cancel/delete pending submissions, and provides admin-only pending-review, private image-view, and approve/reject routes. The `AdminSubscriptionPage` now includes a pending bank-slip review table. Worker tests and staging deployment passed; frontend build validation is running. Pages deployment has not been triggered because its workflow is manual. Real B2 upload/retrieval/deletion and CDN routing still need a live integration test.
- **Payments:** Worker routes create server-priced pending store purchases/subscriptions, encrypt `<objectId>|<price>` for the WebXPay staging redirect, validate the published callback signature by public-decrypting the signature and comparing it to the base64-decoded `payment` bytes, and settle approved/declined callbacks idempotently inside a MongoDB transaction. Tests cover valid/invalid signatures, purchase/subscription settlement, and duplicate/declined callbacks; latest code has passed Worker tests and staging deployment. Live settlement still requires `WEBXPAY_PUBLIC_KEY`, `WEBXPAY_SECRET_KEY`, and `FRONTEND_URL` in GitHub Actions secrets, the WebXPay dashboard callback URL set to the staging Worker `/api/webxpay/response`, and an actual sandbox transaction. The callback has no amount field, so the signed order ID must map only to a server-created record with server-set pricing.
- **Scheduled expiration jobs:** Cloudflare Cron Triggers now run the Worker expiration handler hourly in staging. The handler marks expired active subscriptions inactive and expires premium trials, while checking for another active paid subscription before downgrading a user. The job is bounded to 500 records per category per invocation and has unit coverage. Production scheduling remains disabled until production cutover is explicitly approved.
- **Chat:** preserve Firebase Realtime Database as the realtime delivery path. The exact deployed RTDB rules and existing chat-path permissions must be reviewed and tested before changing chat writes or client access. Do not weaken rules or introduce a replacement transport.
- **Admin payment moderation:** approve/reject purchase operations exist in the Worker, but the legacy Purchase schema uses `itemId`, `itemName`, `itemPrice`, and `bankSlipUrl`; entitlement updates must be validated against the exact User schema and tested against staging data before treating moderation as complete.
- **Remaining admin endpoints:** complete a route-by-route frontend inventory and migrate or explicitly retire all remaining 501s. Known gaps include password-based superadmin login and the legacy `/api/chat/history`, `/api/chat/conversations`, and `/api/chat/send` routes; chat remains blocked on verifying deployed RTDB rules and conversation membership semantics.
- **Frontend/Pages:** the same-origin `functions/api/[[path]].js` proxy, staging Pages workflow, and admin bank-slip review UI are present. Frontend build validation passed, but the manual Cloudflare Pages deployment has not been run; configure the real Firebase and `STAGING_API_ORIGIN` secrets, deploy the `migrate-to-serverless` Pages branch, then test sign-in, profile, chat, uploads, payments, and admin workflows with real staging accounts.
- **Production cutover:** not authorized or performed. Keep the legacy server available as rollback until full staging parity, security checks, and data-integrity tests pass.

### Deployment and safety notes

- Staging uses the explicitly configured MongoDB database test; do not repoint it at production data.
- /ready verifies required configuration and a MongoDB ping. It only checks that FIREBASE_PROJECT_ID is configured; it is not a Firebase service-connectivity test.
- Worker unit tests with mocked database bindings do not prove provider integration, storage, or payment correctness.
- The staging workflow deploys only the isolated staging Worker. No production DNS or routing changes should be made by this migration workflow.
- All changes remain on migrate-to-serverless. Do not merge to main or create additional branches as part of this work.
