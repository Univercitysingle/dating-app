# Testing and Acceptance Plan
Last reviewed: 2026-11-07.

Layers: static/lint/build; unit; Worker/DO/Mongo integration; Firebase rules/emulator; API contract; security (auth, IDOR, roles, injection, rate limits, replay); multi-account E2E; progressive load; manual device/accessibility.

Critical journeys: registration, profile/privacy, reciprocal discovery, mutual match, chat, block/unmatch, report/admin, photo upload/delete, subscription settlement, verification review, video lifecycle and account deletion.

For each run record branch, SHA, environment, timestamp, test case, result, workflow URL, request ID and defect. Never record credentials, tokens or raw verification media.

Release gate: critical tests pass, no unresolved critical/high security issue, rollback documented, staging deploy/smoke passes and external integrations complete or safely disabled. Green build alone is not acceptance.
