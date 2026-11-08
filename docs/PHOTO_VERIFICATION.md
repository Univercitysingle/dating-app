# Photo verification

## Workflow
- Users submit a seven-second browser-recorded selfie video with explicit consent and a randomly selected movement/expression prompt.
- The API stores the video encrypted with AES-256-GCM in the private MongoDB `photoVerifications` collection.
- Only a superadmin can access the pending queue, decrypt evidence, compare it manually with public profile photos, and approve or reject.
- Approval is the only workflow action that sets `users.isVerified` and `users.faceVerified`.
- Encrypted video and its verification record expire after seven days through a MongoDB TTL index. Evidence is also removed immediately when reviewed.
- The current implementation does not claim automated face recognition, certified liveness detection, or identity verification. Manual review is required.

## Required Cloudflare Worker secret

Generate a random 32-byte key represented as 64 hexadecimal characters:

```sh
openssl rand -hex 32
```

Set it as a Worker secret for the staging environment:

```sh
npx wrangler secret put VERIFICATION_ENCRYPTION_KEY --env staging
```

Alternatively, add `VERIFICATION_ENCRYPTION_KEY` as a GitHub Actions repository or environment secret. The staging Worker deployment workflow will validate its 64-character hexadecimal format and configure it as a Cloudflare Worker secret. If the GitHub secret is absent, the workflow preserves any existing Worker secret and photo verification submissions remain disabled until configured. You can also set it directly on the `dating-app-api-staging` Worker in Cloudflare. Do not commit the key or place it in a Pages environment variable.

The API fails closed and does not accept evidence unless the secret is exactly 64 hexadecimal characters. Back up the key securely: losing it makes any still-pending encrypted evidence undecryptable. Rotating it requires draining or decrypting existing pending records before changing the key.

## Privacy and operations
- Do not route selfie videos through the public CDN.
- Do not log video content, base64 payloads, or encryption material.
- Review only when the user has consented. Reject unclear or inconclusive evidence and allow a retry.
- The current seven-day TTL requires MongoDB TTL monitor execution, which is asynchronous and may occur after the exact expiry time.
- This is a low-cost manual review workflow, not a substitute for a specialist anti-spoofing provider or legal review of biometric-data processing in each operating jurisdiction.

## Automated face assessment (staging)

A separate private Cloudflare Worker named `dating-app-face-verification-staging` fronts a Cloudflare Container running Node.js, TensorFlow.js and the pinned `@vladmandic/face-api@1.7.15` package. The API Worker invokes it through a Cloudflare Service Binding. The face service is not exposed on a public Workers URL.

The service samples up to seven frames from the consented video, detects faces, creates face descriptors, and compares them with up to six profile photos fetched only from the configured HTTPS CDN origin. It stores only aggregate assessment metadata with the existing encrypted evidence record. Temporary video and image files are removed after processing.

The face-distance value is advisory and is not calibrated as an approval threshold. Challenge completion and liveness are not automatically verified. Every submission remains `pending_review` and only a superadmin can approve or reject it. If the inference service is unavailable, submission falls back to the existing manual review flow.

Cloudflare Containers require a Workers Paid plan. The GitHub Actions staging deployment builds the container image and deploys the private face service before deploying the API Worker.
