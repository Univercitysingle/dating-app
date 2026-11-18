# University Single: Dating App

A dating platform for profiles, discovery, matching, conversations, real-time communication, verification, monetisation, trust and safety, and administration.

**Documentation last updated:** 2026-11-18  
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

## Latest deployment verification (2026-11-18)

- Active branch: `migrate-to-serverless`. Documentation revision immediately before this update: `ea4e7d3def53b83f76e7755692698cba0c6891e5`.
- **Cloudflare Pages staging:** [workflow 44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520) completed successfully on commit `f4fd891027c8b486f5f8609e9e7db1051988d56c`. Root and backend dependency installation, production high-severity audit gates, full audit-policy checks, backend and frontend tests, SEO validation, frontend build, Pages deployment, deployed SEO endpoint checks, asset/API-routing verification and the OWASP ZAP passive baseline all passed.
- **Cloudflare Worker staging:** [workflow 44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558) completed successfully on the same commit. Worker tests, TURN credential verification, isolated staging deployment, liveness/readiness and MongoDB checks, protected-route anonymous rejection, legacy route checks and the OWASP ZAP passive baseline all passed. No Worker application source changed in the dependency cleanup commit.
- **Dependency remediation:** AWS SDK v2 was removed from the root and legacy backend manifests/lockfiles. The application now declares its direct `uuid@^11.1.1` dependency explicitly. The current audit still reports moderate `glob` and `minimatch` advisories in the optional Firebase Admin Google Cloud Firestore dependency chain. The development-only `picomatch` high-severity advisory remains under the existing narrowly scoped exception. See [security remediation tracker](./docs/security/REMEDIATION_TRACKER.md).
- **Remaining dependency update:** Root lockfile still pins `firebase-admin@14.5.0`; `14.5.1` is available with upstream security fixes and requires a lockfile update plus regression validation.
- **Revision alignment:** Commit `f4fd891` changed dependency manifests, lockfiles and security documentation only. No application Worker or CDN source was modified. The successful Worker staging deployment therefore contains the same Worker application code as the prior verified revision.
- **Release state:** Pages and Worker staging deployments are verified. Real-user phone-auth journeys, payment settlement, real-device audio/video relay, broader browser acceptance, load testing and production readiness remain outstanding. Do not cut over production.
- **Scope:** `main`, production and the existing CDN Worker were not modified. No Vercel or Hugging Face deployment was performed.

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


## Additional operational specifications
- [Documentation completeness register](./docs/DOCUMENTATION_GAP_REGISTER.md)
- [Disaster recovery and backup](./docs/operations/DISASTER_RECOVERY_AND_BACKUP.md)
- [Push notifications](./docs/features/PUSH_NOTIFICATIONS_SPEC.md)
- [Accessibility, browser compatibility and localization](./docs/operations/ACCESSIBILITY_BROWSER_LOCALIZATION.md)
- [Data subject requests and account lifecycle](./docs/governance/DATA_SUBJECT_REQUESTS.md)

## Documentation governance and unresolved evidence

The documentation catalogue is not a substitute for live verification. Before each release, reconcile route inventory, Worker bindings/secrets (names only), database indexes, scheduled triggers, Firebase RTDB rules, payment callbacks, TURN provider configuration, and Pages/Worker deployment SHAs against the actual staging environment. Record each item as implemented, tested, deployed, or production-accepted. Do not publish secrets, personal data, raw payment payloads, or verification evidence. Outstanding work includes a complete route-by-route API contract, verified collection/index catalogue, push delivery lifecycle, backup/restore exercise with RPO/RTO, privacy export/deletion proof, accessibility and browser matrix, localization/RTL review, and moderator/support-message permission tests. The linked operational and feature documents own these checklists.

## Source-backed technical catalogues
- [Active Worker API catalogue](./docs/architecture/WORKER_API_CATALOG.md)
- [Active Worker MongoDB collection catalogue](./docs/architecture/WORKER_DATABASE_CATALOG.md)



## Historical Cloudflare Pages dependency gate failure (2026-11-18, superseded)

The retry of Pages workflow run [42995531214](https://github.com/Univercitysingle/dating-app/actions/runs/42995531214) failed at the frontend dependency security gate before tests, build, or deployment. It checked out commit `41860e09010a477144c95c6b05135cf84e498d28`; the current branch has since advanced through documentation-only commits, and the package manifest/lockfile were not changed by those commits. The audit reported 75 findings (1 low, 6 moderate, 68 high). The high-severity findings are repeated dependency paths to `picomatch`, which is pulled into the build/test toolchain through packages including `react-scripts`, Tailwind, and file-watching/globbing utilities. GitHub advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) reports affected picomatch versions through 4.0.7 and currently provides no patched version. Do not force-upgrade Tailwind 3 to Tailwind 4 or downgrade other packages simply to make the audit pass. The audit also reported moderate `glob`/`minimatch` paths and the low/informational AWS SDK v2 region-validation advisory [GHSA-j965-2qgj-vjmq](https://github.com/advisories/GHSA-j965-2qgj-vjmq). AWS SDK v2 was subsequently removed from both manifests and lockfiles in commit `f4fd891`. The moderate `glob`/`minimatch` findings remain open and are tracked in the security remediation register. At the time of this historical run, Pages had not deployed that revision. This blocker was superseded by successful Pages staging run 44266691520 recorded above.


### Pages dependency audit remediation update (2026-11-18)

The frontend package classification and Pages audit gate have been corrected without forcing major-version upgrades:

- `react-scripts` and `tailwindcss` are build-time tools and are now declared as development dependencies.
- The root lockfile's dependency flags were recalculated from the production and development dependency graphs. Both installed `picomatch` copies are now explicitly marked development-only.
- Pages now runs a blocking audit against shipped production dependencies using `npm audit --omit=dev --audit-level=high`.
- The complete dependency tree is still audited. `scripts/validate-frontend-audit.js` fails on any high/critical finding other than GHSA-fc5q-39xc-vjpf, and permits that advisory only while every affected `picomatch` lockfile node remains development-only.
- The remaining `picomatch` advisory is not patched upstream as of this update. It remains tracked for reassessment when a fixed release is published. The moderate `glob` finding in the production dependency graph is still reported by the full audit and requires follow-up.

This changes the security gate's scope, not the advisory status. The frontend still must pass regression tests, SEO validation, build, and Cloudflare Pages post-deployment checks before staging is considered deployed. No production deployment is authorized by this change.


### Cloudflare Pages staging deployment result (2026-11-18)

- Staging frontend deployed successfully from `migrate-to-serverless` in [workflow run 44263579159](https://github.com/Univercitysingle/dating-app/actions/runs/44263579159), source commit `cb9f32f12b900174145d17ea4862ca535e49d54c`.
- Frontend and backend dependency installation, production high-severity audits, scoped full-audit validation, backend regression tests, frontend regression tests, public SEO validation, frontend build, Pages deployment, deployed SEO endpoints, and frontend asset/API-routing checks passed.
- The OWASP ZAP passive baseline was still running when this historical status was recorded. A later complete Pages staging run, 44266691520, passed the passive baseline.
- Deployment target: `https://dating-app-staging.pages.dev`. The Worker remains the previously verified staging deployment. Production cutover was not performed.
- Residual dependency findings at that time: the upstream picomatch advisory remained limited to development/build dependencies under the documented scoped exception. AWS SDK v2 and transitive uuid dependency cleanup was completed later in commit `f4fd891`; moderate `glob`/`minimatch` findings remain open.
