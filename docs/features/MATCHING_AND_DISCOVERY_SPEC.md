# Matching and Discovery Specification
Last reviewed: 2026-11-07.

Eligibility is server-authoritative and must satisfy both users' preferences, visibility, account status, age/location rules and product exclusions. Exclude self, blocked pairs in either direction, suspended/banned/deleted accounts and ineligible profiles.

Likes must validate verified actor identity and target, reject self-like, prevent duplicates and handle concurrent reciprocal likes without duplicate matches. Define pass, undo, re-like and unmatch semantics. Unmatch revokes chat/call permissions. Ranking never overrides safety or eligibility.

Acceptance: preference combinations including Other/everyone where supported; reciprocal mismatch; age/location boundaries; empty results; blocks both directions; account restrictions; simultaneous likes; retries; undo; unmatch; stable pagination.
