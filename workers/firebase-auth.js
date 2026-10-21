const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

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
  let response;
  try {
    response = await fetchImpl(JWKS_URL, { headers: { accept: "application/json" } });
  } catch {
    throw new FirebaseKeyServiceError();
  }
  if (!response.ok) throw new FirebaseKeyServiceError();

  let jwks;
  try {
    jwks = await response.json();
  } catch {
    throw new FirebaseKeyServiceError();
  }
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256") : null;
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
