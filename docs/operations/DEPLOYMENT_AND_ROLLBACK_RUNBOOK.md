# Deployment and Rollback Runbook
Last reviewed: 2026-11-18. This applies to migration-branch staging, not production cutover.

Pre-deploy: confirm `migrate-to-serverless`; review the exact diff; preserve secrets and the existing CDN Worker; run frontend, backend, and Worker tests; verify bindings without printing values; confirm MongoDB readiness and migration compatibility.

**Current release path:** The approved GitHub Actions workflows are available and have successfully deployed the latest application source to the dedicated Cloudflare staging Worker and Pages project on 2026-11-18. Use those staging workflows as the primary release path. The direct Wrangler procedure below is a documented fallback only. Do not push deployment-triggering changes to `main`.

## GitHub Actions deployment status

GitHub Actions quota exhaustion was reported on 2026-11-11 and is retained here as historical context. The latest verified paired staging deployments completed successfully on 2026-11-18. Do not infer that a later branch head is deployed merely because an earlier workflow passed. Keep changes on `migrate-to-serverless`, record the exact source SHA, and verify the actual deployment revision before acceptance. Do not modify `main` or bypass the Cloudflare-only deployment boundary.

The latest paired successful staging deployments are Pages run [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520) and Worker run [44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558), both for application source `f4fd891027c8b486f5f8609e9e7db1051988d56c`. Their automated checks are recorded in `docs/security/REMEDIATION_TRACKER.md`. Real authenticated user journeys, payment-provider settlement, real-device WebRTC and load acceptance remain outstanding.

Use the approved GitHub Actions workflows for staging deployment. The direct Cloudflare procedure below is fallback-only and must be used only from an authenticated local checkout with the exact intended branch and SHA. Verify the deployed source SHA and run frontend/build, API smoke, and two-device audio/video acceptance. Validate adaptive video quality under constrained networks, audio continuity, TURN relay selection, and measured bytes sent/received.

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
- Prepare the full Worker secret inventory listed below. A direct Wrangler deployment does not automatically import GitHub Actions secrets. Verify required secrets are already configured in the staging Worker or set them interactively from a secure local shell before deployment. Never paste secret values into chat, terminal transcripts, or source control.
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

The command deploys the Worker code/config only. It does not provision secrets. **Release blocker:** earlier repository context recorded two different Firebase project IDs (`it-services-1841` and `it-services-1841e`). The Worker deployment workflow has now been changed to read `FIREBASE_PROJECT_ID` from the `FIREBASE_PROJECT_ID` GitHub secret, falling back to `REACT_APP_FIREBASE_PROJECT_ID`; it no longer hardcodes either ID. For direct deployment, confirm the canonical project ID in Firebase Console and compare it with the frontend `REACT_APP_FIREBASE_PROJECT_ID`, Firebase Auth tenant, and Realtime Database URL. Export the confirmed value as `FIREBASE_PROJECT_ID` in the local shell, use it for the Worker `--var`, and use the identical value for the Pages build. Abort if they do not match. Do not modify the existing production Firebase project or migrate user data as part of this check.

#### Worker secrets and bindings

