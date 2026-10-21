# Private Backblaze B2 media storage

The Worker uses Backblaze B2's S3-compatible API. The bucket must remain **private**; do not enable public bucket access or put credentials in Git.

## One-time Backblaze setup

1. Create a private B2 bucket in the Backblaze console.
2. Create an application key restricted to that bucket. Grant only the permissions required for listing is not needed; allow reading, writing, and deleting objects for profile-photo upload, delivery, and removal.
3. Record the key ID, application key, bucket name, and the S3 endpoint for that bucket's region. The endpoint format is like `https://s3.us-west-004.backblazeb2.com`; use the exact region shown by Backblaze.

## Configure the staging Worker

From the repository root, with Wrangler authenticated to the correct Cloudflare account, set secrets/vars for the **staging environment only**:

```sh
npx wrangler@4 secret put B2_APPLICATION_KEY_ID --env staging
npx wrangler@4 secret put B2_APPLICATION_KEY --env staging
npx wrangler@4 secret put B2_BUCKET_NAME --env staging
npx wrangler@4 secret put B2_ENDPOINT --env staging
```

Paste each value when prompted. These commands store the values in Cloudflare, not in source control. If your organization treats bucket name and endpoint as non-secret, they may instead be set as staging-only Wrangler variables. Never commit the application key.

The staging deployment injects the existing `CDN_HOSTNAME` GitHub Actions secret into the Worker; do not hardcode the CDN hostname in `wrangler.jsonc`. For backward compatibility, photo URLs use the legacy `https://<CDN_HOSTNAME>/<object-key>` form. The CDN hostname must route the root-level generated photo key paths to this Worker proxy (which also accepts `/media/:key`). The workflow maps the legacy S3-compatible GitHub secrets `AWS_S3_ENDPOINT`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` to the Worker’s `B2_*` settings. The route permits only generated profile-photo keys; it does not provide bucket listing or arbitrary object access. Bank slips must not use this public-photo proxy.

## Validate before relying on it

- Confirm the bucket is private in Backblaze.
- Deploy the `migrate-to-serverless` branch and check `/ready`.
- Upload a small JPEG/PNG/GIF with an authenticated staging account; verify its object exists in B2 and its returned `cdnUrl` loads through `/media/`.
- Verify another user's key cannot be deleted through the authenticated delete endpoint.
- Delete the photo and confirm the B2 object is gone.
- Confirm invalid keys return 404 and that no application key appears in browser responses or logs.

Automated tests validate configuration guards; they do not prove access to your real B2 account. Bank-slip storage, WebXPay settlement/callback verification, RTDB chat rules, scheduled expiration jobs, and full frontend end-to-end parity remain separate migration gates.
