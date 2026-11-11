# Performance and Scalability Plan
Last reviewed: 2026-11-07. No concurrency capacity is certified by this document.

Measure request rate, active sessions, p50/p95/p99 latency, errors, Worker duration, Durable Object latency/queue, Mongo pool wait/active connections and slow queries, Firebase reads/writes, CDN errors, TURN bandwidth and frontend bytes.

Progressive stages: baseline/100, 1,000, 2,500, 5,000, 10,000 and then 15,000 concurrent sessions. Define concurrency precisely; connected sessions and request generator count differ.

Workload includes auth, discovery, swipes, inbox, chat, notifications, media reads/uploads and payment sandbox. Test read-heavy, write-heavy and bursts with realistic think time.

Use staging data and non-production payments. Coordinate quotas and cost. Stop on sustained errors or saturation. Record scripts, SHA, configuration, throughput, percentiles, errors, bottlenecks and fixes. Set SLOs before testing; never infer capacity from pool arithmetic.


## Current capacity status (2026-11-11)

The target remains support for approximately 1,000 concurrent users, but this is a target, not a measured capacity claim. No concurrency, latency or cost certification is made here. Run repeatable staging load tests with realistic authentication, discovery, chat, media and call traffic. Include MongoDB connection pressure, Durable Object serialization, Firebase operations, CDN traffic and TURN relay bandwidth. The call implementation now contains adaptive sender profiles and WebRTC-stat-based quality adjustment at source revision `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`; actual bitrate, bytes transferred and user data savings remain unmeasured. GitHub Actions quota exhaustion blocks a fresh CI/deployment validation run.


## Operational evidence gaps and controls (2026-11-11)

For each control or procedure, identify the owner, prerequisites, exact command or dashboard path where safe, expected result, failure handling, evidence location, last verified commit, and review cadence. Never document a procedure as proven until it has been exercised in the intended environment. Keep production and staging instructions distinct.

Required evidence areas to maintain: route-level API authorization and error-contract tests; MongoDB schema/index/TTL and migration/rollback checks; Firebase RTDB rule tests and push notification lifecycle; MongoDB backup/restore and Firebase recovery exercises with approved RPO/RTO; payment callback replay/idempotency/reconciliation/refund and stale-checkout tests; moderation and support-ticket message permissions with immutable audit history; account export/deletion and backup retention; browser/device/PWA/offline and notification-permission matrix; keyboard, screen-reader, contrast and form accessibility; localization, timezone and RTL checks. Capacity targets, service objectives and recovery objectives remain proposed until measured and approved.
