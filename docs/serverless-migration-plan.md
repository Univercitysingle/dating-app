# Serverless migration plan

## Decision

Use Google Cloud Run as the first serverless deployment target, keep MongoDB as the system of record, and retain Firebase Authentication and Firebase Realtime Database during the first migration stage. This is a serverless container migration, not a function-per-route rewrite.

Do not merge the separate chat-security PR as part of this migration without a fresh schema and client-contract review.

## Why this first

- The repository already contains a Dockerfile and describes Cloud Run in its health checks and shutdown handling.
- The Express API, Mongoose models, middleware, payment integrations, and current Socket.IO protocol can continue running with fewer changes than a Cloudflare Workers or Cloud Functions rewrite.
- MongoDB remains the data store, avoiding a risky database migration at the same time as compute migration.
- Cloud Run can scale request-serving instances, but WebSocket connections and in-memory socket state need special treatment.

## Platform comparison

| Option | Relative cost profile | Migration effort | Main trade-off |
| --- | --- | --- | --- |
| Cloud Run | Usage-based CPU, memory, and request billing; scale-to-zero is possible when configured | Low to medium | Best compatibility with current Express/Mongoose/Socket.IO application |
| Firebase Cloud Functions | Usage-based functions; Blaze billing required; Firebase products billed separately where applicable | Medium to high | Fits Firebase services well, but requires adapting app startup and moving long-running Socket.IO behavior |
| Cloudflare Workers + Durable Objects | Workers paid plan starts at $5/month; usage beyond included allowances is billed | High | Good edge runtime and stateful WebSocket primitives, but current Node/Mongoose/Socket.IO stack is not a drop-in deployment |

These are relative estimates, not a bill forecast. Validate actual monthly cost against measured requests, CPU, memory, WebSocket duration, MongoDB tier, RTDB reads/writes, egress, and scheduled jobs before choosing a production budget.

## Real-time chat recommendation after client inspection

The client uses both Socket.IO and Firebase Realtime Database:
- `src/context/SocketContext.js` opens a Socket.IO connection using a Firebase ID token and handles `message`, `chatHistory`, and `new_message_notification` events.
- `src/pages/Chat.js` joins a Socket.IO room, but also listens to `chats/{chatId}` in RTDB.
- The backend writes messages to MongoDB, then attempts to mirror them into RTDB.
- Typing indicators currently use Socket.IO. The server also maintains in-memory online-user and socket-ID maps.

Recommended sequence:
1. Keep Socket.IO during the first Cloud Run deployment to preserve the existing client contract.
2. Do not scale beyond one instance until cross-instance Socket.IO room and presence behavior is addressed. For multi-instance operation, choose and test a supported Socket.IO adapter or migrate those events to Firebase RTDB.
3. Audit deployed Firebase RTDB security rules before relying on direct client listeners. Confirm clients cannot read arbitrary conversations or write forged messages.
4. Prefer MongoDB as the canonical message store during the initial migration. Make RTDB a delivery/notification channel, not an independently writable source of truth.
5. In a later, separately tested change, move message delivery, typing, and presence to RTDB only if security rules and event semantics are verified. Then remove Socket.IO after the client no longer depends on it.

## Migration phases

### Phase 0: baseline and guardrails
- Record current production environment variables, route inventory, MongoDB models/indexes, Firebase Auth configuration, RTDB rules, payment callbacks, and scheduled jobs.
- Capture current backend/frontend test results and establish CI checks.
- Keep production secrets out of the repository.

### Phase 1: serverless runtime readiness
- Use the existing Dockerfile as the starting point; update the Node runtime separately after compatibility testing.
- Add a tested runtime configuration for connection-pool sizing and disabling in-process cron when an external scheduler is configured.
- Configure Cloud Scheduler for trial and subscription expiration only after confirming the jobs are idempotent, authenticated, and observable.
- Set minimum instances to zero initially unless WebSocket latency requirements justify a warm instance.

### Phase 2: staging deployment
- Deploy a staging Cloud Run service with the same MongoDB cluster and Firebase project only if data isolation is safe; otherwise use staging resources.
- Configure secrets through the platform's secret manager, health checks, request/body limits, CORS, and logging.
- Test auth, profiles, swipes, matches, chat, subscription lifecycle, payment webhooks, admin endpoints, uploads, and scheduled jobs.

### Phase 3: real-time and scale validation
- Test Socket.IO reconnects, room membership, multi-instance delivery, long-lived connections, duplicate messages, RTDB mirroring failures, and presence cleanup.
- Do not enable multi-instance autoscaling for chat until the adapter or RTDB transition is complete.
- Verify chat authorization and RTDB rules using negative tests with two unrelated accounts.

### Phase 4: cutover and retirement
- Deploy behind a staging/custom domain and run smoke tests.
- Shift traffic gradually; monitor 4xx/5xx, latency, MongoDB connections, chat delivery, payment callbacks, and cost.
- Keep a rollback target and avoid simultaneous database/schema changes.
- Retire the old server only after a measured observation window and verified rollback plan.

## Initial acceptance criteria

- Existing backend and frontend test suites pass.
- New runtime configuration tests pass.
- No in-process cron duplication in serverless mode.
- MongoDB pool size is configurable and conservative for scaled instances.
- Socket.IO behavior is explicitly tested before enabling more than one instance.
- RTDB rules and payment webhook behavior are reviewed before production cutover.

## Open risks to resolve from source and deployed configuration

- RTDB security rules were not present at the inspected root paths, so client read/write authorization is not yet verified.
- Socket.IO uses in-memory room/online state and needs a multi-instance design.
- Existing cron jobs run when MongoDB connects unless disabled by environment configuration.
- Chat IDs are parsed by splitting on hyphens in frontend/backend code; confirm UID/room ID assumptions before changing authorization.
- The repository's Dockerfile uses Node 18. Upgrade the runtime only after testing dependency and native-module compatibility.
