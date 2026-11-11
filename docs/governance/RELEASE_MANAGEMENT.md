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

GitHub Actions quota is reported exhausted. No fresh workflow run or deployment should be assumed from a source commit alone. The latest call-quality source revision recorded in the project documentation is `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`; its latest deployment and real-device acceptance are not confirmed. Restore Actions capacity or obtain explicit approval for a documented alternative validation path before release.

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
