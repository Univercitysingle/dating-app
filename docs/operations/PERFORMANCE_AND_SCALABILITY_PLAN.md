# Performance and Scalability Plan
Last reviewed: 2026-11-07. No concurrency capacity is certified by this document.

Measure request rate, active sessions, p50/p95/p99 latency, errors, Worker duration, Durable Object latency/queue, Mongo pool wait/active connections and slow queries, Firebase reads/writes, CDN errors, TURN bandwidth and frontend bytes.

Progressive stages: baseline/100, 1,000, 2,500, 5,000, 10,000 and then 15,000 concurrent sessions. Define concurrency precisely; connected sessions and request generator count differ.

Workload includes auth, discovery, swipes, inbox, chat, notifications, media reads/uploads and payment sandbox. Test read-heavy, write-heavy and bursts with realistic think time.

Use staging data and non-production payments. Coordinate quotas and cost. Stop on sustained errors or saturation. Record scripts, SHA, configuration, throughput, percentiles, errors, bottlenecks and fixes. Set SLOs before testing; never infer capacity from pool arithmetic.
