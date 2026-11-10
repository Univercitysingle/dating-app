# Chat and Notifications Specification
Last reviewed: 2026-11-10.

Firebase Realtime Database remains an optional realtime chat integration. The Cloudflare Worker remains responsible for authoritative conversation authorization. The browser listener is enabled only when `REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC=true`.

**Security prerequisite:** Firebase Realtime Database rules and project IAM must independently restrict direct client access. The deployed rules have not yet been externally verified. Do not treat Worker authorization as protection for direct browser RTDB reads. See [Firebase RTDB Security Review](../security/FIREBASE-RTDB-REVIEW-2026-11-10.md). Keep the client realtime listener disabled in production until the required external rule checks pass.

Required behaviours: send/receive, ordering, read/unread where supported, typing/presence where enabled, reconnect/offline recovery, safe attachments, notification preferences and stale membership cleanup. Block, unmatch, suspension and deletion revoke access through the authoritative Worker API and, once verified, the RTDB rules.

Notifications originate from trusted server events, respect preferences and avoid duplicates on retries. Prefer event-driven updates; fallback polling must be bounded and backoff-capable. Client notification reads must be scoped to the authenticated recipient.

Acceptance: member send/receive, third-party denial, block/unmatch denial, duplicate retry, reconnect, unread state, preference enforcement, rate limits, unauthenticated RTDB denial, cross-room RTDB denial, cross-user notification denial, and revocation after unmatch/block/suspension/deletion.
