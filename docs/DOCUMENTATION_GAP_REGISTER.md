# Documentation completeness register

**Review date:** 2026-11-19  
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
| Release/deployment | Cloudflare staging workflows verified on 2026-11-19 | Pages deployment run [44506117077](https://github.com/Univercitysingle/dating-app/actions/runs/44506117077) passed on `7a16fe63fb019a82556efb3349cdd32011d1070b`, including dependency audits, backend/frontend regression tests, build, deployment, SEO/API routing checks and OWASP ZAP passive baseline. Worker deployment run [44503457955](https://github.com/Univercitysingle/dating-app/actions/runs/44503457955) passed on `e4cac4f715496c09cf4096f8ccfba33c06401301`, including Worker tests, deployment, MongoDB readiness, anonymous-route checks and OWASP ZAP. Direct HTTP verification of the public staging URLs was not available in this review channel. Confirm one canonical Firebase project ID is used by both Worker and Pages, and perform authenticated end-to-end acceptance tests. |
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

After API/schema/source inventory and authenticated staging access are available, replace the evidence-pending items with live route and collection inventories, then run the relevant acceptance tests. Revisit the Word document with a binary-safe DOCX editing and upload method.


## Source inventory progress (2026-11-11)

Two source-backed catalogues have now been added:
- [Active Worker API catalogue](./architecture/WORKER_API_CATALOG.md), based on `workers/index.js` source blob `f11fd484cf79dc56cb09474254640e9d635cfa54`.
- [Active Worker database catalogue](./architecture/WORKER_DATABASE_CATALOG.md), based on `workers/mongodb-connection.js` source blob `641b7851e107be99d3f55fbfabcf34595b40e888`.

This closes the first static source-inventory pass, not the live verification gaps. The API catalogue still needs request/response schemas and contract tests. The database catalogue still needs a live Atlas collection/index export and deployed database-name confirmation.

Additional source findings to track:
- Turnix staging credential verification initially returned HTTP 401 on 2026-11-19. The subsequent Worker staging run [44509772537](https://github.com/Univercitysingle/dating-app/actions/runs/44509772537) passed both `Verify Turnix API token and credential issuance` and `Configure Turnix API token`; the deployment is now green. Keep ExpressTURN as primary and Turnix as fallback. Automated credential issuance does not replace real-network relay validation.
- Admin purchase approve/reject endpoints and the manual entitlement-grant path have been removed. WebXPay callbacks remain authoritative for payment settlement; admins can only record a refund after verifying it in the merchant portal. Sandbox callback replay, reconciliation and refund evidence remain open.
- `/api/calls/*` remains excluded from the generic Worker IP limiter to avoid shared-IP throttling. Per-account quotas now cover call starts (30/hour), ICE credential issuance (20/minute), polling (120/minute), incoming-call checks (120/minute), history reads (30/minute), signalling (240/minute), and call actions (60/minute). These use independent Durable Object limiter keys and fail closed if the limiter is unavailable. Unit coverage verifies independent scopes, limits, 503 fail-closed behaviour and 429/Retry-After handling. Active-call concurrency is enforced server-side. Validate normal and abusive multi-device workflows and monitor false positives.
- Wrangler staging explicitly sets `DARK_FANTASY_ENABLED=false`. Independently, the shared `darkFantasyRegionGate` rejects wildcard country configuration and requires explicit two-letter ISO country codes. Regression coverage verifies wildcard rejection across video-room ICE, Dark Fantasy community, profile and catalogue route families. Keep the feature disabled in staging until an approved country allowlist and legal/product sign-off are supplied.
- Mongoose model schemas are legacy definitions and are not automatically enforced by direct MongoDB Worker writes.



## API and database source inventory follow-up

The active Worker API and database catalogues are now documented in `docs/architecture/WORKER_API_CATALOG.md` and `docs/architecture/WORKER_DATABASE_CATALOG.md`. They were generated from source files at blobs `f11fd484cf79dc56cb09474254640e9d635cfa54` and `641b7851e107be99d3d55fbfabcf34595b40e888`, respectively. Their source-backed static inventory is complete for this review pass. Live deployment parity, OpenAPI request/response schemas, Atlas index export, and staging integration evidence remain open.


## Cloudflare deployment evidence follow-up (2026-11-19)

GitHub Actions staging deployments are running on `migrate-to-serverless`. The Pages and Worker workflow evidence is recorded in the release/deployment row above. The Worker staging workflow reads `FIREBASE_PROJECT_ID` from the matching GitHub secret, with `REACT_APP_FIREBASE_PROJECT_ID` as a fallback. The deployment workflows validate configured Firebase Authentication settings and Cloudflare Pages/Worker deployment configuration. The public staging URLs could not be independently fetched through the current verification channel, so workflow-level smoke checks are recorded as passed while direct external HTTP checks remain unverified. Firebase Console RTDB rules deployment and two-account authorization tests remain open.


## Call abuse-protection follow-up (2026-11-19)

Call signalling, polling, incoming-call checks, history reads and state-changing call actions now have independent per-account Durable Object quotas. The limits are deliberately generous for WebRTC candidate bursts and active polling, while preventing unbounded authenticated request floods. The generic IP limiter remains bypassed for `/api/calls/*` so users behind shared NAT are not throttled together. Unit tests cover each scope and fail-closed/exhaustion responses. Staging workflow [44510511778](https://github.com/Univercitysingle/dating-app/actions/runs/44510511778) is the deployment evidence for the implementation; do not mark it deployed until that run completes successfully. Real-device TURN relay, reconnect and multi-tab acceptance remain open.


## WebRTC signaling payload hardening (2026-11-19)

The call signaling persistence path now validates optional ICE candidate metadata (`sdpMid`, `sdpMLineIndex`, and `usernameFragment`) and stores only the standard bounded `RTCIceCandidateInit` fields. Arbitrary client-supplied candidate object properties are discarded before MongoDB persistence. Regression tests cover metadata normalization and invalid candidate rejection. Automated deployment does not prove TURN relay connectivity; real-device network tests remain required.


## Support-ticket message concurrency hardening (2026-11-19)

Customer/admin support-ticket message edit and delete operations now check the conditional MongoDB update result. If the message was concurrently changed or deleted, the API returns HTTP 409, removes the just-created audit entry, and does not update the parent ticket timestamp. Regression tests cover both edit and delete conflict paths. This improves race handling but does not replace live cross-account permission tests or a full immutable audit-trail review.
