# University Single: Dating App

A dating platform for profiles, discovery, matching, conversations, real-time communication, verification, monetisation, trust and safety, and administration.

**Documentation last updated:** 2026-11-07  
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
