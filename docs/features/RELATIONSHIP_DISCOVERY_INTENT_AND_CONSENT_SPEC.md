# Relationship Discovery, Intent and Consent Specification

**Last reviewed:** 2026-11-18  
**Status:** Proposed product design. No implementation is implied by this document.  
**Product direction:** A unified dating platform combining fast swipe discovery, intentional conversation controls, and inclusive relationship/identity exploration.

## 1. Product proposition

Build one coherent product, not three copied interfaces:
- **Fast discovery (Tinder-inspired):** visual profile cards, like/pass, optional Super Like, undo, mutual matches, and a responsive discovery queue.
- **Intentional interaction (Bumble-inspired):** configurable first-move rules, profile prompts, conversation starters, clear match states, and respectful response windows. Do not impose gender stereotypes or assume that only one gender may initiate.
- **Flexible identity and relationship exploration (Feeld-inspired):** richer identity and relationship-intention options, desire/interest tags, consensual linked profiles, optional group discovery, privacy controls, and glossary explanations.

The differentiator should be **intent-first, privacy-first dating**: users can be clear about what they want, choose how visible they are, and connect as individuals or consensually linked groups.

Do not copy competitor branding, wording, visual assets, proprietary ranking logic, or exact UI. Use these products as category references and develop original interaction design.

## 2. Profile model

Keep public profile information separate from sensitive account and preference data.

### 2.1 Public profile fields
- Display name or chosen name, age derived from verified date of birth, bio, approved photos, optional prompts and answers.
- Gender identity and pronouns, with user-controlled visibility.
- Sexual orientation, only if the user chooses to disclose it.
- Relationship style and intentions, selected from a reviewed, extensible taxonomy.
- Interests and optional desire tags, with per-field visibility.
- Approximate location only. Never expose coordinates, address, workplace, or exact distance.
- Verification status, without exposing verification evidence.

### 2.2 Relationship intentions
Support structured, multi-select values such as long-term relationship, dating and seeing where it goes, casual dating, friendship/social connection, monogamy, open relationship, ethical non-monogamy, polyamory, couple/partner-inclusive dating, group connection, and exploring/unsure. These are examples for a moderated catalogue, not assumptions about any member. Users can change them. Explain each term in a searchable glossary. Do not infer a person's relationship structure or consent from tags.

### 2.3 Desires and interests
Separate everyday interests from intimacy-related preferences. Allow optional tags, descriptions and visibility controls. Use a controlled catalogue with definitions, synonyms, moderation labels and locale support. Avoid free-text fields becoming an unmoderated explicit-content directory. Never use sensitive desire/orientation data for advertising or sell it.

## 3. Discovery modes and matching

Provide a simple mode switch, with a single underlying eligibility and safety engine:
1. **Swipe:** compact visual cards, like/pass, optional Super Like and undo.
2. **Intent match:** prioritise mutual relationship intentions, selected interests, preferred relationship structures and conversation preferences.
3. **Explore:** broader discovery for people who choose to show additional interests or relationship styles.

The user must understand why a profile appears. Show a small number of explainable compatibility signals, not a fabricated compatibility percentage.

### 3.1 Hard eligibility gates
- Both accounts are adults under the product's verified age policy.
- Both accounts are active, eligible and not suspended, banned or deleted.
- Mutual gender/orientation and age preferences are compatible.
- Visibility and discovery settings permit the impression.
- No block in either direction, active safety restriction, prior disqualifying pass, or other product exclusion.
- For linked/group profiles, every participant has an active consented link and the group is eligible.

Ranking must never override a hard gate, block, privacy setting or consent requirement.

### 3.2 Ranking signals
After eligibility, rank using configurable and testable signals: mutual preference compatibility; relationship-intention overlap; shared interests and optional desire-tag overlap; profile completeness and recent activity with anti-spam safeguards; distance bands rather than exact coordinates; and user-selected discovery mode with diversity/freshness controls.

Do not rank people by sensitive traits, inferred sexual behaviour, attractiveness proxies, wealth, or protected characteristics. Avoid feedback loops that permanently suppress new or less-active members. Keep ranking explainable and A/B tests privacy-safe.

## 4. Intentional conversation controls

Add a **First Move preference** to each member's settings:
- Open: either person may start after matching.
- Prompt-first: the first message must answer or react to a selected profile prompt.
- Match-specific opener: one member may send the first message for this match, based on a mutually understood rule.
- Conversation invitation: send a short invitation; the recipient accepts before the chat opens.

