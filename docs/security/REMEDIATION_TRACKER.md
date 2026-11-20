# Security Remediation Tracker

**Last reviewed:** 2026-11-20  
**Branch:** `migrate-to-serverless`  
**Status:** Working remediation register. This is not a fresh penetration test or security certification.

## How to use this tracker

Track each finding from reproducible evidence through a code/configuration fix, regression test, staging verification and independent closure. A commit or passing unit test alone does not close a finding. Record the affected source SHA, environment, test identity/role, evidence location, owner and closure date. Do not place secrets, tokens, private message content or verification evidence in this file.

## Open evidence and remediation items

| Priority | Area | Required action and closure evidence | Status |
|---|---|---|---|
| Critical gate | Firebase Realtime Database | Verify deployed RTDB rules and project IAM. Test unauthenticated access, non-member reads/writes, blocked/unmatched users, stale membership and cross-user notification access. Keep direct browser realtime sync disabled until negative tests pass. | Open, external console evidence required |
| High | Email verification and phone authentication | Keep the central verified-email gate for email-based accounts; permit Firebase phone-provider tokens only when the UID already has a provisioned profile. Reject phone-only identities without an existing profile. Validate provider claims and account restrictions. | Worker test suite passed and source deployed to staging in run 44255109535; real phone-account journey still pending |
| High | Authentication and authorization | Run two-user and admin/ordinary-user IDOR, role escalation, token expiry/revocation and resource ownership tests against staging. | Regression coverage exists; staging evidence pending |
| High | Payment callbacks | Verify provider signature, order/amount/currency binding, replay/idempotency, duplicate callbacks, failed checkout recovery and entitlement revocation with provider sandbox evidence. | Partial, provider acceptance pending |
| High | Payment reconciliation | Use the superadmin-only read-only reconciliation report to identify stale pending records, partial gateway metadata, refund review items and duplicate references. Match findings against WebXPay merchant/provider records before taking action. | Local MongoDB report deployed to staging; provider status is not queried and no automatic entitlement or refund action is performed |
| High | Media access | Validate upload/read/delete ownership and support attachment access through the existing CDN proxy. Do not modify the CDN Worker under this tracker. | Staging acceptance pending |
| High | Moderation | Verify report, block, unmatch, ticket-message edit/delete permissions, admin audit history and abuse/rate-limit enforcement. | Implementation and role-specific acceptance require confirmation |
| High | Verification evidence | Verify encryption-key availability without revealing its value, reviewer-only access, audit trail, expiry, deletion, backup retention and consent withdrawal. | Operational/privacy review pending |
| Medium | WebRTC/TURN | Verify ExpressTURN primary and Turnix fallback credentials, actual relay candidate selection, credential expiry, network fallback and abuse controls on real devices. | Unit tests present; live relay evidence pending |
| Medium | Secrets and CI/CD | Review GitHub Actions and Cloudflare secret scopes, prevent secret exposure in logs/build artifacts, and retain exact-SHA deployment evidence. | Latest Pages and Worker staging workflows succeeded on 2026-11-18; production workflow and production environment remain unconfigured |
| Medium | Monitoring | Confirm alerting for Worker errors, Durable Object failures, MongoDB pressure, Firebase denials, payment callbacks, media proxy and TURN usage. | Provider-console evidence pending |
| Medium | Capacity | Load-test realistic auth, discovery, chat, media and calls; record latency, error rates, dependency saturation and cost. | 1,000 concurrent users remains an unverified target |

## Release blockers

- Do not enable direct Firebase RTDB client sync until deployed rules and negative tests are reviewed.
- Do not approve production payment flows without provider sandbox settlement and callback replay tests.
- Do not enable Dark Fantasy until its separate legal, age-assurance, processor, privacy and moderation gates are approved.
- Do not claim 1,000 concurrent-user capacity without repeatable load-test evidence.
- Do not claim a source revision is deployed until the exact SHA is visible in Cloudflare deployment records.
- Do not modify the existing CDN Worker or payment-provider configuration as part of unrelated remediation.

## Current CI and source caveat (2026-11-11)

Historical note: Actions capacity was previously reported exhausted. It was available for the successful Pages run [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520) and Worker run [44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558) on 2026-11-18. These are staging validations, not production acceptance. The VAPT report dated 2026-11-05 remains a historical snapshot and must not be represented as a new assessment.

## Closure template

For each resolved item, record:

- Finding ID and original risk.
- Exact code/configuration change and commit SHA.
- Regression test and result.
- Staging environment and tested roles/accounts.
- Relevant sanitized logs or evidence link.
- Residual risk and reviewer approval.
- Closure date.


## Evidence freshness and closure criteria (2026-11-11)

Findings and operational statements remain open until a named owner supplies reproducible evidence, the reviewer confirms the result, and the exact commit/deployment revision is recorded. Classify findings by severity and exploitability, document affected component and preconditions, provide a safe reproduction or test identifier, remediation, compensating control, residual risk, due date, and retest outcome. Do not include secrets, raw user evidence, payment credentials, or private object URLs. A code fix without a deployed retest is not a closed finding. For storage/CDN operations, preserve the existing CDN Worker boundary and do not change CDN behaviour under this documentation update.


## Source remediation update (2026-11-18)

