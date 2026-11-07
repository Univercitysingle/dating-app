# Deployment and Rollback Runbook
Last reviewed: 2026-11-07. This applies to migration-branch staging, not production cutover.

Pre-deploy: confirm migrate-to-serverless branch; review diff; no secrets/CDN Worker changes; run Worker/frontend/security tests; verify bindings without printing values; confirm Mongo readiness and database migration compatibility.

Deploy through repository GitHub Actions Cloudflare Worker and Pages workflows. Inspect exact commit SHA and job results.

Post-deploy: check Worker liveness/readiness, route smoke tests, actual Pages deployment URL, login, authenticated API, media, Firebase chat and admin journeys. Confirm frontend and Worker SHAs are compatible.

Rollback: stop rollout; preserve correlation IDs; revert/redeploy last known-good staging commit through approved workflow; do not reverse destructive DB migration without recovery plan; disable safe feature flags; verify health and critical journeys; document incident.

Production cutover requires separate approval, traffic/DNS strategy, observation window and tested rollback.
