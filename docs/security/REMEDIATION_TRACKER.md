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
| High | Email verification enforcement | Enforce verified-email policy server-side for password-authenticated accounts while preserving the registration profile-bootstrap endpoint, phone OTP accounts, trusted federated sign-in and super-admin access. Add negative tests for every protected route and positive tests for permitted onboarding flows. | Open, route-wide policy and tests required |\n| High | Authentication and authorization | Run two-user and admin/ordinary-user IDOR, role escalation, token expiry/revocation and resource ownership tests against staging. | Regression coverage exists; staging evidence pending |
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


## Email verification enforcement review (2026-11-18)

- **Finding:** Firebase ID tokens are cryptographically verified, but the Worker does not consistently enforce `email_verified` at the API boundary. `/api/auth/verify` reports the claim, while other protected handlers generally authenticate the token without applying a verified-email policy.
- **Observed frontend flow:** `src/pages/Login.js` blocks unverified email/password login in the browser, but the Google and phone OTP flows do not apply the same client-side check. `src/pages/Register.js` creates the Firebase account, writes the initial profile through `PUT /api/users/me`, sends the verification email, and signs out. Therefore, a blanket Worker-level rejection would break the existing registration bootstrap flow.
- **Required policy before implementation:** Enforce verification on normal application actions for password-provider accounts; retain a narrowly scoped exception for the initial profile bootstrap and verification-status route; do not reject phone-authenticated users merely because they have no verified email claim; verify the trusted federated-provider claim semantics; and preserve the dedicated super-admin custom-token flow. Avoid trusting client-supplied role or verification fields.
- **Required tests:** Unverified password token denied on discover, swipe, matches, chat, support, purchases and other normal application routes; unverified password token permitted only for the minimum profile bootstrap operations; verified password and federated users allowed; phone-authenticated users remain supported; super-admin remains limited to admin authorization; missing or malformed provider claims fail safely.
- **Evidence:** Worker source blob `7bd723fa2796adda3fb694ea26232fdcf662e8b8`; Firebase token verifier blob `281aa0522fd15beda6fc17c5f733b5d01744211e`; frontend Login blob `3075541a6f476c5ce91452ebcf2a51783280265b`; Register blob `5179f4216d139f995431789dfcba02354b476fad`.
- **Status:** Open. No policy change has been deployed. Implement only after route inventory and existing test coverage are mapped, then verify with staging negative and positive tests.
