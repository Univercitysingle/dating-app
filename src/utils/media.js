const MEDIA_API_ORIGIN =
  process.env.REACT_APP_MEDIA_API_ORIGIN ||
  'https://dating-app-api-staging.enadoctemp.workers.dev';
const PLACEHOLDER_IMAGE = 'https://placehold.co/100x100';

const PHOTO_KEY_PATTERN =
  /^photos-[A-Za-z0-9_-]{1,128}-[A-Za-z0-9_-]{1,64}\.(?:jpg|jpeg|png|gif|webp)$/i;

const configuredCdn = String(process.env.REACT_APP_CDN_HOSTNAME || '').trim();
let CDN_BASE = '';
if (configuredCdn) {
  try {
    const candidate = new URL(/^https?:\/\//i.test(configuredCdn) ? configuredCdn : `https://${configuredCdn}`);
    if (candidate.protocol === 'https:' && !candidate.username && !candidate.password && !candidate.search && !candidate.hash) {
      CDN_BASE = candidate.toString().replace(/\/+$/, '');
    }
  } catch {
    CDN_BASE = '';
  }
}

export function extractPhotoKey(value) {
  if (!value) return '';
  let pathname = String(value).trim();

  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
    pathname = pathname.replace(/^\/+/, '');
    if (pathname.startsWith('api/media/')) pathname = pathname.slice('api/media/'.length);
    else if (pathname.startsWith('media/')) pathname = pathname.slice('media/'.length);
    pathname = decodeURIComponent(pathname);
  } catch {
    return '';
  }

  return PHOTO_KEY_PATTERN.test(pathname) ? pathname : '';
}

export function resolvePhotoUrl(value) {
  if (!value) return PLACEHOLDER_IMAGE;
  const key = extractPhotoKey(value);

  // Canonicalize legacy and relative photo URLs to the configured private-storage
  // proxy so every screen uses the same CDN host.
  if (key && CDN_BASE) return `${CDN_BASE}/${encodeURIComponent(key)}`;
  if (key) return `${MEDIA_API_ORIGIN}/api/media/${encodeURIComponent(key)}`;

  return value;
}

export function resolveWorkerPhotoUrl(value) {
  const key = extractPhotoKey(value);
  return key ? `${MEDIA_API_ORIGIN}/api/media/${encodeURIComponent(key)}` : '';
}

export { PLACEHOLDER_IMAGE };