- **Finding:** Dark Fantasy region-gate inconsistency allowed wildcard country configuration in the communities and primary feature handlers, while the shared gate rejected wildcard access.
- **Change:** Those handlers now delegate to the shared fail-closed regional gate. A wildcard-only setting is rejected consistently across catalogue, profile, communities, and Video Rooms ICE configuration.
- **Source commit:** `9f60b8f002fd88f06e3dd86c1b8cac8b89c7a6cd`
- **Regression-test commit:** `345bffaf4d1556637addc2ad1b69eb56d70fe4e5`
- **Evidence status:** Tests added, not executed in this environment. Staging deployment and provider/browser validation are outstanding. This finding is not closed until the tests pass and the exact deployed revision is confirmed.


## Call credential abuse protection update (2026-11-18)

- **Finding:** Authenticated standard call ICE configuration and paid Video Rooms ICE configuration did not apply account-level rate limiting before obtaining ICE credentials.
- **Change:** Added separate per-user Durable Object limiter scopes for standard calls and Video Rooms. Each scope permits 20 credential requests per 60-second window. Signalling, call polling, history and media streams are not covered by this limiter, avoiding broad throttling of normal call traffic. Limiter failures fail closed with HTTP 503.
- **Source commit:** `b95de00790a11ee6ec24fa2f11223836e5ae9129`
- **Regression-test commit:** `160f3bfefe7a179527e4f0d8fc389b94757f0fe9`
- **Evidence status:** Test cases added for independent scopes, configured thresholds and fail-closed behaviour. Tests have not been executed in this environment. Staging deployment, real call setup/reconnect testing and provider usage verification remain outstanding. This is a source-level remediation, not a closed security finding.


## Firebase signing-key retrieval hardening (2026-11-18)

- **Finding:** Firebase ID-token verification fetched Google's signing-key set on every authenticated request and had no explicit request timeout. This increased authentication latency and exposed protected routes to unbounded key-service waits.
- **Change:** Added bounded in-isolate JWKS caching using the provider Cache-Control max-age where available, a five-minute fallback TTL, a six-hour maximum cache lifetime, concurrent-fetch coalescing, and a five-second fetch timeout. Failed or malformed key responses are not cached, and stale keys are not used after expiry.
- **Source commit:** a426f5c13ad4bbc5170dcc957da33534bb013c7a
- **Regression-test commit:** b26e3bbc2042ee9de9bffb9ead3cd01632ae9f02
- **Evidence status:** Cache reuse and malformed-response tests added. Tests have not been executed in this environment. Google key rotation, timeout behaviour and cold-start performance still require staging verification. This is not a substitute for email-verification policy, token revocation checks, or Firebase RTDB rules review.


- **Follow-up correction:** Cache-Control max-age parsing was corrected and a zero-second TTL regression case was added. Corrective source commit: af12cabaf88e3e3cd968f9f76ff4a20e417308d8. Latest regression-test commit: 51647abc6ec5116dbbbb67723e1a08b0f46a3c5c. Tests remain unexecuted.


## Email verification and phone authentication review (2026-11-18)

