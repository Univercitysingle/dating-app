# Video Rooms Specification
Last reviewed: 2026-11-07. Current implementation is partial; this defines acceptance.

Define one-to-one, public and private room types separately. Server validates identity, account status, visibility, invite/membership, blocks, match, booking and entitlement. Client room owner/payment claims are untrusted.

Lifecycle: create, configure, invite/discover, join, negotiate, active, leave/end, cleanup. Define participant limits, idle timeout, reconnect, host departure and moderation termination.

Validate signalling authorization, ICE candidates, STUN/TURN fallback, short-lived TURN credentials, device permissions, mobile browser behaviour and bandwidth adaptation. Paid rooms require server-owned booking/order and verified settlement.

Test unauthorized join, block, expired booking, duplicate join, reconnect, host exit, TURN relay, poor network, permission denial, timeout and billing failure on real devices.
