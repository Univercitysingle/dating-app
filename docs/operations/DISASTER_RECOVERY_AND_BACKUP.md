# Disaster recovery and backup standard

**Status:** Required operating standard. Backup configuration and restore success are not verified by this document.
**Scope:** MongoDB Atlas, Firebase Authentication/Realtime Database, Cloudflare configuration, and media metadata. The existing CDN Worker and private Backblaze B2 implementation remain out of scope for modification.

## Recovery objectives

RPO and RTO must be approved by the product owner and infrastructure owner before production launch. Until approved, record them as **TBD**, not as achieved objectives. Define separate objectives for user/profile data, chat, authentication, payment/entitlement records, moderation evidence, and media objects.

## Backup inventory to confirm

| System | Data/configuration | Required evidence |
|---|---|---|
| MongoDB Atlas | Application collections, indexes, validators and critical metadata | Backup policy export, last successful backup, retention and restore test |
| Firebase RTDB | Chat paths and rules | Export/backup method, rules export, restore test and access validation |
| Firebase Auth | User identities and provider configuration | Recovery/export capability and tested account restoration process |
| Cloudflare | Pages/Worker source, bindings, routes, cron schedules and secrets inventory | Git source SHA, non-secret configuration export, secret owner/rotation record |
| B2/CDN | Media objects and object metadata | Existing CDN/B2 owner-provided recovery evidence; do not change CDN Worker here |

Never store secrets in backups or this document in plaintext. Secret recovery must use the approved secret manager and access-controlled rotation process.

## Restore procedure

1. Declare an incident and assign incident commander, data owner and technical operator.
2. Identify the last known-good backup and establish the recovery point.
3. Restore into an isolated environment first. Never overwrite production during initial validation.
4. Validate collection counts, indexes, unique constraints, sample document integrity and application compatibility.
5. Restore Firebase rules before allowing client access. Test that unrelated users cannot read or write restored chat rooms.
6. Validate payment/entitlement consistency against provider records. Do not replay callbacks blindly.
7. Validate user deletion, moderation restrictions and retention requirements before reopening access.
8. Obtain owner approval, record evidence and perform controlled cutover.
9. Monitor error rates, data divergence and delayed jobs after recovery.

## Required recurring exercises

- Confirm backup completion and retention monthly.
- Perform a documented restore drill at least quarterly or at the approved organizational cadence.
- Test a Firebase RTDB rules restore and negative access cases.
- Reconcile a sample of payment records and entitlements after restore.
- Record measured RPO/RTO, exceptions, owner, date, commit/config revision and remediation actions.

## Open acceptance checklist

- [ ] MongoDB Atlas backup policy and retention verified.
- [ ] MongoDB restore drill completed and measured.
- [ ] Firebase RTDB export/backup and restore method verified.
- [ ] Firebase Authentication recovery procedure verified.
- [ ] Cloudflare configuration reconstruction procedure verified.
- [ ] CDN/B2 recovery owner and evidence confirmed without modifying the CDN Worker.
- [ ] RPO/RTO approved by accountable owners.
- [ ] Restore drill evidence stored in an access-controlled location.
