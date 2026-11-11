# Deployment and Rollback Runbook
Last reviewed: 2026-11-11. This applies to migration-branch staging, not production cutover.

Pre-deploy: confirm migrate-to-serverless branch; review diff; no secrets/CDN Worker changes; run Worker/frontend/security tests; verify bindings without printing values; confirm Mongo readiness and database migration compatibility.

Deploy through repository GitHub Actions Cloudflare Worker and Pages workflows. Inspect exact commit SHA and job results.

## GitHub Actions quota exhausted

The project operator reported exhausted GitHub Actions quota on 2026-11-11. When quota is exhausted, do not repeatedly dispatch workflows or describe a commit as deployed. Keep changes on `migrate-to-serverless`, document the exact source SHA, and mark deployment/acceptance as blocked or pending. Do not modify `main` or bypass the Cloudflare-only deployment boundary.

For the call-quality revision `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`, the Cloudflare Pages workflow did not succeed and its step logs were unavailable during the documentation update. The revision is committed, but staging deployment is unverified.

After Actions quota is restored, rerun the existing Cloudflare Pages workflow for the branch and verify the exact SHA. Then run frontend build/tests, staging smoke checks, and two-device audio/video acceptance. Validate adaptive video quality under constrained networks, audio continuity, TURN relay selection and measured bytes sent/received. A manual deployment path should only be used if separately approved and documented, with the same secret-handling and post-deployment checks.

Post-deploy: check Worker liveness/readiness, route smoke tests, actual Pages deployment URL, login, authenticated API, media, Firebase chat and admin journeys. Confirm frontend and Worker SHAs are compatible.

Rollback: stop rollout; preserve correlation IDs; revert/redeploy last known-good staging commit through approved workflow; do not reverse destructive DB migration without recovery plan; disable safe feature flags; verify health and critical journeys; document incident.

Production cutover requires separate approval, traffic/DNS strategy, observation window and tested rollback.


## Operational evidence gaps and controls (2026-11-11)

For each control or procedure, identify the owner, prerequisites, exact command or dashboard path where safe, expected result, failure handling, evidence location, last verified commit, and review cadence. Never document a procedure as proven until it has been exercised in the intended environment. Keep production and staging instructions distinct.

Required evidence areas to maintain: route-level API authorization and error-contract tests; MongoDB schema/index/TTL and migration/rollback checks; Firebase RTDB rule tests and push notification lifecycle; MongoDB backup/restore and Firebase recovery exercises with approved RPO/RTO; payment callback replay/idempotency/reconciliation/refund and stale-checkout tests; moderation and support-ticket message permissions with immutable audit history; account export/deletion and backup retention; browser/device/PWA/offline and notification-permission matrix; keyboard, screen-reader, contrast and form accessibility; localization, timezone and RTL checks. Capacity targets, service objectives and recovery objectives remain proposed until measured and approved.


## Direct Cloudflare staging deployment without GitHub Actions

This procedure is for an operator with an authenticated Cloudflare account and the repository checked out locally. It does not invoke GitHub Actions. Run only from the `migrate-to-serverless` branch and record the exact Git commit SHA before deploying. Never paste API tokens, MongoDB URIs, JWT secrets, payment keys, TURN credentials, Firebase service-account JSON, or verification keys into chat or commit them.

### Preconditions

- Confirm `git branch --show-current` returns `migrate-to-serverless` and `git status --short` is clean.
- Confirm the Cloudflare account selected by Wrangler is the account that owns the dedicated `dating-app-staging` Pages project and `dating-app-api-staging` Worker.
- Authenticate locally with `npx wrangler@4 login` or use a least-privilege API token in the local shell. Do not print token values.
- Confirm the staging Worker already has all required secrets configured. The manual deployment commands below deliberately do not replace or print Worker secrets.
- Confirm the existing `CDN_PROXY` service binding and Durable Object bindings/migrations are present in the staging environment. Do not modify the CDN Worker.

### Worker deployment

```bash
git switch migrate-to-serverless
git status --short
git rev-parse HEAD
npm ci --no-audit --no-fund
cd workers && npm ci --no-audit --no-fund && npm test
cd ..
npx wrangler@4 deploy --config wrangler.jsonc --env staging \
  --var "FIREBASE_PROJECT_ID:it-services-1841e" \
  --var "MONGODB_DATABASE:test" \
  --var "CDN_HOSTNAME:https://dateme.enadoctemp.workers.dev" \
  --var "FRONTEND_URL:https://dating-app-staging.pages.dev"
```

The command deploys the Worker code/config only. It does not provision secrets. If required secrets are missing, stop and configure them locally through Wrangler using the secret names in the Worker deployment workflow. Do not overwrite existing secrets with blank values. Never run `wrangler secret list` output into a public log.

### Pages deployment

```bash
npm run build
npx wrangler@4 pages deploy build \
  --project-name dating-app-staging \
  --branch migrate-to-serverless
```

The Pages project must already have its `API_ORIGIN` secret set to `https://dating-app-api-staging.enadoctemp.workers.dev`. If it is absent, set it locally with `printf '%s' 'https://dating-app-api-staging.enadoctemp.workers.dev' | npx wrangler@4 pages secret put API_ORIGIN --project-name dating-app-staging`.

### Post-deployment verification

```bash
curl --fail --silent --show-error https://dating-app-api-staging.enadoctemp.workers.dev/health
curl --fail --silent --show-error https://dating-app-api-staging.enadoctemp.workers.dev/ready
curl --fail --silent --show-error https://dating-app-api-staging.enadoctemp.workers.dev/api/status
curl --fail --silent --show-error https://dating-app-staging.pages.dev/manifest.json
```

Then verify anonymous protected routes return 401, sign-in and authenticated profile/discovery journeys, chat history/send, support ticket access, media upload/retrieval through the unchanged CDN, push subscription lifecycle, and two-device audio/video calls including TURN relay selection. Check the deployed Worker and Pages deployment details in Cloudflare and record their deployment IDs, timestamps, and source SHA. A successful upload command alone is not acceptance.

### Safety gate

The staging Wrangler configuration explicitly keeps Dark Fantasy disabled. Do not enable it or use a wildcard country allowlist until region gating is consistent across all handlers, legal/age-assurance/payment/moderation approvals are recorded, and negative access tests pass. The direct deployment path does not bypass these release gates.