Do not hardcode a gender-based first-message rule. The match screen must explain who can start and why.

Optional response windows may remind members that a new match is waiting. Do not silently delete matches or penalise users for delayed replies. Provide notification controls and a grace/extend action where a timed interaction is explicitly enabled.

## 5. Pings and richer introductions

Offer a higher-intent introduction action: a member may send a Ping with an optional short note; recipients can disable notes, disable Pings, or limit who can send them; notes pass text moderation, rate limits and report controls; sending a Ping does not bypass blocks, privacy, match restrictions or consent; and repeated Pings after dismissal or rejection are prevented with a defined cooldown.

Do not make unsolicited explicit media a valid introduction mechanism.

## 6. Consensual linked profiles and group discovery

Treat linked profiles as a distinct feature, not a shared login.

### 6.1 Partner links
- Each participant has their own account, authentication, private settings, matches and direct conversations.
- Linking requires an invitation and explicit acceptance by both accounts.
- Each participant can see, approve, reject, pause or revoke the link independently.
- Show a clear linked indicator only when both participants have opted into public display.
- Unlinking immediately removes the association from discovery and future group actions. Preserve audit events and handle existing group matches according to a documented transition policy.
- Never let one partner edit the other's profile, send likes on their behalf, access their private chats, or change their visibility.

### 6.2 Group profiles and group matching
- A group is a consented collection of individual accounts, not a new identity that bypasses individual accountability.
- Each member must approve group visibility, group intent, group discovery and every group match.
- A group match is activated only after every required participant accepts.
- Display which members are included before a user likes or accepts a group.
- Provide individual block/report controls and a group-level report path.
- Group chat membership and media access are checked per participant.
- Removing a member or revoking consent must revoke their future access immediately and trigger a defined review of active group conversations.

Start with two-person linked profiles. Do not launch arbitrary multi-person groups until consent, matching, moderation, deletion and chat membership tests pass.

## 7. Privacy and media controls

### 7.1 Visibility controls
- Incognito: member can browse without appearing in discovery until they like/Ping someone, subject to a clear explanation.
- Hide from contacts: optional contact matching using privacy-preserving processing. Never upload a user's address book without explicit consent.
- Pause discovery: keep account and existing conversations while removing the profile from new discovery.
- Per-field visibility: members choose which optional identity, intention and interest fields appear publicly.
- Private photos: blurred placeholders to non-authorised viewers; access is granted only through an explicit request/approval flow and can be revoked.
- Approximate location: coarse distance bands only; no coordinate exposure or triangulation-friendly precision.

### 7.2 Media safety
- Warn before sending sensitive media and provide recipient controls.
- Optional sensitive-image blurring in chat, with a clear tap-to-reveal interaction.
- Report non-consensual media directly from the message.
- Expiring or one-view media may be considered only with clear limitations and server-side access expiry.
- Do not promise screenshot prevention. Platform capabilities differ, and recipients may use another device to capture content.
- Private media URLs must be short-lived or authenticated, and revocation must be enforced at the media delivery boundary. Keep the existing CDN Worker unchanged unless separately approved.

## 8. Trust, consent and moderation requirements

- Strict 18+ product access and age assurance appropriate to launch jurisdictions.
- Explicit opt-in for sensitive identity/desire fields, linked profiles, group discovery and private media access.
- Clear consent revocation and immediate enforcement across discovery, chat, calls and media.
- Report, block, unmatch, restrict and appeal controls available at the point of interaction.
- Moderation for profile text, prompts, Pings, media and group behaviour.
- Immutable audit events for moderator and administrator actions.
- No paid tier may remove or weaken report, block, consent, account security or baseline privacy protections.
- Sensitive identity, relationship and desire data must be access-restricted, encrypted where appropriate, excluded from logs/analytics payloads, and covered by export/deletion/retention policy.
- Complete jurisdictional legal and app-store policy review before enabling identity, relationship or media catalogues in each launch market. Do not assume one catalogue or policy is suitable worldwide.

## 9. Monetisation principles

Potential premium features include advanced discovery filters and saved filter sets; enhanced incognito controls; additional Pings or curated introductions with anti-spam limits; incoming-like visibility; private gallery capacity or enhanced media controls without weakening baseline safety; and aggregate, privacy-safe profile insights that do not use sensitive-trait profiling.

