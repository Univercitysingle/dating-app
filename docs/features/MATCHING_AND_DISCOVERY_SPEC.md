# Matching and Discovery Specification
Last reviewed: 2026-11-07.

Eligibility is server-authoritative and must satisfy both users' preferences, visibility, account status, age/location rules and product exclusions. Exclude self, blocked pairs in either direction, suspended/banned/deleted accounts and ineligible profiles.

Likes must validate verified actor identity and target, reject self-like, prevent duplicates and handle concurrent reciprocal likes without duplicate matches. Define pass, undo, re-like and unmatch semantics. Unmatch revokes chat/call permissions. Ranking never overrides safety or eligibility.

Acceptance: preference combinations including Other/everyone where supported; reciprocal mismatch; age/location boundaries; empty results; blocks both directions; account restrictions; simultaneous likes; retries; undo; unmatch; stable pagination.


## Current acceptance status (2026-11-11)

This document defines required behaviour, not a claim that every edge case has passed. The current release priority remains authentication/profile management first, discovery/likes/matching second, then conversations/messaging. Require multi-account staging tests for reciprocal preference combinations, blocked pairs in both directions, duplicate/concurrent likes, pagination, unmatch and access revocation. GitHub Actions quota is exhausted, so no new automated acceptance run is available. Record exact source SHA and evidence before changing statuses to complete.
