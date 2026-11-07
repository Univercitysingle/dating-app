# Analytics and Product Metrics
Last reviewed: 2026-11-07. This is a measurement design, not proof that all events exist.

## Candidate funnel
Registration started/completed; onboarding completed; profile published; discovery viewed; like sent; mutual match; conversation started; message sent; report/block; checkout started; payment settled; entitlement revoked; verification submitted/decided; room created/joined/ended.

## Operational metrics
Request volume, success/error rates, p50/p95/p99 latency, Worker exceptions, Durable Object latency, MongoDB pool and slow queries, Firebase traffic/denials, CDN errors, payment callback outcomes, verification queue age and TURN relay usage.

## Privacy
Use pseudonymous identifiers. Never send message bodies, contact details, verification media, payment credentials or sensitive preferences to analytics. Define consent, purpose, owner and retention.

## Definitions to approve
Activation, match conversion, meaningful conversation, payment conversion, retention cohort and confirmed abuse rate. Validate analytics against source-of-truth records before business use.
