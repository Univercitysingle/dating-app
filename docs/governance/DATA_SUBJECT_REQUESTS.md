# Data subject requests and account lifecycle

**Status:** Operational requirements. Legal applicability and response deadlines require review by qualified counsel for each operating region.
**Scope:** Access/export, correction, deletion, restriction, consent withdrawal and account closure.

## Data inventory

Before accepting a request workflow as complete, maintain a field-level inventory for:
- MongoDB Atlas profile, preference, swipe, match, subscription, purchase, report, block, moderation and audit records.
- Firebase Authentication identity and Firebase RTDB chat records.
- Media references and objects served through the existing CDN Worker/B2 integration.
- Browser push subscriptions and notification preferences.
- Payment provider transaction references and records subject to financial retention.
- Backups, logs, analytics and third-party processors.

## Request workflow

1. Authenticate the requester with an appropriate assurance level. Do not disclose data based only on an email address or client-supplied UID.
2. Record request type, received time, jurisdiction/region where relevant, identity verification outcome, scope and assigned owner.
3. Identify data across systems using verified identifiers and documented relationship mappings.
4. Apply legal retention and exception rules. Payment, fraud, safety and audit records may require restricted retention rather than immediate deletion.
5. Export data in a machine-readable format where required, using an authenticated, time-limited delivery channel.
6. For deletion, execute an idempotent deletion workflow across application data, Firebase, media references/objects, push subscriptions and downstream processors, subject to lawful retention.
7. Record completion, exceptions, downstream processor confirmation and backup expiry timeline.
8. Prevent deleted accounts from being recreated by stale sessions, tokens, queued jobs or old subscriptions.

## Backup and log handling

Deletion from active systems does not necessarily remove immutable backups immediately. Document backup retention, expiry and restore-time suppression so deleted data is not silently reintroduced after a restore. Logs should avoid unnecessary personal data and have a defined retention schedule.

## Acceptance tests

- Requester cannot export another user's data.
- Export includes the documented personal-data categories and excludes secrets/internal credentials.
- Deletion propagates to MongoDB and Firebase and invalidates sessions/subscriptions.
- Media deletion follows the existing CDN/B2 owner-approved process without changing CDN Worker behaviour.
- Legally retained records are restricted and have a reason and expiry/review date.
- Restore process does not reactivate deleted accounts or permissions.
- Completion evidence is access-controlled and does not contain unnecessary sensitive data.

## Open decisions

- [ ] Legal basis, jurisdictions and response timelines reviewed.
- [ ] Data inventory and processor list approved.
- [ ] Export format and delivery channel approved.
- [ ] Deletion exceptions and retention schedule approved.
- [ ] Backup expiry and restore suppression tested.
- [ ] Operational owner and escalation route assigned.