The Worker staging workflow currently requires these values to be present in its deployment environment: `MONGODB_URI`, `VERIFICATION_ENCRYPTION_KEY` (64 hexadecimal characters), `JWT_SECRET` (at least 32 characters and matching the existing CDN Worker's JWT secret), `WEBXPAY_PUBLIC_KEY`, `WEBXPAY_SECRET_KEY`, and `TURNIX_API_TOKEN`. `WEBXPAY_CHECKOUT_URL` is a non-secret HTTPS environment variable, explicitly set in `wrangler.jsonc` for staging. Production must use the merchant-confirmed live checkout endpoint, and the Worker rejects the staging hostname outside `MIGRATION_STAGE=staging`. Preserve the existing WebXPay configuration. ExpressTURN primary credentials are optional as a pair: `EXPRESSTURN_USERNAME` and `EXPRESSTURN_PASSWORD`. The workflow also supports optional push secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`; optional Firebase RTDB/service-account secrets; optional `TURN_URLS` plus `TURN_SHARED_SECRET`; and optional `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD_HASH`, and `CRON_SECRET`.

Set any missing secret from a secure local shell, for example:

```bash
printf '%s' "$MONGODB_URI" | npx wrangler@4 secret put MONGODB_URI --config wrangler.jsonc --env staging
```

The shell variable must be populated from the approved secret manager or local secure environment, not from a value pasted into chat. Repeat only for secrets that are genuinely missing. Do not print secret values or overwrite known-good credentials. Confirm the existing `CDN_PROXY`, `MONGODB_CONNECTION`, and `RATE_LIMITER` bindings and Durable Object migrations in the Cloudflare dashboard. Never change the CDN Worker as part of this deployment.

### Pages deployment

The Pages workflow injects Firebase configuration as build-time environment variables. A direct build must load the same values from the approved local secret manager before running the build. Do not use placeholders or commit a local `.env` file.

Required build variables:
- `REACT_APP_CDN_HOSTNAME`
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`

Optional when configured for this Firebase project: `REACT_APP_FIREBASE_DATABASE_URL` and `REACT_APP_FIREBASE_STORAGE_BUCKET`. Keep `REACT_APP_ENABLE_SOCKET=false` for the serverless staging build. `API_ORIGIN` is the Pages API proxy secret, not a substitute for the Firebase build variables.

```bash
# Export the values above from the approved local secret manager.
export API_ORIGIN="https://dating-app-api-staging.enadoctemp.workers.dev"
# Set FIREBASE_PROJECT_ID only after verifying the canonical project in Firebase Console.
export REACT_APP_FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID"
export REACT_APP_ENABLE_SOCKET="false"
npm run build
printf '%s' "$API_ORIGIN" | npx wrangler@4 pages secret put API_ORIGIN --project-name dating-app-staging
npx wrangler@4 pages deploy build \
  --project-name dating-app-staging \
  --branch migrate-to-serverless
```

Stop if any required Firebase build variable is unavailable. The deployed frontend may otherwise build but fail to initialize Firebase authentication.
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


## Direct deployment acceptance record

For each manual deployment, append an entry to the release record containing: source Git SHA, operator, Cloudflare account/project names (never account tokens), Worker deployment ID and timestamp, Pages deployment ID and timestamp, health/readiness HTTP results, smoke-test outcomes, and rollback reference. Mark a step **not run** when no evidence exists. Do not infer deployment success from a Git commit or a successful build alone.


## Latest staging release evidence (2026-11-18)

- Pages workflow [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520): successful, source `f4fd891027c8b486f5f8609e9e7db1051988d56c`.
- Worker workflow [44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558): successful, same source revision.
- Automated tests, build, deployment and post-deployment checks passed as described in the remediation tracker. Passive ZAP produced warnings but no new FAIL findings.
- Production remains out of scope for these staging workflows. No production Pages project/domain, production Worker environment, production secret inventory or production rollback evidence is established by these runs.


## Deployment source integrity (2026-11-18)

Both Cloudflare staging workflows now check out `${{ github.sha }}` rather than resolving the mutable branch name at job execution time. Each workflow verifies `git rev-parse HEAD` equals `GITHUB_SHA` before dependency installation or deployment. A mismatch stops the release. This prevents a queued deployment from silently deploying a later branch head than the commit that triggered and was reviewed for that workflow run.


## Branch and deployment alignment review (2026-11-18)

- Current PR #31 head at review: `75ad9be983bc65c7dbf424e02835dac3df2178fe` on `migrate-to-serverless`. PR #31 remains open and draft, targets `main`, and GitHub reports `mergeable: false`. Do not merge it or modify `main` as part of staging work.
- Latest paired successful staging evidence currently recorded: Pages run [44266691520](https://github.com/Univercitysingle/dating-app/actions/runs/44266691520) and Worker run [44266691558](https://github.com/Univercitysingle/dating-app/actions/runs/44266691558), both deploying application source `f4fd891027c8b486f5f8609e9e7db1051988d56c`. This is not the current PR head. Treat the newer branch head as not yet deployment-verified until a successful deployment records its exact SHA.
- Confirmed current Cloudflare staging workflow files: `.github/workflows/deploy-cloudflare-pages.yml` and `.github/workflows/deploy-worker-staging.yml`. Both are scoped to `migrate-to-serverless`. Legacy Cloud Run, Vercel and Hugging Face workflow files checked during this review were absent from the branch.
- `wrangler.jsonc` defines the staging environment only. No production Worker environment is configured in that file. Keep production cutover blocked pending the production Pages project/domain, Worker hostname, production secrets and bindings, MongoDB/Firebase configuration, payment-provider live endpoint and credentials, rollback/recovery evidence, and explicit release approval.
