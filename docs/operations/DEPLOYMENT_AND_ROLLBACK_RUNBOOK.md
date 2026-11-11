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
