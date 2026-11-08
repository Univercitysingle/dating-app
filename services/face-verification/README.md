# Private photo face-assessment service

This service is deployed as a private Cloudflare Worker with a Cloudflare Container running Node.js, TensorFlow.js and `@vladmandic/face-api`.

## Security and decision policy

- `workers_dev` is disabled. The service is called through the API Worker's Cloudflare Service Binding only.
- The Worker fetches profile photos only from the configured HTTPS CDN origin, rejects redirects, and sends their bytes to the inference container.
- The container processes the submitted video in a temporary directory and removes the files after inference.
- The result is advisory metadata only. It never approves, rejects, or verifies an account.
- Face distance thresholds are deliberately not used for decisions until validated on representative, consented test data.
- No age, gender, race, or emotion inference is performed.
- The existing encrypted MongoDB evidence and superadmin manual-review workflow remains authoritative.

## Deployment

Cloudflare Containers require the Workers Paid plan and a Docker-compatible build environment. The staging Worker deployment workflow builds and deploys this service before deploying the API Worker.

The current `@vladmandic/face-api` upstream repository is archived. Version 1.7.15 is pinned for this initial integration and should be replaced if a maintained compatible implementation is selected.
