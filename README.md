# University Single: Dating App

A dating platform for profiles, discovery, matching, conversations, real-time communication, verification, monetisation, trust and safety, and administration.

**Documentation last updated:** 2026-11-11  
**Active migration branch:** migrate-to-serverless

> Documentation describes scope and observed implementation. Planned or documented functionality is not automatically implemented, tested or production-ready.

## Product blueprint
- [Product mindmap](./docs/PRODUCT_MINDMAP.md)
- [Product requirements](./docs/product/PRODUCT_REQUIREMENTS.md)
- [User journeys and acceptance](./docs/product/USER_JOURNEYS.md)
- [Feature roadmap](./docs/product/FEATURE_ROADMAP.md)

## Architecture
- [System architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md)
- [API reference](./docs/architecture/API_REFERENCE.md)
- [Database design](./docs/architecture/DATABASE_DESIGN.md)
- [Integration specification](./docs/architecture/INTEGRATION_SPEC.md)
- [Migration plan](./MIGRATION_PLAN.md)

## Feature specifications
- [Matching and discovery](./docs/features/MATCHING_AND_DISCOVERY_SPEC.md)
- [Chat and notifications](./docs/features/CHAT_AND_NOTIFICATIONS_SPEC.md)
- [Payments and subscriptions](./docs/features/PAYMENT_AND_SUBSCRIPTION_SPEC.md)
- [Video rooms](./docs/features/VIDEO_ROOMS_SPEC.md)
- [Verification and trust](./docs/features/VERIFICATION_AND_TRUST_SPEC.md)
- [Moderation and administration](./docs/features/MODERATION_AND_ADMIN_SPEC.md)
- [Photo verification operational guide](./docs/PHOTO_VERIFICATION.md)
- [Dark Fantasy launch gates](./docs/dark-fantasy-launch.md)

## Security, operations and governance
- [Project completion audit](./docs/PROJECT_COMPLETION_AUDIT.md)
- [VAPT assessment](./docs/security/VAPT-2026-11-05.md)
- [Security remediation tracker](./docs/security/REMEDIATION_TRACKER.md)
- [Performance and scalability](./docs/operations/PERFORMANCE_AND_SCALABILITY_PLAN.md)
- [Testing and acceptance](./docs/operations/TESTING_AND_ACCEPTANCE_PLAN.md)
- [Deployment and rollback](./docs/operations/DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md)
- [Monitoring and incident response](./docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md)
- [Privacy and retention](./docs/governance/PRIVACY_AND_DATA_RETENTION.md)
- [Terms and community guidelines draft](./docs/governance/TERMS_AND_COMMUNITY_GUIDELINES.md)
- [Release management](./docs/governance/RELEASE_MANAGEMENT.md)
- [Analytics and product metrics](./docs/product/ANALYTICS_AND_PRODUCT_METRICS.md)

## Current architecture
| Layer | Technology |
|---|---|
| Frontend | React on Cloudflare Pages |
| API | Cloudflare Workers |
| Stateful coordination | Cloudflare Durable Objects |
| Primary database | MongoDB Atlas |
| Authentication | Firebase Authentication |
| Real-time chat | Existing Firebase Realtime Database integration |
| Media | Existing CDN Worker and private Backblaze B2 |
| Payments | WebXPay integration |
| Audio/video | WebRTC with STUN/TURN |
| CI/CD | GitHub Actions |

MongoDB Atlas remains primary. Firebase chat remains. The existing CDN Worker must not be modified as part of ordinary app changes. Redis is not assumed deployed. No Vercel. Do not use the retired DuckDNS URL.

## Calls: current implementation and validation status

One-to-one voice and video calls share the responsive call interface. The current call controller applies automatic video bitrate, frame-rate and resolution scaling based on WebRTC connection statistics. Audio capture requests mono voice processing (echo cancellation, noise suppression and automatic gain control) and requests a low outgoing Opus bitrate where the browser exposes sender controls. Audio remains active when video quality is reduced. These are adaptive targets, not guaranteed data caps; browser and codec support vary.

**Latest call-quality source revision:** `bf5c435553c6f18cc5a80e5b14df68e1c69249ca` on `migrate-to-serverless`.

