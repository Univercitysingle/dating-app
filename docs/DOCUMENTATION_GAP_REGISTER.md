# Documentation completeness register

**Review date:** 2026-11-11  
**Branch:** `migrate-to-serverless`  
**Scope:** Markdown documentation and the tracked Word document.  
**Status key:** Updated = scope and controls documented; Evidence pending = runtime proof or source inventory still required; Not updated = binary artifact not safely editable through the available UTF-8 GitHub file operation.

## Scope completed in this pass

All 33 Markdown documents present in the branch tree at the start of the first pass were updated with document-specific traceability, evidence, ownership, acceptance or governance controls. Seven new Markdown documents have since been added:
- `docs/operations/DISASTER_RECOVERY_AND_BACKUP.md`
- `docs/features/PUSH_NOTIFICATIONS_SPEC.md`
- `docs/operations/ACCESSIBILITY_BROWSER_LOCALIZATION.md`
- `docs/governance/DATA_SUBJECT_REQUESTS.md`

The existing CDN Worker and WebXPay/payment implementation were not modified. All edits were committed to `migrate-to-serverless`; `main` was not targeted. The current branch tree contains 40 Markdown documents.

## Gap register

| Area | Documentation status | Remaining evidence/action |
|---|---|---|
| API route contract | Updated; evidence pending | Extract exact Worker route registrations and publish method, auth, role, input, output, pagination and error schemas. |
| MongoDB schema/indexes | Updated; evidence pending | Inventory actual collections, validators, indexes, unique constraints, TTL and migration/rollback behaviour from deployed database/source. |
| Firebase chat security | Updated; evidence pending | Verify deployed RTDB rules with cross-user negative tests and real Firebase tokens. |
| Push notifications | New specification | Verify actual service worker, endpoint, VAPID/provider, persistence, retries, revocation and multi-device delivery. |
| Disaster recovery | New specification | Confirm Atlas backups, Firebase recovery, restore drills, backup retention and approved RPO/RTO. |
| Payment operations | Updated; evidence pending | Run sandbox success/failure/replay/duplicate callback, reconciliation, refund and stale-pending recovery tests. Do not change IPG/WebXPay implementation in this docs pass. |
| Moderation/admin | Updated; evidence pending | Verify user/admin ticket and chat message edit/delete permissions, case lifecycle and immutable audit trail. |
| Privacy requests | New specification | Build field-level data inventory and test export/deletion across MongoDB, Firebase, media, subscriptions, logs and backups. |
| Browser/PWA | New specification | Execute supported browser/device matrix, service-worker lifecycle, offline and push permission tests. |
| Accessibility | New specification | Perform automated and manual keyboard/screen-reader/contrast/form review against WCAG 2.2 AA baseline. |
| Localization/RTL | New specification | Confirm supported locales, UTC storage, locale rendering and RTL layout. |
| Performance | Updated; evidence pending | Run repeatable load tests. 1,000 concurrent users remains a target, not a proven capacity figure. |
| WebRTC/TURN | Existing docs updated; evidence pending | Verify ExpressTURN primary and Turnix fallback secrets/configuration, relay allocation and two-device restrictive-network calls. |
| Release/deployment | Direct Cloudflare path documented; deployment not executed | GitHub Actions is intentionally skipped. Deploy from an authenticated local Wrangler session, then capture exact Pages/Worker deployment SHAs and smoke-test evidence. Confirm one canonical Firebase project ID is used by both Worker and Pages. |
| Word document | Not updated | `dating-app.docx` is binary. It was not rewritten as UTF-8 or replaced with a generated file because the available GitHub file operation accepts UTF-8 text only. A safe binary-preserving workflow is required. |

## Status and safety rules

- A documentation update does not mean the corresponding feature exists.
- A source implementation does not mean a feature is tested.
- A passing unit test does not prove provider integration.
- A successful staging deployment does not prove production readiness.
- Do not mark a gap closed without reproducible evidence, reviewer and exact revision.
- Keep all migration changes on `migrate-to-serverless`; never modify `main`.
- Keep Cloudflare as the hosting platform. Keep MongoDB Atlas as primary, Firebase Authentication/RTDB integration retained, and existing CDN Worker unchanged.
- Redis is not a confirmed deployed dependency. Do not state otherwise.
- Do not put secrets, credentials, raw payment data, or verification evidence in documentation.

## Next review

After API/schema/source inventory and staging access are available, replace the evidence-pending items with source-backed route and collection inventories, then run the relevant acceptance tests. Revisit the Word document with a binary-safe DOCX editing and upload method.


## Source inventory progress (2026-11-11)

Two source-backed catalogues have now been added:
- [Active Worker API catalogue](./architecture/WORKER_API_CATALOG.md), based on `workers/index.js` source blob `f11fd484cf79dc56cb09474254640e9d635cfa54`.
- [Active Worker database catalogue](./architecture/WORKER_DATABASE_CATALOG.md), based on `workers/mongodb-connection.js` source blob `641b7851e107be99d3f55fbfabcf34595b40e888`.

This closes the first static source-inventory pass, not the live verification gaps. The API catalogue still needs request/response schemas and contract tests. The database catalogue still needs a live Atlas collection/index export and deployed database-name confirmation.

Additional source findings to track:
- Worker source still exposes admin purchase approve/reject/record-refund routes. Reconcile with the intended gateway-authoritative payment workflow before exposing manual approval.
- `/api/calls/*` is excluded from the generic Worker IP rate limiter. Verify dedicated call abuse controls.
- Wrangler staging sets Dark Fantasy enabled with wildcard country configuration. Some route handlers accept wildcard globally, while the catalogue handler rejects it. Treat this as a configuration/security inconsistency and keep the feature gated until corrected.
- Mongoose model schemas are legacy definitions and are not automatically enforced by direct MongoDB Worker writes.



## API and database source inventory follow-up

The active Worker API and database catalogues are now documented in `docs/architecture/WORKER_API_CATALOG.md` and `docs/architecture/WORKER_DATABASE_CATALOG.md`. They were generated from source files at blobs `f11fd484cf79dc56cb09474254640e9d635cfa54` and `641b7851e107be99d3d55fbfabcf34595b40e888`, respectively. Their source-backed static inventory is complete for this review pass. Live deployment parity, OpenAPI request/response schemas, Atlas index export, and staging integration evidence remain open.


## Direct Cloudflare deployment follow-up (2026-11-11)

GitHub Actions deployment is intentionally bypassed while the quota is exhausted. The Worker staging workflow no longer hardcodes a Firebase project ID; it reads `FIREBASE_PROJECT_ID` from the matching GitHub secret, with `REACT_APP_FIREBASE_PROJECT_ID` as a fallback. The manual deployment runbook requires the operator to verify the canonical Firebase project in Firebase Console and use the same ID for Worker and Pages. No Cloudflare deployment has been performed or verified from this pass. Attempts to inspect the staging health/readiness and Pages manifest URLs through the available public verification channel were unsuccessful, so those endpoints remain unverified, not necessarily offline.
