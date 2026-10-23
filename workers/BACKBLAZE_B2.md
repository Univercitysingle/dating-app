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
