# Chat and Notifications Specification
Last reviewed: 2026-11-07.

Firebase Realtime Database remains the realtime chat integration. Conversation access is limited to current eligible participants. Membership is derived from authoritative match/conversation state and enforced by Worker logic and RTDB rules.

Required behaviours: send/receive, ordering, read/unread where supported, typing/presence where enabled, reconnect/offline recovery, safe attachments, notification preferences and stale membership cleanup. Block, unmatch, suspension and deletion revoke access.

Notifications originate from trusted server events, respect preferences and avoid duplicates on retries. Prefer event-driven updates; fallback polling must be bounded and backoff-capable.

Acceptance: member send/receive, third-party denial, block/unmatch denial, duplicate retry, reconnect, unread state, preference enforcement and rate limits.