Keep core matching, blocking, reporting, consent revocation, account deletion, and basic privacy controls free. Clearly disclose subscription terms and renewal. Do not sell sensitive personal data.

## 10. Suggested data model

Logical entities, subject to reconciliation with the current MongoDB collection inventory:

| Entity | Purpose | Critical controls |
|---|---|---|
| profile_preferences | Age, distance, discovery mode, gender/orientation filters | Private, owner-only, validated |
| profile_intentions | Relationship style and goals | Optional, visibility per field |
| profile_tags | Interests and moderated desire tags | Catalogue IDs, visibility and moderation |
| first_move_preferences | Opener rules and prompt-first settings | Match-time snapshot, no gender assumptions |
| profile_links | Partner invitations and accepted links | Dual consent, revocation, audit |
| discovery_groups | Consented group membership and intent | Per-member approval and eligibility |
| group_match_consents | Each member's acceptance of a group match | All required consents before activation |
| pings | High-intent introductions and notes | Rate limit, moderation, block checks |
| private_media_grants | Private photo access grants | Owner approval, expiry/revocation |
| privacy_preferences | Incognito, pause, visibility and safety settings | Server-authoritative enforcement |
| moderation_events | Safety actions and decisions | Append-only audit, restricted access |

Do not create collections or migrations until the existing Worker database catalogue, actual Atlas indexes, duplicate data, backup/restore and rollback plan have been reviewed. Prefer additive schema evolution and backwards-compatible reads/writes.

## 11. API capability outline

Illustrative API domains, not claims that routes already exist:
- GET/PATCH profile preferences, intentions and tags.
- POST/accept/revoke profile-link invitations.
- POST group creation and per-member consents.
- POST Pings.
- POST/revoke private-media access grants.

All endpoints require authentication, schema validation, ownership checks, rate limits, audit where appropriate, and tests for IDOR and revoked access. Use the current API conventions after inspecting existing routes; do not create duplicate route families.

## 12. Delivery phases

### Phase 0: Product and safety foundation
- Confirm target countries, age assurance, legal review, app-store policy, supported identity/relationship taxonomy and content rules.
- Map existing profile, preference, like, match, chat, block and report schemas/routes.
- Define privacy classifications, retention and data export/deletion.
- Write threat model and authorization matrix.

### Phase 1: Intent-rich individual profiles
- Add optional relationship intentions, identity fields, interests and desire tags.
- Add glossary and per-field visibility.
- Add discovery filters and intent-based ranking signals.
- Preserve existing swipe, like, match and chat behaviour.
- Add analytics only for non-sensitive events and explicit consent where required.

### Phase 2: Intentional interactions and privacy
- Add first-move preferences, prompt-first introductions and Pings.
- Add incognito, pause discovery, hide-from-contacts with privacy-preserving design, and private-photo grants.
- Add sensitive-image blurring and non-consensual media reporting.

### Phase 3: Consensual partner links
- Invitation, acceptance, linked-profile visibility, unlinking and revocation.
- Individual and linked-profile discovery.
- Test all combinations of unlink, block, unmatch, suspension, deletion and active chats.

### Phase 4: Group discovery and group chat
- Group creation, member consent, group eligibility, all-member match acceptance and group chat.
- Per-member permissions, reporting, moderation and membership revocation.
- Load and abuse testing before general availability.

### Phase 5: Optimisation
- Improve ranking using measured relevance, fairness and safety outcomes.
- Run controlled experiments with opt-in, privacy-safe metrics.
- Tune paid features without paywalling safety or consent.

## 13. Acceptance criteria

- No user sees a profile that violates mutual preferences, blocks, visibility or age rules.
- A user can opt out of every optional sensitive profile field.
- Relationship tags never imply consent to a specific activity.
- First-move rules are clear, configurable and not gender-stereotyped.
- Pings cannot bypass blocks, rate limits or recipient controls.
- Linked profiles cannot be created or retained without both members' consent.
- A group match cannot activate until every required member consents.
- Revoking a link removes discovery visibility and revokes future group access.
- Private media is inaccessible without a current grant, including after revocation/expiry.
- Sensitive fields never leak through public profile APIs, logs, search indexes or analytics.
- Report/block/unmatch actions immediately restrict relevant contact paths.
- All high-risk flows have unit, integration, multi-account end-to-end and staging tests.
- Performance, moderation workload and abuse rates are measured before general release.

## 14. Release constraints

