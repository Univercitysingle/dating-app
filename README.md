# University Single: Dating App

A dating platform built around profile discovery, matching, conversations, real-time communication, video experiences, subscriptions, trust and safety, and administration.

**Documentation last updated:** 2026-11-07  
**Active migration branch:** `migrate-to-serverless`

> This README describes the current target architecture and project direction. Feature availability must be verified against the implementation and staging environment. A documented or planned capability is not automatically production-ready.

## Product blueprint

The complete product and architecture mindmap is maintained separately:

- **[Complete Product Mindmap](./docs/PRODUCT_MINDMAP.md)**

The mindmap covers:
- User registration, profiles, preferences, discovery, likes, and matching.
- Messaging, Firebase real-time integration, video calls, and live rooms.
- Selfie verification, trust, reporting, blocking, and moderation.
- Subscriptions, store products, payment processing, and entitlements.
- Admin operations, analytics, security, privacy, and compliance.
- Backend architecture, data domains, performance, scalability, and delivery roadmap.

## Current architecture

The application is being migrated to a Cloudflare serverless architecture.

| Layer | Technology / responsibility |
|---|---|
| Frontend | React |
| Frontend hosting | Cloudflare Pages |
| API | Cloudflare Workers |
| Stateful coordination | Cloudflare Durable Objects |
| Primary database | MongoDB Atlas |
| Authentication | Firebase Authentication integration |
| Real-time chat | Existing Firebase Realtime Database integration |
| Media delivery | Existing CDN Worker |
| Object storage | Private Backblaze B2 behind the existing CDN Worker |
| Payments | WebXPay integration |
| Real-time audio/video | WebRTC with STUN/TURN infrastructure |
| CI/CD | GitHub Actions |
| Source control | GitHub |

### Architecture boundaries

- MongoDB Atlas remains the primary application database and system of record.
- Firebase Realtime Database remains in place for the existing chat integration.
- The existing CDN Worker and private Backblaze B2 arrangement are retained. Application media traffic should use the configured CDN hostname.
- Cloudflare Pages hosts the frontend. Cloudflare Workers provide the API.
- Durable Objects support stateful coordination, including MongoDB connection instances and account-scoped rate limiting where configured.
- Redis is not assumed to be deployed in the current architecture. Caching should first be evaluated using Cloudflare-native capabilities and measured application requirements.
- Private profile, conversation, payment, and other user-specific data must not be placed in a shared cache without strict isolation and a reviewed security design.

## Environments

| Component | Staging |
|---|---|
| Frontend | https://dating-app-staging.pages.dev |
| API Worker | https://dating-app-api-staging.enadoctemp.workers.dev |
| Media CDN Worker | https://dateme.enadoctemp.workers.dev |

Do not use the retired legacy DuckDNS URL. Do not introduce Vercel into this project.

## Core product modules

1. **Accounts and profiles:** registration, authentication, profile editing, photos, preferences, and account lifecycle.
2. **Discovery and matching:** gender and age preferences, distance, likes, passes, mutual matches, ranking, and exclusions.
3. **Conversations:** messaging, unread state, typing indicators, presence, and real-time updates.
4. **Video experiences:** one-to-one calls, public/private rooms, participant controls, and room booking.
5. **Trust and verification:** email/mobile verification, selfie verification, verification status, and evidence protection.
6. **Monetisation:** subscription plans, store products, paid features, payment callbacks, refunds, and entitlements.
7. **Notifications:** match, message, call, verification, moderation, and payment events.
8. **Safety and moderation:** report, block, unblock, unmatch, enforcement, rate limiting, and audit history.
9. **Administration:** user management, moderation queues, payment oversight, roles, and reporting.
10. **Platform operations:** monitoring, security testing, performance optimisation, deployment, and incident response.

See the [Product Mindmap](./docs/PRODUCT_MINDMAP.md) for detailed submodules, user journeys, architecture, requirements, and roadmap.

## Repository and branch workflow

- Repository: [Univercitysingle/dating-app](https://github.com/Univercitysingle/dating-app)
- Active migration branch: `migrate-to-serverless`
- Keep migration implementation commits on `migrate-to-serverless`.
- Do not make migration changes directly on `main`.
- Use GitHub Actions for the configured validation and Cloudflare deployment workflows.
- Validate staging deployments and relevant smoke tests before considering a change complete.

## Performance and scalability

The project is designed to be measured incrementally rather than claiming an unverified concurrency capacity.

Proposed load-test stages:
- 100 concurrent users for baseline behaviour.
- 1,000 and 2,500 concurrent users for initial scale validation.
- 5,000 and 10,000 concurrent users for larger capacity tests.
- 15,000 concurrent users as a subsequent validation milestone.

Measure API p50/p95/p99 latency, error rates, Worker execution, Durable Object throughput, MongoDB connection utilisation and slow queries, Firebase traffic, media delivery, and TURN usage. Proposed latency and error objectives must be confirmed by repeatable load tests before being treated as achieved.

Key optimisation priorities:
- Reduce unnecessary background polling and duplicate requests.
- Prefer event-driven updates where supported.
- Use cursor-based pagination for growing result sets.
- Optimise MongoDB indexes and query patterns based on measurements.
- Set connection pools according to Atlas tier limits and observed concurrency.
- Cache only data that is safe to share, with explicit keys and invalidation.
- Optimise frontend bundles and image delivery.
- Test timeouts, retries, rate limits, and graceful degradation.

## Security and privacy principles

- Verify authentication tokens server-side.
- Enforce resource ownership and role-based authorization on every protected operation.
- Treat client-provided user IDs, prices, entitlements, and payment outcomes as untrusted.
- Keep email addresses and mobile numbers out of ordinary public profile responses.
- Store secrets in approved GitHub and Cloudflare secret stores, never in source code or frontend bundles.
- Validate uploads and media access while preserving the existing CDN boundary.
- Enforce blocking consistently across discovery, messaging, and calling.
- Rate-limit sensitive operations and audit administrative moderation actions.
- Protect verification evidence and restrict access to authorised reviewers.
- Test authentication, authorization, IDOR, injection, rate-limit bypass, and payment idempotency.
- Document retention, account deletion, and privacy handling.

## Development and validation

Before marking a feature complete, verify the applicable items:

- Frontend and backend implementation.
- Data model, indexes, and integrity behaviour.
- Authentication and authorization.
- Input validation and error handling.
- Abuse prevention and rate limiting.
- Unit, integration, and end-to-end tests.
- Security regression tests.
- Successful staging deployment and smoke tests.
- Monitoring and operational documentation.
- Performance evidence for scale-sensitive features.

A passing unit test, a successful deployment, and a production-validated user journey are distinct levels of evidence.

## Roadmap

| Priority | Focus |
|---|---|
| P0 | Core account, profile, discovery, matching, messaging, moderation, and security reliability |
| P1 | Verification lifecycle, payment reconciliation, event-driven notifications, and database optimisation |
| P2 | Video room reliability, paid bookings, and 5k to 10k load validation |
| P3 | 15k load validation, recommendation improvements, analytics, and product expansion |

The roadmap is a planning guide. Consult the mindmap and current repository state before starting work to avoid duplicating existing functionality.

## Documentation

- [Complete Product Mindmap](./docs/PRODUCT_MINDMAP.md)
- [GitHub Repository](https://github.com/Univercitysingle/dating-app)
- [Staging Frontend](https://dating-app-staging.pages.dev)
