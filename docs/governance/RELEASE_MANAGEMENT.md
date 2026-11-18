# Release Management

**Last reviewed:** 2026-11-11  
**Applies to:** Cloudflare Pages and Workers migration branch  
**Release branch:** `migrate-to-serverless`

## Branch and hosting policy

- Keep all migration and release-preparation commits on `migrate-to-serverless`.
- Do not modify `main` as part of this workflow.
- Cloudflare Pages hosts the frontend and Cloudflare Workers host the API.
- Do not introduce Vercel, legacy hosting targets or production DNS changes.
- Keep the existing CDN Worker and payment-provider configuration unchanged unless separately authorized.

## Release stages

1. **Change review:** inspect the complete diff, confirm scope, scan for secrets and verify no unrelated binary/generated files changed.
2. **Automated validation:** run frontend build/tests, Worker tests, dependency audit and relevant security regression tests.
3. **Staging deployment:** use the approved Cloudflare GitHub Actions workflows. Record branch, exact commit SHA, workflow URL and Cloudflare deployment identifier.
4. **Smoke and integration tests:** validate authentication, profile, discovery, matching, chat, media, calls, payments and admin permissions using dedicated staging identities.
5. **Acceptance:** record pass/fail evidence, known limitations, rollback point and operational owner.
6. **Production approval:** require separate explicit approval, provider/legal gates, tested rollback and a defined traffic/DNS plan. A staging success does not authorize production cutover.

## Current release status (2026-11-11)

Historical note: GitHub Actions quota was previously reported exhausted. Capacity was available for successful staging Pages run [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520) and Worker run [44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558), both for application source `f4fd891027c8b486f5f8609e9e7db1051988d56c`. These runs establish staging deployment only. Real authenticated user journeys, payment-provider acceptance, real-device WebRTC, load testing and production cutover remain separate gates.

## Rollback

- Stop rollout and preserve sanitized correlation IDs and deployment metadata.
- Re-deploy the last known-good staging SHA using the approved Cloudflare workflow.
- Do not reverse destructive database changes without a tested recovery plan.
- Disable safe feature flags where available.
- Re-run critical smoke tests and verify frontend/API compatibility.
- Document incident impact, rollback SHA, data integrity and follow-up actions.

## Required release record

Record release version, branch, commit SHA, frontend and Worker workflow URLs, Cloudflare deployment IDs, test environment, test accounts/roles, acceptance results, unresolved risks, rollback SHA, approver and release timestamp.

## Status vocabulary

- **Implemented:** source code exists.
- **Automated-tested:** relevant automated tests passed at a recorded SHA.
- **Staging-verified:** end-to-end staging evidence exists.
- **Production-verified:** production behaviour has been explicitly validated.
- **Blocked:** an external dependency, missing evidence or release gate prevents acceptance.

Never use “complete” without stating which evidence level was reached.


## Verification and governance gaps (2026-11-11)

This document is not evidence of legal approval, provider certification, production deployment, or operational acceptance. Record the responsible owner, implementation state, test evidence, staging evidence, last verified commit, data classification, retention rule, dependency, and release approval for each requirement.

Explicitly track applicable gaps: payment/provider callback replay and reconciliation, refunds, duplicate settlement and stale pending recovery; verification evidence access controls, encryption, review audit and deletion/retention; user-data export and deletion propagation across MongoDB, Firebase, media storage and backups; documented backup/restore exercises and approved RPO/RTO; moderator access and ticket/chat message edit/delete policy with immutable audit history; notification opt-in/revocation and delivery failures; accessibility, supported browsers/devices, PWA/offline behaviour, localization, timezone and RTL. Do not mark an item complete without reproducible evidence and an assigned approver.


## Current release evidence (2026-11-18)

- Staging Pages: [workflow 44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520), successful.
- Staging Worker: [workflow 44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558), successful.
- Application source SHA: `f4fd891027c8b486f5f8609e9e7db1051988d56c`.
- Both workflows passed their configured automated checks and passive OWASP ZAP scans. The scans reported warnings, not new FAIL findings. Dependency audit retains six moderate `glob`/`minimatch` findings in each root/backend audit and the documented development-only `picomatch` exception.
- No production deployment was performed. The Pages workflow only deploys to `dating-app-staging`; the Wrangler configuration has no production environment and the branch contains no production deployment workflow. Production release therefore requires a separately configured target, secrets/bindings, rollback plan, approval and full acceptance evidence.
