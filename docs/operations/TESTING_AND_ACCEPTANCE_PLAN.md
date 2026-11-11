# Testing and Acceptance Plan
Last reviewed: 2026-11-07.

Layers: static/lint/build; unit; Worker/DO/Mongo integration; Firebase rules/emulator; API contract; security (auth, IDOR, roles, injection, rate limits, replay); multi-account E2E; progressive load; manual device/accessibility.

Critical journeys: registration, profile/privacy, reciprocal discovery, mutual match, chat, block/unmatch, report/admin, photo upload/delete, subscription settlement, verification review, video lifecycle and account deletion.

For each run record branch, SHA, environment, timestamp, test case, result, workflow URL, request ID and defect. Never record credentials, tokens or raw verification media.

Release gate: critical tests pass, no unresolved critical/high security issue, rollback documented, staging deploy/smoke passes and external integrations complete or safely disabled. Green build alone is not acceptance.


## Current release gate status (2026-11-11)

GitHub Actions quota is exhausted. The latest call-quality source revision is `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`, but deployment and browser/two-device acceptance are not confirmed. Outstanding evidence includes responsive mobile/desktop call UI, camera/microphone permissions, call lifecycle, reconnect, weak-network adaptation, TURN relay candidate selection, audio continuity, actual bytes sent/received, Firebase RTDB deployed-rule tests, WebXPay sandbox settlement and media upload/read/delete. Do not mark these passed based on source inspection or mocked unit tests. Once CI capacity is restored, record exact SHA, workflow URLs, environment, test accounts and results.
