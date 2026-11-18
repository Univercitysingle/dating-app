# Security Remediation Tracker

**Last reviewed:** 2026-11-11  
**Branch:** `migrate-to-serverless`  
**Status:** Working remediation register. This is not a fresh penetration test or security certification.

## How to use this tracker

Track each finding from reproducible evidence through a code/configuration fix, regression test, staging verification and independent closure. A commit or passing unit test alone does not close a finding. Record the affected source SHA, environment, test identity/role, evidence location, owner and closure date. Do not place secrets, tokens, private message content or verification evidence in this file.

## Open evidence and remediation items

| Priority | Area | Required action and closure evidence | Status |
|---|---|---|---|
| Critical gate | Firebase Realtime Database | Verify deployed RTDB rules and project IAM. Test unauthenticated access, non-member reads/writes, blocked/unmatched users, stale membership and cross-user notification access. Keep direct browser realtime sync disabled until negative tests pass. | Open, external console evidence required |
| High | Authentication and authorization | Run two-user and admin/ordinary-user IDOR, role escalation, token expiry/revocation and resource ownership tests against staging. | Regression coverage exists; staging evidence pending |
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
