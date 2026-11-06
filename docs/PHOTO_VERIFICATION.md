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

If the Worker configuration uses a named staging deployment rather than a Wrangler environment, select the `dating-app-api-staging` Worker in the Cloudflare dashboard and add `VERIFICATION_ENCRYPTION_KEY` as an encrypted secret there. Do not commit the key or place it in a Pages environment variable.

The API fails closed and does not accept evidence unless the secret is exactly 64 hexadecimal characters. Back up the key securely: losing it makes any still-pending encrypted evidence undecryptable. Rotating it requires draining or decrypting existing pending records before changing the key.

## Privacy and operations
- Do not route selfie videos through the public CDN.
- Do not log video content, base64 payloads, or encryption material.
- Review only when the user has consented. Reject unclear or inconclusive evidence and allow a retry.
- The current seven-day TTL requires MongoDB TTL monitor execution, which is asynchronous and may occur after the exact expiry time.
- This is a low-cost manual review workflow, not a substitute for a specialist anti-spoofing provider or legal review of biometric-data processing in each operating jurisdiction.
