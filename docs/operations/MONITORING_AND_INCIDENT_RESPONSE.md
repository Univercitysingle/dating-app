# Monitoring and Incident Response
Last reviewed: 2026-11-07.

Monitor API availability/errors/latency, Worker exceptions, Durable Object queueing, Mongo connectivity/pool/slow queries, Firebase denials, CDN operations, payment callback outcomes, verification queue age, TURN connectivity and Pages deployment health.

Every alert needs owner, severity, actionable threshold and runbook. Avoid tokens, message bodies, contact data and verification media in alerts.

Severity: SEV-1 broad outage/data exposure/payment integrity/urgent safety; SEV-2 major core journey or dependency degradation; SEV-3 limited degradation with workaround; SEV-4 low impact.

Response: acknowledge/assign; scope impact; preserve safe logs/request IDs; mitigate by rollback or feature disablement; verify recovery; communicate; complete root cause and corrective actions.

This defines an operating model, not proof that alerting/on-call staffing is configured. Assign owners and validate tooling before launch.
