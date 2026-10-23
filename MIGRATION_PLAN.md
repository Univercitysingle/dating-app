# Serverless migration plan

## Target architecture

- **Edge/API:** Cloudflare Workers. Preserve existing client contracts while migrating endpoints in small groups. The legacy `/api/status` route now reports non-sensitive Worker, MongoDB, and Firebase configuration status.
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
- Staging Worker deployment is pinned to `migrate-to-serverless`; `.github/workflows/deploy-worker-staging.yml` is the canonical Worker deployment path. The legacy non-sensitive `GET /api/auth/test` diagnostic route is preserved with method checks and tests. After review fixes, staging run [39613960534](https://github.com/Univercitysingle/dating-app/actions/runs/39613960534) completed successfully, including Worker tests, staging deployment, liveness/readiness with MongoDB connectivity, anonymous-auth checks, and the route inventory smoke gate. Frontend build run [39613844004](https://github.com/Univercitysingle/dating-app/actions/runs/39613844004) also passed after the superadmin custom-token exchange change. Fixes include exchanging the Firebase custom token for an ID token in the login UI, and placing the `role` custom claim at the token root. A separate Worker test run [39613961544](https://github.com/Univercitysingle/dating-app/actions/runs/39613961544) failed against commit `18d73ae` because its test still expected the old nested claim shape. The expectation was corrected in `2a13a4e`, and issuer/audience assertions were added in `bc6e4d0`. The final standalone Worker test run [39614467062](https://github.com/Univercitysingle/dating-app/actions/runs/39614467062) passed, and the latest staging deployment [39614467420](https://github.com/Univercitysingle/dating-app/actions/runs/39614467420) also passed all Worker tests and smoke gates. Worker implementation code is deployed to the isolated staging Worker; provider end-to-end checks and the frontend Pages deployment remain outstanding.

### Still not complete / requires integration work

- **Media uploads:** Profile-photo upload/deletion uses private object storage with the existing CDN URL contract and constrained proxy. Bank-slip submission and review have been discontinued and removed from the staging API and admin UI. Pages deployment has not been triggered because its workflow is manual. Live storage upload/retrieval/deletion and CDN routing still need a live integration test.
- **Payments:** Worker routes create server-priced pending store purchases/subscriptions, encrypt `<objectId>|<price>` for the WebXPay staging redirect, validate the published callback signature by public-decrypting the signature and comparing it to the base64-decoded `payment` bytes, and settle approved/declined callbacks idempotently inside a MongoDB transaction. Tests cover valid/invalid signatures, purchase/subscription settlement, and duplicate/declined callbacks; latest code has passed Worker tests and staging deployment. Live settlement still requires `FRONTEND_URL` in GitHub Actions secrets (the latest staging workflow log showed it unset), the WebXPay dashboard callback URL set to the staging Worker `/api/webxpay/response`, and an actual sandbox transaction. `WEBXPAY_PUBLIC_KEY` and `WEBXPAY_SECRET_KEY` are present in the latest staging workflow environment, but that does not substitute for a sandbox payment. The callback has no amount field, so the signed order ID must map only to a server-created record with server-set pricing.
- **Scheduled expiration jobs:** Cloudflare Cron Triggers run the Worker expiration handler hourly in staging. The handler marks expired active subscriptions inactive and expires premium trials, while checking for another active paid subscription before downgrading a user. The job is bounded to 500 records per category per invocation. Legacy manual `/api/cron/trials` and `/api/cron/subscriptions` routes are migrated with a required `x-cron-secret` header (minimum 32 characters) and distinct scopes; requests fail closed when `CRON_SECRET` is absent. Production scheduling remains disabled until production cutover is explicitly approved.
- **Chat:** migrated `/api/chat/history/:roomId`, `/api/chat/conversations`, and `/api/chat/send` on the Worker. MongoDB access checks membership, blocks messaging when either participant blocked the other, validates room IDs, caps message size and pagination, and sends messages to the existing `chats/{roomId}/{messageId}` RTDB path using the caller's Firebase ID token so deployed rules remain authoritative. The latest staging workflow log showed `FIREBASE_DATABASE_URL` unset. Configure it as a GitHub Actions secret and verify the deployed RTDB rules permit only the intended room participants; the live RTDB write has not been exercised with a real user token.
- **Admin payment moderation:** store-item purchases remain a separate flow; the discontinued bank-slip subscription workflow is not supported.
- **Remaining admin endpoints:** password-based superadmin login uses a bcrypt password hash and an RS256 Firebase custom token; the frontend now exchanges that custom token through Firebase Auth and stores the resulting ID token for protected Worker requests. The Worker provisions the reserved `superadmin_uid` record before returning the custom token. The latest staging workflow log showed `FIREBASE_SERVICE_ACCOUNT_JSON`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD_HASH` unset. Configure these secrets before using password login; until then the endpoint intentionally fails closed with HTTP 503. An automated staging route-family smoke gate now exercises the legacy Express HTTP endpoints and fails if a known path falls through to HTTP 404/501. This verifies routing only, not response-schema parity, business invariants, or provider integration. Socket.IO-only typing/online-presence behavior still needs a replacement plan and frontend migration.
- **Frontend/Pages:** the same-origin `functions/api/[[path]].js` proxy and staging Pages workflow are present; the discontinued bank-slip review UI has been removed. Frontend build validation passed, but the manual Cloudflare Pages deployment failed configuration validation because `CLOUDFLARE_PAGES_PROJECT_NAME` is missing; `STAGING_API_ORIGIN`, `REACT_APP_FIREBASE_PROJECT_ID`, `REACT_APP_FIREBASE_DATABASE_URL`, and `REACT_APP_FIREBASE_STORAGE_BUCKET` were also unset in that run. Configure these GitHub Actions secrets and manually run `Deploy dating-app frontend to Cloudflare Pages` to publish only the `migrate-to-serverless` preview branch. The latest Worker deployment also reports `FRONTEND_URL`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD_HASH`, and `CRON_SECRET` as unset. Consequently, WebXPay checkout, realtime chat writes, password-based superadmin login, and the manual cron endpoints remain intentionally unavailable until their configuration is supplied. Afterward test sign-in, profile, chat, uploads, payments, and admin workflows with real staging accounts.
- **Production cutover:** not authorized or performed. Keep the legacy server available as rollback until full staging parity, security checks, and data-integrity tests pass.

### Deployment and safety notes

- Staging uses the explicitly configured MongoDB database test; do not repoint it at production data.
- The Pages and Worker staging workflows explicitly check out `migrate-to-serverless` and reject dispatches from other branches. Worker deployments remain staging-only.
- /ready verifies required configuration and a MongoDB ping. It only checks that FIREBASE_PROJECT_ID is configured; it is not a Firebase service-connectivity test.
- Worker unit tests with mocked database bindings do not prove provider integration, storage, or payment correctness.
- The staging workflow deploys only the isolated staging Worker. No production DNS or routing changes should be made by this migration workflow.
- All changes remain on migrate-to-serverless. Do not merge to main or create additional branches as part of this work.
