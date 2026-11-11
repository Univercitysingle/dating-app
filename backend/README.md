---
title: Dating App Legacy Backend
sdk: docker
app_port: 7860
---

# Legacy backend

This directory belongs to the legacy Node/Express deployment lineage. The active migration target is Cloudflare Pages and Workers on the migrate-to-serverless branch.

## Migration status
- MongoDB Atlas remains the primary application database.
- Firebase Authentication and the existing Firebase Realtime Database chat integration are retained.
- New serverless API work belongs in the repository's Worker implementation and must preserve required client API contracts.
- Do not assume this Docker metadata means the legacy backend is the active staging API.
- Do not remove or reuse legacy services until route parity, scheduled-job replacement, data integrity, rollback and dependency checks are complete.

## Safe maintenance
Use this backend as a migration reference and for explicitly approved compatibility/testing tasks. Review legacy dependencies and static-analysis findings before any reuse. Never commit secrets or production data.

See the root README, MIGRATION_PLAN.md and docs/architecture/SYSTEM_ARCHITECTURE.md for current direction.


## Current status (2026-11-11)

This directory is legacy reference code, not the active Cloudflare staging API. GitHub Actions quota exhaustion currently prevents a fresh CI/deployment confirmation of the latest application source. Do not deploy this Docker/Hugging Face lineage, revive legacy hosts, or treat its environment metadata as current configuration. Cloudflare Pages/Workers on `migrate-to-serverless` remain the only approved hosting direction. Keep Firebase chat and the existing CDN integration unchanged unless separately authorized.


## Documentation completeness and evidence controls (2026-11-11)

This document must distinguish source implementation, automated test coverage, staging deployment, live-provider validation, and production acceptance. For every requirement, record an owner, status, evidence link or test identifier, last verified commit, dependencies, rollback impact, and next action. Never mark an item complete solely because it appears in source or a unit test. Reconcile this document against the live route registrations, Worker configuration, database schema/indexes, frontend call sites, and deployment workflow before release.

Open cross-document gaps to close and track: (1) full API route/method/authentication/authorization/request/response/error contract; (2) MongoDB collection schemas, indexes, uniqueness, TTL and migration/rollback rules; (3) Firebase RTDB path/rule matrix and push notification subscription/delivery/retry lifecycle; (4) MongoDB backup/restore and Firebase recovery drills with approved RPO/RTO; (5) payment callback replay, reconciliation, refunds, stale-pending recovery and duplicate settlement evidence; (6) moderation case lifecycle, user/admin message edit/delete permissions and immutable audit events; (7) account export/deletion propagation and backup retention; (8) supported browser/device, PWA/offline and notification-permission matrix; (9) keyboard, screen-reader, contrast and form-accessibility checks; (10) localization, timezone and RTL readiness. These are tracked requirements, not claims that the features are implemented.
