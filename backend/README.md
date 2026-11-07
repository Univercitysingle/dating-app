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
