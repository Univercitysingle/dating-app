# Photo verification

## Workflow
- Users submit a seven-second browser-recorded selfie video with explicit consent and a randomly selected movement or expression prompt.
- The browser optionally runs `@vladmandic/face-api@1.7.15` locally using the user's device processor. It samples up to five video frames, detects faces, and compares face descriptors with up to six profile photos.
- Profile photo pixels, sampled frames, and face descriptors used by this optional comparison remain in browser memory and are not sent to the API. Only aggregate counts and a best-distance value are submitted. The browser-generated assessment is untrusted and can be manipulated by the user.
- The API stores the submitted video encrypted with AES-256-GCM in the private MongoDB `photoVerifications` collection.
- Only a superadmin can access the pending queue, decrypt evidence, compare it manually with profile photos, and approve or reject.
- Approval is the only workflow action that sets `users.isVerified` and `users.faceVerified`.
- Encrypted video and its verification record expire after seven days through a MongoDB TTL index. Evidence is also removed immediately when reviewed.

## Browser inference
The browser downloads the pinned face-api JavaScript bundle and model weights from jsDelivr when the user submits a recording. Inference runs on the user's device. This avoids Cloudflare Containers and does not require a Cloudflare Workers Paid plan. If the library, model files, device, or cross-origin profile-photo access is unavailable, the submission continues to manual review.

The assessment is strictly advisory. Client-side results are not trustworthy because users can alter browser code or request payloads. The backend sanitizes aggregate fields, marks their source as `user_browser_untrusted`, and never uses them to approve or reject. The challenge movement is not machine-verified, and no certified liveness or identity verification is claimed.

## Required Cloudflare Worker secret
Generate a random 32-byte key represented as 64 hexadecimal characters:

```sh
openssl rand -hex 32
```

Set it as a Worker secret for the staging environment:

```sh
npx wrangler secret put VERIFICATION_ENCRYPTION_KEY --env staging
```

Alternatively, add `VERIFICATION_ENCRYPTION_KEY` as a GitHub Actions repository or environment secret. The staging Worker deployment workflow validates its 64-character hexadecimal format and configures it as a Cloudflare Worker secret. Do not commit the key or place it in a Pages environment variable.

The API fails closed and does not accept evidence unless the secret is exactly 64 hexadecimal characters. Back up the key securely: losing it makes any still-pending encrypted evidence undecryptable. Rotating it requires draining or decrypting existing pending records before changing the key.

## Privacy and operations
- Do not route selfie videos through the public CDN.
- Do not log video content, base64 payloads, or encryption material.
- Review only when the user has consented. Reject unclear or inconclusive evidence and allow a retry.
- The current seven-day TTL requires MongoDB TTL monitor execution, which is asynchronous and may occur after the exact expiry time.
- This is a manual review workflow with an optional client-side comparison signal, not a substitute for a specialist anti-spoofing provider or legal review of biometric-data processing in each operating jurisdiction.

## Library maintenance
`@vladmandic/face-api` is archived and no longer actively maintained. It is pinned for this interim staging implementation and should be replaced with a maintained inference stack before relying on it for a production verification feature.


## Operational status (2026-11-11)

This guide describes the intended/current source workflow, not proof of production readiness. Before enabling broadly, validate encryption-key configuration and recovery procedures, superadmin-only evidence access, audit events, TTL expiry, immediate deletion, backup retention and consent withdrawal in staging. The optional browser inference is attacker-controlled and must never decide verification outcomes. Review the archived face-api dependency and biometric/privacy obligations before production use. Current GitHub Actions quota exhaustion prevents fresh workflow validation.
