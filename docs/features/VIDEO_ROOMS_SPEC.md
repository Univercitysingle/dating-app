# Video Rooms Specification
Last reviewed: 2026-11-11. Current implementation is partial; this defines acceptance.

Define one-to-one, public and private room types separately. Server validates identity, account status, visibility, invite/membership, blocks, match, booking and entitlement. Client room owner/payment claims are untrusted.

Lifecycle: create, configure, invite/discover, join, negotiate, active, leave/end, cleanup. Define participant limits, idle timeout, reconnect, host departure and moderation termination.

Validate signalling authorization, ICE candidates, STUN/TURN fallback, short-lived TURN credentials, device permissions, mobile browser behaviour and bandwidth adaptation. Paid rooms require server-owned booking/order and verified settlement.

## One-to-one call quality: automatic mode

Automatic is the default and only required user-facing quality mode. The client should continuously evaluate available WebRTC statistics and adapt outbound video without asking the caller to select a profile. The current implementation uses available outgoing bitrate, selected candidate-pair RTT and remote video packet-loss reports to select an internal quality tier. It requests sender bitrate, frame-rate and resolution-scaling limits and uses sample hysteresis for recovery.

Audio is prioritised over video. Capture requests mono voice, echo cancellation, noise suppression and automatic gain control. The outgoing audio sender requests a 24 Kbps bitrate and high priority where supported. These are browser-dependent preferences, not guaranteed codec enforcement or hard bandwidth limits. Do not claim a specific monthly data saving without measured traffic.

When network conditions deteriorate, reduce video bitrate/resolution/frame rate first. Preserve the audio track; if video must be paused, keep the call and audio alive. Restore video gradually after sustained recovery. Avoid repeated offer/answer renegotiation solely to change quality.

### Acceptance and telemetry

- Record outbound/inbound bytes, video bitrate, frame rate, packet loss, jitter, RTT and selected candidate-pair type without logging SDP, credentials or peer IP addresses.
- Test Wi-Fi, cellular, constrained bandwidth, packet loss, background/foreground transitions and network handoff on at least two real devices.
- Verify voice remains intelligible while video steps down and recovers without oscillation.
- Verify actual TURN relay use from candidate-pair statistics; configured TURN servers alone do not prove relay allocation.
- Compare measured bytes for audio-only and video calls over repeatable durations. Treat estimates as estimates.
- Confirm browser support for `RTCRtpSender.setParameters`, `scaleResolutionDownBy`, `maxFramerate`, and audio sender parameters; retain browser congestion-control fallback.

### Current implementation evidence and status

Initial automatic quality control is committed on `migrate-to-serverless` at `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`. GitHub Actions quota is reported exhausted and the associated Cloudflare Pages workflow failed, so deployment, browser compatibility, real-device behaviour, TURN relay and measured data savings are not yet verified.

Test unauthorized join, block, expired booking, duplicate join, reconnect, host exit, TURN relay, poor network, permission denial, timeout and billing failure on real devices.


## Verification and governance gaps (2026-11-11)

This document is not evidence of legal approval, provider certification, production deployment, or operational acceptance. Record the responsible owner, implementation state, test evidence, staging evidence, last verified commit, data classification, retention rule, dependency, and release approval for each requirement.

Explicitly track applicable gaps: payment/provider callback replay and reconciliation, refunds, duplicate settlement and stale pending recovery; verification evidence access controls, encryption, review audit and deletion/retention; user-data export and deletion propagation across MongoDB, Firebase, media storage and backups; documented backup/restore exercises and approved RPO/RTO; moderator access and ticket/chat message edit/delete policy with immutable audit history; notification opt-in/revocation and delivery failures; accessibility, supported browsers/devices, PWA/offline behaviour, localization, timezone and RTL. Do not mark an item complete without reproducible evidence and an assigned approver.