This roadmap is additive to the current platform. Preserve Cloudflare Pages/Workers, MongoDB Atlas as primary database, Firebase Realtime Database chat, and the existing CDN Worker. Do not introduce a new database or replace chat infrastructure to deliver these features. Keep all changes on migrate-to-serverless. Do not merge to main or deploy production without the required approval and release evidence.

## Phase 1 implementation update (2026-11-18)

The first private-preferences slice is implemented on `migrate-to-serverless`:
- Added authenticated `GET/PUT/DELETE /api/users/me/desires` routes backed by the existing `users` collection. No new collection or migration is introduced.
- The stored `relationshipPreferences` subdocument is private to its owner. Existing public profile serialization remains allowlist-based and deliberately excludes it.
- Writes require explicit consent, a valid date of birth showing age 18 or older, an active account, bounded selections from a server-side allowlist, and an account-scoped update rate limit when the Durable Object rate limiter is configured.
- Members can save relationship intentions, relationship styles, non-graphic desires/interests, curiosities and boundaries. Consent withdrawal deletes the complete subdocument.
- The profile editor states clearly that these answers are private and are not yet displayed on public profiles or discovery cards.
- Free-text fantasy descriptions, public visibility, match-only visibility, compatibility ranking and discovery filters are not part of this first slice. They require moderation, field-level authorization and reciprocal-eligibility work in the next phase.

This is source implementation, not proof of deployment. Run Worker tests and frontend tests, then deploy to staging and verify owner access, public-profile non-disclosure, age restrictions, consent withdrawal and existing profile/discovery regressions before enabling this capability for members.

## 2026-11-18 location-based discovery implementation

The first location slice uses browser geolocation only after the member selects **Use my current location** in Discover filters and grants the browser permission.

- GET /api/users/me/location reports whether location sharing is enabled and its last update time, without returning coordinates.
- PUT /api/users/me/location stores a GeoJSON Point in the existing users.location field and records locationSharing consent metadata. Coordinates are accepted only when valid and browser-reported accuracy is 5 km or better.
- DELETE /api/users/me/location revokes location sharing and removes GPS coordinates while preserving non-coordinate city/country metadata.
- Location writes are authenticated, account-restricted, adult-account checked and rate-limited to 12 updates per hour when the rate-limiter binding is configured.
- Distance filters require the viewer's explicit location opt-in and a location update no older than 24 hours. Candidate coordinates are used only when that candidate also opted in and updated within the previous 24 hours.
- The existing users.location 2dsphere index is reused. No new collection or CDN change is required.
- Public profile serialization does not return GPS coordinates. The legacy /api/geolocation helper now returns only coarse Cloudflare network location fields and no longer returns the visitor IP or IP-derived coordinates.

This is a foreground, user-triggered location refresh, not continuous background tracking. Browser permission and device location availability remain under the member's control. Exact coordinates remain private; no map pin, address, or exact distance is exposed. The first release uses GPS for distance eligibility/filtering and returns only coarse distance bands on discovery cards (for example, within 5 km or 15 to 30 km). Exact distances and coordinates are never returned. Travel-mode/commute preferences, city search, country/region fallback and privacy-preserving compatibility ranking remain follow-up work.

### Location safety requirements

- Do not use IP-derived location as a substitute for GPS consent.
- Do not expose coordinates through profile APIs, discovery payloads, logs, analytics or admin listings.
- Do not silently enable location sharing or continuously track in the background.
- Revoke must immediately remove GPS coordinates from the active profile record and disable distance-based discovery.
- Treat location as sensitive personal data and include it in account export/deletion and retention reviews.
- Before international rollout, review location consent copy, retention and data-protection requirements for each launch jurisdiction.

## 2026-11-18 Location Intelligence phase

Coarse profile-location filtering is now implemented independently of GPS consent:

- Discover filters accept optional city and country values, using case-insensitive literal substring matching against profile location metadata.
- These fields can be used without GPS sharing and do not change or retrieve the member's precise location.
- Search input is bounded to 100 characters and regex metacharacters are escaped so user input is treated literally.
- City and country filters combine with existing age, gender preference, relationship intent and other discovery filters.
- Discovery UI exposes city and country inputs and persists them through the existing per-user filter preference mechanism.
- The distance filter remains opt-in and only uses fresh, consented GPS data; coarse city/country search does not imply GPS permission.

Travel-mode preferences and location-aware compatibility scoring are not yet implemented. Any future proximity ranking must be transparent, optional, and avoid exposing exact distance or coordinates.