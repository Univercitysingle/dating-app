# Cloudflare Pages frontend deployment (migration branch)

This workflow deploys the React frontend from `migrate-to-serverless` only. It does not modify production DNS or merge to `main`.

## GitHub Actions secrets

Configure these under **Repository Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — scoped to the intended Cloudflare account with permission to list Pages projects, manage Pages deployment, and update Pages project secrets
- `REACT_APP_FIREBASE_API_KEY`
- `FIREBASE_PROJECT_ID` or `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`

The workflow queries the Cloudflare Pages API using the account ID and token to discover the Pages project. It prefers `dating-app-staging`, then `dating-app`, and otherwise proceeds only when exactly one matching dating-app project can be selected safely. If project discovery fails or is ambiguous, the workflow stops and prints the project names returned by Cloudflare. It does not require a `CLOUDFLARE_PAGES_PROJECT_NAME` secret.

The workflow sets `API_ORIGIN` to `https://dating-app-api-staging.enadoctemp.workers.dev` and configures it as a Pages Function secret before deployment. `REACT_APP_FIREBASE_DATABASE_URL` and `REACT_APP_FIREBASE_STORAGE_BUCKET` are optional because `src/firebase.js` derives defaults from the project ID. Firebase web configuration values are public client configuration, not server credentials. Use values from the intended Firebase project and add the deployed Pages hostname to Firebase Authorized Domains. Never put Firebase Admin credentials, payment secrets, or database connection strings in a `REACT_APP_*` variable.

## Deploy and validate

1. Confirm the staging Worker and its database readiness checks pass.
2. Ensure the Cloudflare API token has the required account and Pages permissions.
3. Open [GitHub Actions](https://github.com/Univercitysingle/dating-app/actions/workflows/deploy-cloudflare-pages.yml) and inspect the run for this workflow. Pushes to relevant frontend, Pages Function, package, or workflow files on `migrate-to-serverless` trigger it automatically. Manual dispatch is also supported.
4. Verify the Cloudflare Pages deployment URL, `/login`, Firebase sign-in, and authenticated same-origin `/api/*` calls.
5. Keep production DNS and `main` unchanged until end-to-end acceptance tests pass and a separate cutover decision is made.

### If the preview hostname returns `DNS_PROBE_FINISHED_NXDOMAIN`

The branch preview hostname is not guaranteed to exist until a Pages deployment has succeeded. Do not assume the project name or manually construct the final URL. First open the workflow run above and confirm that **Deploy frontend to Cloudflare Pages** succeeded; then copy the deployment/preview URL from Cloudflare Pages → the selected project → Deployments. If no new run appears after a branch commit, use **Run workflow** in GitHub Actions with branch `migrate-to-serverless`. If the workflow fails during project discovery, inspect the names printed in its log and confirm the API token can list Pages projects. A DNS failure happens before React, Firebase, or the API proxy is reached.

The workflow fails closed when required credentials are missing, the Cloudflare API cannot list projects, or a project cannot be selected unambiguously. Never deploy with placeholder Firebase configuration.


## Documentation and deployment ownership (2026-11-07)

The current product documentation catalogue is linked from the root README. This setup guide remains specific to Cloudflare Pages deployment. Use docs/operations/DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md for staging release gates and rollback. A successful Pages deployment must be checked against the exact frontend commit SHA and paired Worker deployment; do not infer current deployment from an older successful run. Production DNS and main remain unchanged absent a separate approved cutover.


## Current deployment status (2026-11-11)

GitHub Actions quota is currently exhausted. Do not assume that a branch push or successful historical workflow means the latest frontend is deployed. The current call-quality source revision is `bf5c435553c6f18cc5a80e5b14df68e1c69249ca`; deployment of that revision is not confirmed. Once quota is restored, run the Pages workflow from `migrate-to-serverless`, verify the exact checked-out SHA and deployment URL in Cloudflare Pages, then test login, profile, discovery, same-origin API proxy and chat with staging accounts. Keep production DNS and `main` unchanged. Do not modify the CDN Worker as part of Pages deployment.