**Deployment status:** GitHub Actions quota is exhausted according to the project operator. The Cloudflare Pages workflow for this revision did not complete successfully, and the latest call-quality changes are not confirmed deployed. Do not infer live availability from the committed source. Build, browser, two-device, TURN-relay and measured data-usage validation remain outstanding until Actions capacity is restored or an approved manual validation path is used.

## Staging
- Frontend: https://dating-app-staging.pages.dev
- API Worker: https://dating-app-api-staging.enadoctemp.workers.dev
- Existing media CDN: https://dateme.enadoctemp.workers.dev

## Branch and release rules
All migration changes stay on migrate-to-serverless. Do not modify main. A successful build or deployment does not prove end-to-end acceptance or production readiness. Production cutover requires separate approval, verified journeys, security/performance evidence and rollback readiness.

## Performance
Proposed test progression: baseline, 100, 1,000, 2,500, 5,000, 10,000 and 15,000 concurrent sessions. No capacity claim should be made until repeatable load tests measure latency, error rate and dependency saturation.

## Definition of completion
Every mindmap requirement must map to implementation, tests and staging evidence. Keep implementation status distinct from external approval and production readiness.

### WebRTC TURN configuration (staging)

ExpressTURN is the primary TURN relay when both `EXPRESSTURN_USERNAME` and `EXPRESSTURN_PASSWORD` are configured. The Worker uses `free.expressturn.com:3478` over UDP/TCP. Turnix supplies short-lived fallback ICE credentials through the server-side `TURNIX_API_TOKEN`; the Worker orders ExpressTURN first, then Turnix relay tiers, then direct STUN fallback. These credentials must remain Cloudflare Worker/GitHub Actions secrets and must never enter frontend bundles, source code, or logs. The repository tests verify provider ordering and fallback construction, but they do not prove that either provider is configured in the live staging Worker or that relay allocation succeeds. Check each provider dashboard for current quota and usage rather than relying on an assumed free-tier allowance. If both TURN providers are unavailable, calls may still connect only where a direct network path permits it.


## Documentation completeness and evidence controls (2026-11-11)

This document must distinguish source implementation, automated test coverage, staging deployment, live-provider validation, and production acceptance. For every requirement, record an owner, status, evidence link or test identifier, last verified commit, dependencies, rollback impact, and next action. Never mark an item complete solely because it appears in source or a unit test. Reconcile this document against the live route registrations, Worker configuration, database schema/indexes, frontend call sites, and deployment workflow before release.

Open cross-document gaps to close and track: (1) full API route/method/authentication/authorization/request/response/error contract; (2) MongoDB collection schemas, indexes, uniqueness, TTL and migration/rollback rules; (3) Firebase RTDB path/rule matrix and push notification subscription/delivery/retry lifecycle; (4) MongoDB backup/restore and Firebase recovery drills with approved RPO/RTO; (5) payment callback replay, reconciliation, refunds, stale-pending recovery and duplicate settlement evidence; (6) moderation case lifecycle, user/admin message edit/delete permissions and immutable audit events; (7) account export/deletion propagation and backup retention; (8) supported browser/device, PWA/offline and notification-permission matrix; (9) keyboard, screen-reader, contrast and form-accessibility checks; (10) localization, timezone and RTL readiness. These are tracked requirements, not claims that the features are implemented.
## Documentation governance and unresolved evidence

The documentation catalogue is not a substitute for live verification. Before each release, reconcile route inventory, Worker bindings/secrets (names only), database indexes, scheduled triggers, Firebase RTDB rules, payment callbacks, TURN provider configuration, and Pages/Worker deployment SHAs against the actual staging environment. Record each item as implemented, tested, deployed, or production-accepted. Do not publish secrets, personal data, raw payment payloads, or verification evidence. Outstanding work includes a complete route-by-route API contract, verified collection/index catalogue, push delivery lifecycle, backup/restore exercise with RPO/RTO, privacy export/deletion proof, accessibility and browser matrix, localization/RTL review, and moderator/support-message permission tests. The linked operational and feature documents own these checklists.