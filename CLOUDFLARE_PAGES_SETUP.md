# Cloudflare Pages frontend deployment (migration branch)

This deploys the React frontend from `migrate-to-serverless` only. It does not modify production DNS or merge to `main`.

## Required GitHub Actions secrets

Configure these in **Repository Settings → Secrets and variables → Actions → New repository secret**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — token scoped to the intended Cloudflare account with Workers Scripts and Pages deployment permissions
- `CLOUDFLARE_PAGES_PROJECT_NAME` — the intended Pages project name; create the project in Cloudflare Pages first if it does not exist
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_APP_ID`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`

The workflow sets `API_ORIGIN` to the known staging Worker (`https://dating-app-api-staging.enadoctemp.workers.dev`) and configures it as a Pages Function secret. `REACT_APP_FIREBASE_DATABASE_URL` and `REACT_APP_FIREBASE_STORAGE_BUCKET` are optional because `src/firebase.js` derives defaults from the project ID. Firebase web configuration values are public client configuration, not server credentials. Use exact values from the intended Firebase project and add the Pages hostname to Firebase Authorized Domains. Never put Firebase Admin credentials, payment secrets, or MongoDB connection strings in a `REACT_APP_*` variable.

## Deploy

1. Confirm the Worker staging deployment and MongoDB readiness checks pass.
2. Create or select a dedicated Cloudflare Pages project for the staging frontend.
3. Add all secrets above with the intended Cloudflare and Firebase values.
4. Open **Actions → Deploy dating-app frontend to Cloudflare Pages → Run workflow** and select `migrate-to-serverless`.
5. Verify the Pages deployment, `/login`, Firebase sign-in, and authenticated API calls. The Pages Function proxies same-origin `/api/*` requests to `STAGING_API_ORIGIN`.
6. Keep production DNS and `main` unchanged until end-to-end acceptance tests pass and a separate cutover decision is made.

The workflow intentionally fails closed if a required secret is absent. Do not deploy with placeholder Firebase values.
