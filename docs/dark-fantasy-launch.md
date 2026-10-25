# Dark Fantasy add-on — staging and launch gates

Dark Fantasy is implemented as a separate, opt-in paid add-on. It is **disabled by default**. Do not enable it until legal counsel, age assurance, moderation, privacy, and payment underwriting are approved for the actual operating entity and launch countries.

## Deployment controls

Configure these only in the staging Worker and Pages environments after approval:

- Worker DARK_FANTASY_ENABLED=true — enables the API.
- Worker DARK_FANTASY_ALLOWED_COUNTRIES=US,GB,... — comma-separated ISO 3166-1 alpha-2 country allowlist of countries that have been reviewed and approved. Empty or missing allowlist denies access. Cloudflare's country signal is only a coarse location control and is not proof of residence.
- Worker DARK_FANTASY_PAYMENTS_APPROVED=true — permits checkout for this add-on only after the payment processor/acquirer has approved the exact service in writing.
- Pages REACT_APP_DARK_FANTASY_ENABLED=true — displays the entry in navigation and renders the feature UI.

All controls default to off or deny. Do not set the flags in production without a documented approval decision. Existing WebXPay integration is reused only when the explicit payment approval flag is set; no payment approval is implied by this code.

## Product and billing

- Separate item: dark-fantasy-monthly.
- Current pilot price: LKR 1,200 for 30 days, non-recurring. Confirm currency, taxes, price display, refund terms, and processor acceptance before launch.
- Access is granted only by the existing server-side WebXPay settlement handler after a successful payment status. The browser cannot grant entitlement.
- The entitlement is stored on the user's MongoDB record as darkFantasyAccessUntil; re-purchase extends from the later of the current expiry or the settlement time.
- Premium subscription status does not grant Dark Fantasy access.

## API

- GET /api/dark-fantasy/status
- POST /api/dark-fantasy/purchase
- GET|PUT|DELETE /api/dark-fantasy/profile
- GET /api/dark-fantasy/discover

All endpoints require Firebase authentication and the Worker feature gate. Profile save, access, and discovery are enforced server-side. Preference writes require explicit consent and allowlisted values. Delete removes the stored preference document even after the add-on expires. Discovery requires opt-in visibility and active paid entitlements on both sides, excludes suspended/banned users and blocked pairs, and returns only a public profile card plus shared-interest count—not the other person's sensitive preference list.

## Data protection and safety gates still required before launch

1. The current age check reads the stored birthday. It is not a robust age-assurance solution by itself. Integrate an age-assurance provider or other legally approved mechanism and enforce verified adult status server-side before enabling the feature.
2. Obtain a legal review for the operating entity and each country, including the UAE if the company is operated from there. An international target market or country blocklist does not by itself settle operator-jurisdiction obligations.
3. Complete a privacy impact assessment for sexual-interest data, set retention/deletion rules, and review backups, logs, analytics, admin access, and incident response.
4. Staff a moderation and escalation process for non-consensual content, coercion, impersonation, harassment, underage reports, and urgent safety concerns. Explicit media, live cam, paid sexual services, and the physical-products store are not part of this MVP.
5. Obtain written processor/acquirer approval for the exact add-on, pricing, countries, refund flow, and descriptor. Do not bypass a processor's restricted-business rules.
6. Add automated and authenticated end-to-end tests for successful/failed payment settlement, expiry/renewal, country restrictions, blocks in both directions, account suspension, consent revocation, and deletion.
7. Run a privacy/security review of existing profile endpoints before launch; the add-on must not be used to expose ordinary account contact details.

## Rollback

Set Worker DARK_FANTASY_ENABLED=false (or remove it), set Pages REACT_APP_DARK_FANTASY_ENABLED=false, and leave DARK_FANTASY_PAYMENTS_APPROVED unset/false. This disables entry and API access without deleting entitlement or preference records. Handle data deletion requests through the authenticated deletion endpoint while the feature is enabled, or an approved administrative privacy workflow.


## Creator galleries, gallery access, and store

- `dark-fantasy-creator-monthly`: LKR 800 pilot price; server settlement grants `creatorGalleryAccessUntil` for 30 days.
- `dark-fantasy-gallery:<creatorUid>`: LKR 500 pilot price; settlement grants the buyer access to that creator's gallery for 30 days. Purchases are rejected for one's own gallery and if the creator's gallery entitlement is inactive.
- `dark-fantasy-unlimited-pass`: LKR 3,500 pilot price; server settlement grants `darkFantasyUnlimitedUntil` for 30 days.
- These are separate from the existing Dark Fantasy matching add-on and ordinary Premium. Browsing the Dark Fantasy Store does not require a subscription.
- Important: this commit establishes purchase SKUs and settlement entitlements and adds the UI entry points. It does **not** yet implement private gallery media upload, media-delivery authorization, creator gallery management, or an actual gallery catalogue. Do not launch paid gallery content until those are implemented and tested; do not store sensitive media in public URLs.
