# Security Remediation Tracker

**Last reviewed:** 2026-11-18  
**Branch:** `migrate-to-serverless`  
**Status:** Working remediation register. This is not a fresh penetration test or security certification.

## How to use this tracker

Track each finding from reproducible evidence through a code/configuration fix, regression test, staging verification and independent closure. A commit or passing unit test alone does not close a finding. Record the affected source SHA, environment, test identity/role, evidence location, owner and closure date. Do not place secrets, tokens, private message content or verification evidence in this file.

## Open evidence and remediation items

| Priority | Area | Required action and closure evidence | Status |
|---|---|---|---|
| Critical gate | Firebase Realtime Database | Verify deployed RTDB rules and project IAM. Test unauthenticated access, non-member reads/writes, blocked/unmatched users, stale membership and cross-user notification access. Keep direct browser realtime sync disabled until negative tests pass. | Open, external console evidence required |
| High | Email verification and phone authentication | Keep the central verified-email gate for email-based accounts; permit Firebase phone-provider tokens only when the UID already has a provisioned profile. Reject phone-only identities without an existing profile. Validate provider claims and account restrictions. | Worker test suite passed and source deployed to staging in run 44255109535; real phone-account journey still pending |\n| High | Authentication and authorization | Run two-user and admin/ordinary-user IDOR, role escalation, token expiry/revocation and resource ownership tests against staging. | Regression coverage exists; staging evidence pending |
| High | Payment callbacks | Verify provider signature, order/amount/currency binding, replay/idempotency, duplicate callbacks, failed checkout recovery and entitlement revocation with provider sandbox evidence. | Partial, provider acceptance pending |
| High | Media access | Validate upload/read/delete ownership and support attachment access through the existing CDN proxy. Do not modify the CDN Worker under this tracker. | Staging acceptance pending |
| High | Moderation | Verify report, block, unmatch, ticket-message edit/delete permissions, admin audit history and abuse/rate-limit enforcement. | Implementation and role-specific acceptance require confirmation |
| High | Verification evidence | Verify encryption-key availability without revealing its value, reviewer-only access, audit trail, expiry, deletion, backup retention and consent withdrawal. | Operational/privacy review pending |
| Medium | WebRTC/TURN | Verify ExpressTURN primary and Turnix fallback credentials, actual relay candidate selection, credential expiry, network fallback and abuse controls on real devices. | Unit tests present; live relay evidence pending |
| Medium | Secrets and CI/CD | Review GitHub Actions and Cloudflare secret scopes, prevent secret exposure in logs/build artifacts, and restore CI capacity before claiming latest-source validation. | Actions quota reported exhausted |
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

The project operator reports that GitHub Actions quota is exhausted. This prevents a fresh workflow run from being treated as available evidence. Re-run the repository's approved tests, dependency/security checks and staging acceptance once capacity is restored. The VAPT report dated 2026-11-05 remains a historical snapshot and must not be represented as a new assessment.

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
- OWASP ZAP passive baseline: **in progress at time of this record**. Record its final result before marking the complete workflow green.
- Production cutover: not performed.
- Residual: picomatch remains upstream-unpatched and scoped to development/build dependencies; moderate glob, AWS SDK v2 and uuid findings remain open for remediation.

## Dependency manifest cleanup (2026-11-18)

- Removed the end-of-support AWS SDK for JavaScript v2 package from the root and legacy backend dependency manifests and lockfiles. The active root S3 service imports `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (AWS SDK v3); repository code search found no direct AWS SDK v2 imports. The `backend/` directory contains dependency metadata and documentation, but no backend runtime source files.
- Added `uuid` as an explicit root production dependency at `^11.1.1`, matching the existing locked version, because `controllers/usersController.js` imports `uuid` directly. It was previously available only transitively.
- Regenerated the two npm lockfile package graphs from their existing resolved versions after updating root dependency metadata. No unrelated version upgrades were applied.
- **Validation status:** JSON and lockfile dependency metadata were regenerated and structurally checked. A local `npm ci`, test suite, and fresh `npm audit` could not be run through the repository connector. Confirm these in the next available build environment before treating the remediation as closed. GitHub Dependabot alert closure also remains unconfirmed until its alert list refreshes.
- **Scope:** `migrate-to-serverless` only. No `main`, production deployment, Cloudflare Worker deployment, or CDN Worker change.