- **Existing control:** The MongoDB Durable Object already enforces verified email centrally for non-super-admin identities before authenticated operations. New profile provisioning also requires a verified email. The earlier concern that the Worker had no central email-verification gate was incorrect; this control is present in `workers/mongodb-connection.js`.
- **Confirmed compatibility defect:** The central gate treated every token with `email_verified !== true` as blocked. The frontend supports Firebase phone OTP login, whose tokens identify `firebase.sign_in_provider = "phone"` and carry a verified `phone_number`, not necessarily a verified email. Existing phone-authenticated accounts were therefore rejected by the central account gate.
- **Change:** The central gate now permits a valid E.164 phone-provider token only when a MongoDB user profile already exists for that Firebase UID. It continues to enforce account suspension/deletion restrictions. Phone-only identities without an existing profile are explicitly rejected, so this does not create new accounts or bypass the verified-email requirement for email-based identities.
- **Regression tests:** Added coverage for an existing phone account being allowed and a phone identity without a profile being rejected. The existing unverified-email test remains in place.
- **Source commits:** `35328ee9dade8e46d6c22867468eae3eb0479f11`, `7c8a07669efc65bc7365125bbe2fba1559a68d10`, `630f3522914f31325364d98e0ecac9c15c5ff8d3`.
- **Test commit:** `3fb3735c8d42cbbf7fdc982dd6f3799df8b4f212`.
- **Evidence status:** Worker test suite passed in staging deployment run [44255109535](https://github.com/Univercitysingle/dating-app/actions/runs/44255109535), deploying source `630f3522914f31325364d98e0ecac9c15c5ff8d3`. The workflow passed liveness/readiness checks and anonymous-access rejection checks. It did not exercise a real phone-authenticated account. Verify existing phone-account login, new phone-only account rejection, verified email/password login, Google sign-in, admin authorization, and suspended/deletion-pending phone accounts with staging test identities before closure.


## Staging deployment evidence update (2026-11-18)

- **Worker deployment:** Run [44255109535](https://github.com/Univercitysingle/dating-app/actions/runs/44255109535) successfully deployed Worker source `630f3522914f31325364d98e0ecac9c15c5ff8d3` to isolated staging.
- **Automated tests:** The run's `Run Worker tests` step completed successfully.
- **Runtime checks:** Liveness, readiness/MongoDB connectivity, protected-route anonymous rejection, legacy route inventory and OWASP ZAP passive baseline all completed successfully.
- **Branch alignment:** Current branch HEAD before this correction was `63da714cc5421ea084e732da2cfd3f595a6ab5e7`. Comparing it with deployed source `630f352` shows six documentation-only commits touching `README.md` and this tracker. No application source changed after the successful Worker deployment.
- **Remaining:** Real authenticated phone-account journeys and broader browser acceptance remain outstanding. Cloudflare Pages frontend deployment is not verified. Do not close findings solely on this deployment run.


## Cloudflare Pages dependency gate failure (2026-11-18)

- **Run:** [42995531214](https://github.com/Univercitysingle/dating-app/actions/runs/42995531214), retry of the older Pages workflow run. It checked out SHA `41860e09010a477144c95c6b05135cf84e498d28`, not the latest branch HEAD.
- **Result:** Failed at `npm audit --audit-level=high` after `npm ci` succeeded. Frontend tests, backend tests, SEO validation, build, Pages deployment and post-deployment checks were skipped.
- **Audit totals:** 75 findings: 1 low, 6 moderate, 68 high. The repeated high findings resolve to the `picomatch` ReDoS advisory GHSA-fc5q-39xc-vjpf, affecting versions through 4.0.7. As of this review, the advisory does not specify a patched release. It appears in the build/test dependency tree through CRA/Tailwind and glob/file-watch tooling. Do not pin to 4.0.7 or older, because the advisory explicitly includes those versions.
- **Other findings:** Moderate `glob` and `minimatch` dependency paths. The suggested `npm audit fix --force` would introduce breaking changes (including Tailwind 4 or a depcheck downgrade); do not apply blindly. AWS SDK v2 reports the low/informational GHSA-j965-2qgj-vjmq advisory with no patched v2 release; assess actual use and migrate to AWS SDK v3 where still required.
- **Required remediation:** Reproduce audit against current branch; fix non-breaking vulnerable transitive dependencies; inventory actual runtime use of AWS SDK v2; test dependency changes; then decide whether the remaining no-fix build-tool advisory warrants a narrowly scoped, time-limited risk acceptance. Do not lower or bypass the high-severity gate without explicit evidence, owner, mitigation, and review date.
- **Release status:** Cloudflare Pages deployment remains blocked and unverified. Worker staging remains deployed at source `630f3522914f31325364d98e0ecac9c15c5ff8d3`. No production change was made.


## Pages dependency audit remediation update (2026-11-18)

**Changes committed on `migrate-to-serverless`:**

- Moved `react-scripts` and `tailwindcss` from runtime dependencies to development dependencies because they are required to build/test the static frontend, not to serve the deployed Cloudflare Pages artifact.
- Recalculated the root npm lockfile development flags using production and development dependency reachability. Verified that all `picomatch` package nodes are reachable only from development dependencies and are marked `dev: true`.
- Replaced the blanket frontend audit gate with:
  - Blocking production dependency audit: `npm audit --omit=dev --audit-level=high`.
  - Full dependency audit report checked by `scripts/validate-frontend-audit.js`. It fails on unexpected high/critical findings and allows GHSA-fc5q-39xc-vjpf only when all affected picomatch nodes remain development-only.
- No `--force` dependency upgrades, Tailwind major upgrade, CDN changes, or production changes were made.

**Residual risks and verification:**

- GHSA-fc5q-39xc-vjpf remains an upstream unpatched advisory affecting picomatch through 4.0.7. It is isolated to build/test dependencies, not the deployed Pages runtime, and must be reassessed when upstream publishes a fix.
- The full audit still reports moderate findings, including `glob` in the production dependency graph. This update does not claim those moderate findings are fixed.
- The Pages workflow has not yet completed with these changes. `npm ci`, the production audit, the full-audit policy script, frontend/backend tests, SEO validation, build, deployment, and post-deployment checks must all pass before staging is marked deployed.
- Staging only. Production cutover remains out of scope.


## Cloudflare Pages staging deployment result (2026-11-18)

- Workflow: [44263579159](https://github.com/Univercitysingle/dating-app/actions/runs/44263579159)
- Source commit: `cb9f32f12b900174145d17ea4862ca535e49d54c` on `migrate-to-serverless`.
- Cloudflare Pages staging deployment: **successful** at `https://dating-app-staging.pages.dev`.
- Passed: dependency installation; production high-severity audit gates for frontend and legacy backend; full audit policy validation for development-only picomatch paths; backend and frontend regression tests; public SEO validation; frontend build; Cloudflare Pages deployment; deployed SEO endpoint checks; frontend asset and API-routing checks.
- OWASP ZAP passive baseline: **in progress at time of this historical record**. A later complete run is recorded below.
- Production cutover: not performed.
- Residual at that time: picomatch remained upstream-unpatched and scoped to development/build dependencies; AWS SDK v2 and uuid were subsequently addressed in the dependency manifest cleanup below. The moderate glob/minimatch advisories remain open.

## Dependency manifest cleanup (2026-11-18)

- Removed the end-of-support AWS SDK for JavaScript v2 package from the root and legacy backend dependency manifests and lockfiles. The active root S3 service imports `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (AWS SDK v3); repository code search found no direct AWS SDK v2 imports. The `backend/` directory contains dependency metadata and documentation, but no backend runtime source files.
- Added `uuid` as an explicit root production dependency at `^11.1.1`, matching the existing locked version, because `controllers/usersController.js` imports `uuid` directly. It was previously available only transitively.
- Regenerated the two npm lockfile package graphs from their existing resolved versions after updating root dependency metadata. No unrelated version upgrades were applied.
- **Validation status:** JSON and lockfile dependency metadata were regenerated and structurally checked. The subsequent Cloudflare Pages workflow `44266691520` successfully ran root and backend dependency installation, both production security-threshold checks, both full audit-policy checks, backend and frontend regression tests, SEO validation, frontend build, staging deployment, deployed asset/API-routing checks and OWASP ZAP passive baseline. GitHub Dependabot alert closure remains unconfirmed because the private alert list is not available through the connected repository interface.
- **Scope:** `migrate-to-serverless` only. No `main`, production deployment, Cloudflare Worker deployment, or CDN Worker change.

## Latest dependency audit and Pages deployment (2026-11-18)

- **Commit:** `f4fd891027c8b486f5f8609e9e7db1051988d56c` on `migrate-to-serverless`.
- **Cloudflare Pages workflow:** [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520) completed successfully. It installed root and backend dependencies, passed the production high-severity audit gates and full audit-policy checks, passed backend/frontend tests and SEO validation, built and deployed the frontend to Cloudflare Pages staging, verified deployed assets/API routing and completed the OWASP ZAP passive baseline. No production deployment occurred.
- **Resolved dependency cleanup:** Removed direct AWS SDK v2 from both manifests and lockfiles. The active root S3 service uses AWS SDK v3. Added `uuid@^11.1.1` as a direct root dependency because the application imports it directly. The lockfiles no longer contain AWS SDK v2.
- **Remaining moderate findings:** The full audit in both root and legacy backend environments reports six moderate findings each, representing two distinct advisories:
  - [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): `glob@10.5.0`, reached through the optional Firebase Admin Google Cloud Firestore dependency chain (`@google-cloud/firestore-api` / `google-gax` / `gaxios` / `rimraf`). The advisory is fixed in `glob@14.0.2`; the current parent chain pins compatible ranges around `rimraf@5` and `glob@10`, so a major override is not approved without a tested parent-chain update.
  - [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): `minimatch@9.0.9` nested under `glob@10.5.0`. The advisory is fixed in `minimatch@11.0.1`, outside the current `glob@10` dependency range. Do not force a major override without compatibility tests.
- **Additional upstream security update to schedule:** Root lockfile currently pins `firebase-admin@14.5.0`. Version `14.5.1` was published 2026-11-11 and includes a prototype-pollution fix in `deepExtend()` plus Authentication URL-path validation. Update the lockfile to 14.5.1 and retest before closing this item.
- **Audit interpretation:** Both production high-severity gates passed. The two moderate advisories above remain reported and are not fixed by the current deployment. The existing development-only `picomatch` high-severity exception remains separately scoped and must be revisited when upstream publishes a fix.
- **Dependabot visibility:** The exact open Dependabot alert inventory was not accessible through the connected GitHub interface. The npm audit output above is verified workflow evidence, not a claim that every GitHub Dependabot alert has been closed.
- **Scope:** No changes to `main`, production, Worker staging, the existing CDN Worker or payment-provider configuration.


## Latest Worker staging deployment and production release gate (2026-11-18)

- **Worker run:** [44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558), source commit `f4fd891027c8b486f5f8609e9e7db1051988d56c`, completed successfully.
- **Worker checks passed:** dependency installation and high-severity production audit; Worker tests; Turnix credential issuance; staging deployment; runtime secret configuration; liveness and readiness/MongoDB checks; anonymous rejection for authentication, support, migrated chat, status/admin reports, purchases and refunds; legacy route inventory; passive OWASP ZAP baseline.
- **Worker scan observation:** ZAP reported no new FAIL findings. It reported one warning for non-storable content, including the API `/sitemap.xml` path returning 404. Review whether this API path is expected to exist; the frontend sitemap is separately verified.
- **Pages run:** [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520), same application source commit, completed successfully. It passed dependency gates, frontend/backend tests, SEO checks, build, staging deployment, asset/API-routing checks and passive ZAP. ZAP reported warnings for cache-control, external script inclusion, timestamp disclosure, SRI and COEP observations, with no new FAIL findings.
- **Dependency status:** Both root and backend full audits still report six moderate findings each for `glob` and nested `minimatch`. The high findings are subject to the documented development-only `picomatch` exception. This is not a zero-vulnerability result. Firebase Admin remains pinned at `14.5.0` pending a tested lockfile update.
- **Production gate:** Current Pages workflow explicitly selects and enforces the `dating-app-staging` Pages project. `wrangler.jsonc` defines a staging environment but no production environment. No production deployment workflow is present in the active branch. Do not promote or claim production readiness until a production target, secrets/bindings, rollback plan and release acceptance are configured and verified.
- **Governance gate:** Branch protection and required status checks are disabled for `migrate-to-serverless`. The open PR #31 is draft and GitHub reports it as not mergeable. Do not merge it or modify `main` as part of this remediation.


## WebXPay environment isolation hardening (2026-11-18)

- **Finding:** The Worker checkout form previously embedded the WebXPay staging endpoint directly in source. This would have sent production checkouts to the staging gateway if the same code were promoted unchanged.
- **Change:** Checkout destination is now read from the required `WEBXPAY_CHECKOUT_URL` environment variable. The checkout builder rejects missing configuration and rejects non-HTTPS URLs, embedded credentials and URL fragments. The CSP `form-action` directive is generated from the configured checkout origin.
- **Staging configuration:** `wrangler.jsonc` explicitly sets `WEBXPAY_CHECKOUT_URL=https://stagingxpay.info/index.php?route=checkout/billing` only in the staging environment.
- **Regression coverage:** Updated the checkout form test to assert the configured staging action and CSP origin. Added tests proving missing and HTTP checkout endpoints fail closed.
- **Deployment evidence:** Worker workflow [44280928327](https://github.com/Univercitysingle/dating-app/actions/runs/44280928327) checked out source `a3b8493377b5ca0af4d067f5aab3acc8939e68de`; the Worker test step passed, the staging deployment completed, secret configuration passed, and runtime liveness/readiness, MongoDB, authentication, support, chat, route-inventory and admin authorization checks passed. The passive ZAP step was still running at the time of this entry. A subsequent workflow for configuration commit `d77f07d144429bce6a8f3d0819833540a84576d6` is queued to apply the explicit staging endpoint variable.
- **Production gate:** Production must set the merchant-confirmed live WebXPay checkout URL in the production Worker environment. Do not reuse the staging endpoint, guess a live endpoint, or deploy payment checkout to production until the merchant-provided endpoint and live credentials are verified with an approved test transaction.


## MongoDB database selection consistency (2026-11-18)

- **Finding:** The Worker staging workflow set `MONGODB_DATABASE=test` independently of the `MONGODB_URI` secret. `MongoDBConnection.getDatabase()` gives the explicit environment variable precedence over the database path encoded in the URI. This created two sources of truth and could silently direct requests to a different Atlas database than the URI intended.
- **Change:** Removed the hardcoded `MONGODB_DATABASE` workflow environment value and the corresponding Wrangler `--var` argument. The Worker now selects the database from the configured `MONGODB_URI` path. No URI or credential value was read, changed, or committed. `wrangler.jsonc` has no separate database override.
- **Workflow trigger:** Added `.github/workflows/deploy-worker-staging.yml` to its own path filters so future changes to the deployment workflow invoke the staging validation/deployment workflow.
- **Validation status:** Repository configuration was re-fetched and checked: no `MONGODB_DATABASE` references remain in the Worker staging workflow or Wrangler config, and the runbook no longer passes a separate database override. The deployment workflow update is committed on `migrate-to-serverless`; a successful post-change Worker workflow run and runtime readiness check are still required. Do not treat this configuration correction as deployed until the workflow reports the exact commit SHA and passes.
- **Scope:** Staging configuration only. No `main`, production, MongoDB secret, database contents, Firebase, payment credentials, or CDN Worker changes.


## Residual Vercel GitHub integration (2026-11-18)

- **Observation:** The legacy Vercel workflow file is absent from `migrate-to-serverless`, but GitHub commit status checks still publish a `Vercel` context with a Vercel project deployment URL on recent branch commits. The context is reported as failed. This does not establish a successful deployment, but it proves a Vercel integration/status publisher remains connected.
- **Risk:** A connected Vercel GitHub integration may create preview deployments independently of GitHub Actions workflow cleanup. This conflicts with the Cloudflare-only hosting requirement until disabled and verified.
- **Required action:** Disable Vercel automatic deployments for this repository and disconnect the GitHub repository integration in the Vercel project/account. Verify that a subsequent commit no longer receives a Vercel status or deployment. The available repository interface cannot perform this external account-level change, so this remains an operator action.
- **Scope:** No Vercel deployment was intentionally triggered by this remediation. No `main`, production, Cloudflare, or CDN configuration was changed by this observation.


## GPS and relationship-discovery consent follow-up (2026-11-18)

- **GPS consent timestamp:** Location refresh now preserves the original `locationSharing.consentAt`; `updatedAt` continues to record coordinate freshness. This prevents routine refreshes from rewriting the original opt-in time.
- **Frontend acceptance coverage:** Added a regression test requiring a stale location to be explicitly refreshed before nearby filters can be applied.
- **Relationship preference withdrawal:** Added a regression test confirming withdrawal unsets the complete sensitive `relationshipPreferences` document.
- **Source commit:** `1b1ba5d35b4b38b7584f3ed7ef8f110c4552691a`.
- **Worker test commit:** `f77305650f1d19414f5786fd2b62c7a26168b3ab`.
- **Frontend test commit:** `f0a19818f3739a91dca5427d69b204e91ac4f7dc`.
- **Evidence status:** Source and regression tests are committed on `migrate-to-serverless`. Automated execution and Cloudflare staging deployment for these exact revisions are not yet verified. Keep the items open until Worker/frontend suites pass and the deployed SHA is confirmed. No CDN Worker or production configuration was changed.


## Staging validation evidence (2026-11-18)

- **Worker staging deployment:** GitHub Actions run [44361703418](https://github.com/Univercitysingle/dating-app/actions/runs/44361703418) completed successfully for `f77305650f1d19414f5786fd2b62c7a26168b3ab`. This includes the Worker test suite and configured post-deploy liveness/readiness and anonymous-route checks.
- **Pages staging deployment:** GitHub Actions run [44361937990](https://github.com/Univercitysingle/dating-app/actions/runs/44361937990) checked out `f0a19818f3739a91dca5427d69b204e91ac4f7dc`. Backend regression tests, frontend regression tests, SEO validation, frontend build, Pages deployment, deployed SEO endpoint checks, and deployed frontend/API routing checks all completed successfully.
- **Pages run finalization:** At the time of this update, only the non-blocking OWASP ZAP passive baseline step remained in progress. The Pages deployment and application verification steps were already successful. Confirm the final run conclusion separately.
- **Scope:** Staging only. No changes to `main`, production, MongoDB data, Firebase chat, payment credentials, or CDN Worker.
- **Outstanding external integration:** The Vercel status context continues to fail on branch commits. The GitHub Actions workflow cleanup does not disconnect this repository's Vercel GitHub integration. Disconnect/disable it in the Vercel project/account and verify the Vercel status context stops appearing.


## Staging deployment evidence update (2026-11-19)

- **Worker deployment:** Run [44593922179](https://github.com/Univercitysingle/dating-app/actions/runs/44593922179) completed successfully on branch `migrate-to-serverless`, source SHA `8e1b975117ca37ffbfc4672240c231990fbad222`. The run included Worker regression tests, staging liveness/readiness checks, protected-route anonymous rejection checks, route inventory and OWASP ZAP passive baseline.
- **Pages deployment:** Run [44596670894](https://github.com/Univercitysingle/dating-app/actions/runs/44596670894) completed successfully on branch `migrate-to-serverless`, source SHA `e5a05beffba4c818197bf80472788178c9da36fc`. The run included dependency security checks, backend/frontend regression tests, build, Pages deployment, deployed endpoint checks and OWASP ZAP passive baseline.
- **Payment reconciliation:** The superadmin-only report is read-only and evaluates local MongoDB records. It does not query WebXPay, verify provider settlement, issue refunds or change entitlements. Merchant/provider reconciliation remains an external release gate.
- **Environment boundary:** These are staging deployments only. They do not establish production acceptance, Firebase RTDB rule deployment, real-device call acceptance, isolated restore evidence or 1,000-user capacity.

## RTDB chat membership provisioning gap (2026-11-20)

- **Finding:** The checked-in RTDB rules intentionally deny all client writes and permit reads under `chats/{roomId}` only when `chatParticipants/{roomId}/{auth.uid}` is exactly `true`. This is a fail-closed authorization design.
- **Confirmed integration gap:** The inspected legacy `services/firebaseRealtimeService.js` sync function writes message payloads to `chats/{roomId}/{messageId}`, but does not provision either participant under `chatParticipants`. The Cloudflare Worker source inspected for this review also does not implement RTDB participant provisioning. Consequently, the rules and message-sync path are not yet a complete working realtime-chat integration. Do not weaken the rules to make messages visible.
- **Required remediation:** Implement membership provisioning only in a trusted authenticated server path after verifying both users are authorized participants in the same active conversation. Derive participant UIDs from verified account/match records, not arbitrary client fields. Add membership revocation on block, unmatch, account deletion and conversation closure. Validate room-key and UID formats; preserve the existing deny-all client-write policy.
- **Required tests:** Firebase Emulator Rules Unit Testing with two distinct authenticated users, unauthenticated access, non-member reads, participant reads, client writes, forged membership writes, stale membership after block/unmatch, and notification recipient isolation. Test the trusted provisioning/revocation path independently.
- **Deployment gate:** The source rules file is not proof that these rules are deployed in the Firebase console. Verify the deployed rules and project IAM separately. Keep direct RTDB client sync disabled until the emulator tests and deployed negative tests pass.
- **Status:** Open. No source rule changes or Firebase console changes made in this review. This is a newly documented integration gap, not evidence of an active data disclosure.

## CVE-aligned dependency vulnerability management (2026-11-20)

- **Reference:** The [CVE Program](https://www.cve.org/CVERecord) provides public identifiers and records for disclosed vulnerabilities. CVE identifiers are correlation keys, not severity ratings or proof that a particular application is affected. Use the linked vendor/advisory references and affected-version ranges to establish applicability. Use CVSS from FIRST and enriched NVD data where available; keep CVE, GHSA, CVSS, exploitability, and fix availability as distinct evidence fields.
- **Implementation:** Added `.github/workflows/cve-dependency-audit.yml` on `migrate-to-serverless`. It checks out and verifies the exact triggering SHA, installs the root and Worker lockfiles, enforces the root production and Worker high/critical audit thresholds, applies the existing root full-tree audit exception policy, and uploads raw npm audit JSON reports for 30 days. The workflow runs on relevant dependency/security-file changes and manual dispatch from the migration branch. It does not deploy application code or modify production.
- **Evidence scope:** npm audit reports are dependency-advisory evidence (including CVE/GHSA identifiers when supplied by the registry). They do not replace source-code review, SAST, DAST, secret scanning, Firebase rules testing, or a VAPT assessment. A clean audit is not a security certification.
- **Commit:** `6e3e35afbf4d4ba233ba985f98d9ada7db8051fe`.
- **Status:** Workflow committed; first execution and artifact review are pending. Do not mark dependencies clear until the workflow passes and its artifact has been reviewed. Existing deployment audit gates remain in place.
- **Triage requirements:** For each finding record the identifier (CVE/GHSA), advisory URL, package and installed version, affected range, dependency path (production/development), CVSS vector/score and source, exploitability in this deployment, fixed version or absence of a fix, mitigation, owner, review date, and retest evidence. Never force a breaking upgrade or suppress an advisory without a documented, time-limited risk acceptance.


## CVE audit gate hardening (2026-11-20)

- **Finding:** The first version of the full npm audit policy validator did not explicitly reject registry error payloads or malformed reports. This could misclassify an unavailable advisory service as a clean result.
- **Change:** The validator now fails closed on npm registry/API error objects, missing vulnerability metadata, malformed vulnerability entries, malformed lockfile inventories and invalid severity counts. Unexpected high/critical findings are printed with package, severity and affected range before failing.
- **Regression coverage:** Added Node.js tests for a clean report, registry failure, missing metadata and unexpected high-severity findings. The CVE workflow executes these tests before dependency installation/auditing.
- **Commits:** `08f287b78aa9f5eb08979426d453861c9000c412` (validator), `e3f459f88910482b3f5dc374d0d343a04e0a1de4` (tests), `c590fba0246756baa3cdae424ec99b88b957a791` (workflow test step), `863696e95cceec15ab0a6e16df9eb4524f5920ee` (workflow formatting correction).
- **Evidence:** Initial dependency audit run [44683443746](https://github.com/Univercitysingle/dating-app/actions/runs/44683443746) succeeded before this hardening. The corrected workflow run [44696267084](https://github.com/Univercitysingle/dating-app/actions/runs/44696267084) was queued/in progress at the time of this update. Do not mark this control verified until that run completes successfully and its audit artifact is reviewed.
- **Scope:** This remains a dependency-advisory gate, not a full SAST, DAST, secret scan, Firebase rules test or penetration test.


## CVE audit execution and dependency findings (2026-11-20)

- **Verified run:** [44696267084](https://github.com/Univercitysingle/dating-app/actions/runs/44696267084) completed successfully on source SHA `863696e95cceec15ab0a6e16df9eb4524f5920ee`. The fail-closed policy regression tests, root production audit, root full audit, Worker audit and artifact upload all passed.
- **Root production dependency findings:** 6 moderate advisories, 0 high, 0 critical. Affected transitive packages: `gaxios`, `gcp-metadata`, `glob`, `google-gax`, `minimatch`, and `rimraf`. npm reports fixes available for these six production-tree findings. They remain open until the lockfile is updated and the audit is rerun.
- **Root development dependency findings:** 7 moderate findings total, including the production-tree findings and direct development dependency `depcheck`. The existing scoped high/critical exception remains restricted to the development-only `picomatch` advisory.
- **Cloudflare Worker dependencies:** 0 findings in this run.
- **Artifact:** `cve-dependency-audit-863696e95cceec15ab0a6e16df9eb4524f5920ee`, retained by GitHub Actions for 30 days. It contains root production, root full and Worker npm audit JSON reports.
- **Disposition:** Audit infrastructure and fail-closed policy are verified. Dependency remediation remains open. Do not interpret a successful high/critical-threshold workflow as zero vulnerabilities: moderate production advisories remain.


## Staging passive security scan evidence (2026-11-20)

- **Environment:** Cloudflare Pages staging, `https://dating-app-staging.pages.dev`.
- **Deployment:** [Pages workflow run 44696206021](https://github.com/Univercitysingle/dating-app/actions/runs/44696206021) completed successfully from source SHA `e3f459f88910482b3f5dc374d0d343a04e0a1de4`. Backend and frontend regression tests, SEO validation, build, deployment, deployed endpoint checks and ZAP passive baseline completed successfully.
- **ZAP evidence:** The passive baseline crawled 41 URLs and reported 61 PASS checks, 7 warning categories and 0 FAIL alerts. The scan artifact is `zap-pages-after-deploy` in that workflow run.
- **Warning categories requiring triage:**
  - Cache-control directives: re-check response headers by route. `public/_headers` already applies private/no-store to authenticated app/API routes and short public caching to public pages.
  - Cross-domain JavaScript inclusion: the current CSP explicitly allowlists Firebase/Google, Cloudflare Insights and jsDelivr. Confirm every observed script URL is required and trusted.
  - Non-storable content: expected for authenticated application routes carrying private/no-store cache policy; verify no personalized response is cached publicly.
  - Timestamp disclosure: inspect the referenced compiled bundle for sensitive build metadata; ordinary build timestamps are informational.
  - Modern Web Application: informational technology fingerprint, not by itself a vulnerability.
  - Missing Subresource Integrity: inventory external script references; add SRI only to stable, version-pinned resources where the integrity hash can be maintained safely.
  - Missing/invalid Cross-Origin-Embedder-Policy: deferred. Do not add `require-corp` or `credentialless` blindly because Firebase popup authentication, third-party identity scripts and WebRTC/media resources require compatibility validation.
- **Disposition:** No ZAP FAIL alerts were reported. These are passive-scan warnings, not confirmed exploitable findings. No header changes were made solely to silence the scanner. Authenticated DAST, API authorization tests and manual browser/call compatibility checks remain open.

## Dependency remediation automation (2026-11-20)

- **Finding:** The original six moderate production findings were caused by nested `rimraf`/ `glob`/ `minimatch` dependency versions. `npm audit fix --package-lock-only` did not remediate them because the required patched versions cross existing transitive semver ranges; the first automated remediation attempt correctly stopped without changing source.
- **Patch floors selected for validation:** `glob >=14.0.5`, `minimatch >=11.0.9`, and `rimraf >=6.1.4`. These versions are above the published patched floors for the two relevant glob/minimatch advisories. Cross-major overrides must be tested against all consuming packages before acceptance.
- **Change:** Added a migration-branch-only workflow that applies explicit overrides in root and backend manifests, regenerates lockfiles, requires zero moderate-or-higher production findings in both dependency trees, audits Worker dependencies, runs the regression suite, and opens a review PR rather than pushing dependency changes directly to the migration branch.
- **Audit validator:** Removed the obsolete picomatch-specific exception and lockfile assumption. The validator now checks npm report structure and blocks high/critical findings; moderate thresholds are enforced separately by each production audit step. Regression tests cover clean, malformed, registry-error, high-severity and moderate-only reports.
- **Commits:** `9d97d8737c6d862ab79bab46ecd037f52c67c319` (validator), `6809a66b27a45180f80d1fd691798bcabefd22f4` (tests), `f7f9e3e7135cbdab547316ff3f863d3858eae83e` (initial workflow), `eaadbaf4f2b27194d43bac9fabba97559579084f` (override and PR validation update).
- **Evidence status:** Initial semver-only remediation run [44701317976](https://github.com/Univercitysingle/dating-app/actions/runs/44701317976) failed at `npm audit fix` and produced no PR. The override-based validation run [44701433985](https://github.com/Univercitysingle/dating-app/actions/runs/44701433985) was still running when this tracker entry was written. Do not mark the dependency findings closed until the run and generated PR both pass review.


## Express middleware security remediation (2026-11-20)

- **Additional upstream finding:** The root and backend manifests still declared Multer 1.x and Morgan 1.10.x. The Express security team has published multiple multipart denial-of-service fixes, including CVE-2026-113872 fixed in Multer 2.5.0, a body-parser request-parsing fix (CVE-2026-111181) fixed in 1.20.9, and a Morgan log-forging fix (CVE-2026-15603) fixed in 1.12.0/1.12.1.
- **Remediation proposal:** Both root and backend manifests now declare Multer `^2.5.0` and Morgan `^1.12.1`, and override body-parser to `^1.20.9`. Both lockfiles are regenerated. The same manifests pin glob `^14.0.5`, minimatch `^11.0.9` and rimraf `^6.1.4`.
- **Compatibility check:** The photo upload route uses Multer memory storage, a synchronous MIME-type filter and the `single()` middleware API. The upgraded dependency was exercised by the full test suite.
- **Preparation evidence:** [Run 44702050464](https://github.com/Univercitysingle/dating-app/actions/runs/44702050464) passed frontend production audit, backend production audit, Worker audit and all 445 tests. The final automated PR-creation step was blocked by repository policy preventing the workflow token from creating PRs; the branch was pushed and PR #33 was created through the GitHub integration.
- **Review PR:** [PR #33](https://github.com/Univercitysingle/dating-app/pull/33), source branch `security/npm-audit-remediation-44702050464`. Its independent PR validation [run 44702221971](https://github.com/Univercitysingle/dating-app/actions/runs/44702221971) passed frontend/backend production audit thresholds, Worker audit and the regression suite. **Not merged yet.**
- **Backend lockfile verification:** Resolved versions are Multer 2.5.0, Morgan 1.12.1, body-parser 1.20.9, glob 14.0.6, minimatch 11.0.9 and rimraf 6.1.4.

## ZAP baseline gate enforcement (2026-11-20)

- **Prior state:** Pages and Worker ZAP steps used `continue-on-error: true` and `fail_action: false`, so passive-scan alerts could not block a deployment.
- **Change:** Both scans now use `fail_action: true`, no `continue-on-error`, and checked-in, scope-specific rules files. New/unlisted WARN and all FAIL alerts block the corresponding workflow. The previously reviewed known findings are listed as `IGNORE` with reasons and remain visible in the ZAP reports.
- **Pages accepted findings:** 10015 cache-control, 10017 cross-domain JavaScript, 10049 non-storable content, 10096 timestamp disclosure (provisional pending bundle review), 10109 modern web application fingerprint, 90003 missing SRI on SDK-managed dynamic scripts, and 90004 missing COEP (deferred pending Firebase popup/WebRTC compatibility tests).
- **Worker accepted finding:** 10049 for the API root and sitemap intentionally returning `Cache-Control: no-store`.
- **Rule parser detail:** The pinned ZAP GitHub Action only passes entries with level `IGNORE` into ZAP's `-c` rules file. An initial `INFO` configuration therefore did not load and the scan correctly failed on the seven warnings. Rules were corrected to `IGNORE`; the gate was not weakened with a blanket ignore-warnings option.
- **Supply-chain pin:** The ZAP baseline action is pinned to verified signed v0.15.0 commit `de8ad967d3548d44ef623df22cf95c3b0baf8b25`, rather than a mutable version tag.
- **Latest verification:** Pages deployment/scan run [44702584790](https://github.com/Univercitysingle/dating-app/actions/runs/44702584790) and Worker scan run [44702589304](https://github.com/Univercitysingle/dating-app/actions/runs/44702589304) were running when this entry was written. Do not mark the new ZAP gates verified until both complete successfully and the reports show the accepted rules as ignored with no unreviewed WARN/FAIL findings.
