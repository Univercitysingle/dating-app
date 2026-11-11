# CDN_HOSTNAME private media storage

The dating-app Worker must use only the `CDN_HOSTNAME` setting for profile-photo storage operations. The CDN hostname points to the separate private-storage proxy, which owns the Backblaze B2 credentials and performs object reads, writes, and deletes. Do not configure B2/S3 credentials in the dating-app Worker or GitHub Actions workflow.

## Configuration

Set the GitHub Actions secret `CDN_HOSTNAME` to the HTTPS origin of the private storage proxy, for example:

```text
https://dateme.enadoctemp.workers.dev/
```

The staging workflow passes this setting to `dating-app-api-staging`. The API Worker sends `PUT`, `GET`, and `DELETE` requests to the proxy's root-level object URL (`<CDN_HOSTNAME>/<object-key>`). New profile URLs are returned in that same root-level form so they never point at the Pages domain or the API Worker.

## Validation

The staging workflow performs a temporary JPEG write/read/delete check against `CDN_HOSTNAME`. The check fails deployment if any storage operation fails or the downloaded bytes differ. After deployment, test an authenticated profile upload and verify:
- the upload response returns a CDN-hosted `cdnUrl`;
- the image loads from the CDN hostname on the profile and discovery pages;
- removing a photo deletes the object through the proxy;
- unauthenticated upload attempts and cross-user photo operations remain rejected.

The CDN proxy must accept `PUT`, `GET`, and `DELETE` on generated `photos-...` object paths. Keep the B2 bucket private and keep all B2 credentials inside the proxy service only.


## Current operational status (2026-11-11)

This guide documents the existing private-media proxy contract. The dating-app API uses `CDN_HOSTNAME` and the Cloudflare service binding to reach the separate CDN Worker; Backblaze credentials remain exclusively in that proxy. The CDN Worker, B2 bucket configuration, object naming and proxy authentication are outside this documentation update and must not be changed as part of ordinary app work. Source-level tests and workflow checks do not prove the live CDN deployment is healthy. Validate authenticated upload, read, delete, cross-user denial and support-attachment access against staging before marking media acceptance complete. Do not expose private bucket credentials, object authorization tokens or user media URLs in logs.


## Evidence freshness and closure criteria (2026-11-11)

Findings and operational statements remain open until a named owner supplies reproducible evidence, the reviewer confirms the result, and the exact commit/deployment revision is recorded. Classify findings by severity and exploitability, document affected component and preconditions, provide a safe reproduction or test identifier, remediation, compensating control, residual risk, due date, and retest outcome. Do not include secrets, raw user evidence, payment credentials, or private object URLs. A code fix without a deployed retest is not a closed finding. For storage/CDN operations, preserve the existing CDN Worker boundary and do not change CDN behaviour under this documentation update.
