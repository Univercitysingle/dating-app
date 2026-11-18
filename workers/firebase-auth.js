const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const DEFAULT_JWKS_TTL_MS = 5 * 60 * 1000;
const MAX_JWKS_TTL_MS = 6 * 60 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5000;
const jwksCacheByFetcher = new WeakMap();

function getJwksCache(fetchImpl) {
  let cache = jwksCacheByFetcher.get(fetchImpl);
  if (!cache) {
    cache = new Map();
    jwksCacheByFetcher.set(fetchImpl, cache);
  }
  return cache;
}

function getJwksTtl(response) {
  const cacheControl = response.headers?.get?.("cache-control") || "";
  const match = cacheControl.match(/(?:^|,)\\s*max-age=(\\d+)/i);
  if (!match) return DEFAULT_JWKS_TTL_MS;
  return Math.min(Number(match[1]) * 1000, MAX_JWKS_TTL_MS);
}

async function fetchFirebaseJwks(fetchImpl, now, cache) {
  const cached = cache.get(JWKS_URL);
  if (cached && cached.expiresAt > now) return cached.keys;

  let pending = cached?.pending;
  if (!pending) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
    pending = (async () => {
      try {
        const response = await fetchImpl(JWKS_URL, {
          headers: { accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) throw new FirebaseKeyServiceError();
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.keys)) throw new FirebaseKeyServiceError();
        const ttl = getJwksTtl(response);
        cache.set(JWKS_URL, { keys: payload.keys, expiresAt: Date.now() + ttl });
        return payload.keys;
      } catch {
        throw new FirebaseKeyServiceError();
      } finally {
        clearTimeout(timeout);
      }
    })();
    cache.set(JWKS_URL, { ...(cached || {}), pending });
  }

  try {
    return await pending;
  } finally {
    const current = cache.get(JWKS_URL);
    if (current?.pending === pending) {
      const keys = current.keys;
      const expiresAt = current.expiresAt;
      if (keys && expiresAt > Date.now()) cache.set(JWKS_URL, { keys, expiresAt });
      else cache.delete(JWKS_URL);
    }
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

export class FirebaseTokenError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "FirebaseTokenError";
  }
}

export class FirebaseKeyServiceError extends Error {
  constructor() {
    super("Firebase signing key service unavailable");
    this.name = "FirebaseKeyServiceError";
  }
}

export async function verifyFirebaseIdToken(token, projectId, options = {}) {
  if (typeof token !== "string" || !token || typeof projectId !== "string" || !projectId) {
    throw new FirebaseTokenError();
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new FirebaseTokenError();

  let header;
  let claims;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
  } catch {
    throw new FirebaseTokenError();
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new FirebaseTokenError();
  }

  const fetchImpl = options.fetchImpl || fetch;
  const cache = options.jwksCache || getJwksCache(fetchImpl);
  const jwks = await fetchFirebaseJwks(fetchImpl, Date.now(), cache);
  const jwk = jwks.find((key) => key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256") || null;
  if (!jwk) throw new FirebaseTokenError();

  let validSignature = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    validSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
  } catch {
    throw new FirebaseTokenError();
  }
  if (!validSignature) throw new FirebaseTokenError();

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) || claims.exp <= now ||
    !Number.isFinite(claims.iat) || claims.iat > now ||
    !Number.isFinite(claims.auth_time) || claims.auth_time > now
  ) {
    throw new FirebaseTokenError();
  }

  return claims;
}

export async function authenticateFirebaseRequest(request, projectId, options = {}) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) throw new FirebaseTokenError();
  return verifyFirebaseIdToken(match[1], projectId, options);
}
