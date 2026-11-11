# Documentation completeness register

**Review date:** 2026-11-11  
**Branch:** `migrate-to-serverless`  
**Scope:** Markdown documentation and the tracked Word document.  
**Status key:** Updated = scope and controls documented; Evidence pending = runtime proof or source inventory still required; Not updated = binary artifact not safely editable through the available UTF-8 GitHub file operation.

## Scope completed in this pass

All 33 Markdown documents present in the branch tree at the start of this pass were updated with document-specific traceability, evidence, ownership, acceptance or governance controls. Four new specifications were added:
- `docs/operations/DISASTER_RECOVERY_AND_BACKUP.md`
- `docs/features/PUSH_NOTIFICATIONS_SPEC.md`
- `docs/operations/ACCESSIBILITY_BROWSER_LOCALIZATION.md`
- `docs/governance/DATA_SUBJECT_REQUESTS.md`

The existing CDN Worker and WebXPay/payment implementation were not modified. All edits were committed to `migrate-to-serverless`; `main` was not targeted.

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
| Release/deployment | Updated; evidence pending | Restore CI capacity or use an approved manual path, then capture exact Pages/Worker deployment SHAs and smoke-test evidence. |
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
