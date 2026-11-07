import { authenticateFirebaseRequest, FirebaseTokenError, FirebaseKeyServiceError } from "./firebase-auth.js";
import { Buffer } from "node:buffer";
import { constants, createPublicKey, createSign, publicDecrypt, publicEncrypt, timingSafeEqual } from "node:crypto";


function isCdnConfigured(env) {
  return Boolean(String(env.CDN_HOSTNAME || "").trim());
}

function darkFantasyRegionGate(request, env) {
  if (String(env.DARK_FANTASY_ENABLED || "").toLowerCase() !== "true") {
    return json({ error: "Dark Fantasy is not currently available." }, 404);
  }
  const setting = String(env.DARK_FANTASY_ALLOWED_COUNTRIES || "").trim().toUpperCase();
  if (setting === "*") return null;
  const allowed = setting.split(",").map(value => value.trim()).filter(value => /^[A-Z]{2}$/.test(value));
  const country = String(request.cf?.country || "").toUpperCase();
  if (!allowed.length || !country || !allowed.includes(country)) {
    return json({ error: "Dark Fantasy is not available in this region." }, 404);
  }
  return null;
}

// This only selects a connection Durable Object. Authentication is still verified
// by each API route before any protected operation is executed.
export function getMongoShardName(request, env = {}) {
  const authorization = request?.headers?.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+([A-Za-z0-9._-]+)$/i)?.[1];
  if (!token) return "mongo-primary";

  let uid;
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return "mongo-primary";
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    uid = typeof claims.sub === "string" ? claims.sub
      : typeof claims.user_id === "string" ? claims.user_id
        : typeof claims.uid === "string" ? claims.uid : null;
  } catch {
    return "mongo-primary";
  }

  if (!uid || uid.length > 256) return "mongo-primary";
  const configured = Number(env.MONGODB_CONNECTION_SHARDS);
  const shardCount = Number.isInteger(configured) && configured >= 1 && configured <= 16
    ? configured : 4;
  let hash = 2166136261;
  for (let index = 0; index < uid.length; index += 1) {
    hash ^= uid.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return "mongo-shard-" + ((hash >>> 0) % shardCount);
}

export function isFirebaseDatabaseUrl(value) {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const allowedHost = hostname === "firebaseio.com" ||
      hostname.endsWith(".firebaseio.com") ||
      hostname === "firebasedatabase.app" ||
      hostname.endsWith(".firebasedatabase.app");
    return parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      allowedHost;
  } catch {
    return false;
  }
}

export function normalizeAdminPurchaseActionPayload(action, payload) {
  if (action === "approve" && (payload === null || payload === undefined)) return {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cross-origin-resource-policy": "same-origin"
};

export function buildAnalyticsCsv(signups) {
  if (!Array.isArray(signups)) return null;
  const csvCell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  return [
    ["date", "new_signups"].join(","),
    ...signups.map(item => [csvCell(item?._id || ""), String(Number(item?.count) || 0)].join(","))
  ].join("\n");
}

function getCdnObjectUrl(env, key, route = "root") {
  const configured = String(env.CDN_HOSTNAME || "").trim();
  if (!configured) throw new Error("CDN_HOSTNAME is not configured");
  const base = new URL(/^https?:\/\//i.test(configured) ? configured : "https://" + configured);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("CDN_HOSTNAME must be an HTTPS proxy URL without credentials or query parameters");
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  const objectPath = route === "api" ? "/api/media/" : "/";
  base.pathname = prefix + objectPath + encodeURIComponent(key);
  return base.toString();
}



function base64UrlEncodeJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createCdnAuthorizationToken(env, claims, key, method) {
  const secret = String(env.JWT_SECRET || "");
  if (secret.length < 32) {
    throw new Error("CDN JWT_SECRET is missing or shorter than 32 characters");
  }
  if (!claims || typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)) {
    throw new Error("A valid authenticated Firebase user ID is required for CDN authorization");
  }
  if (method !== "PUT" && method !== "DELETE") {
    throw new Error("CDN authorization only permits PUT and DELETE");
  }
  const photoKey = new RegExp("^photos-" + claims.sub + "-[0-9]{10,16}\\.(?:jpg|jpeg|png|gif|webp)$", "i");
  const supportKey = /^support-[a-fA-F0-9]{24}-[0-9]{10,16}-[a-f0-9-]{36}\.(?:jpg|jpeg|png|gif|webp|pdf)$/i;
  if (!(photoKey.test(key) || (typeof key === "string" && supportKey.test(key)))) {
    throw new Error("CDN object key is not an allowed application upload key");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlEncodeJson({
    sub: claims.sub,
    iss: "dating-app-api",
    aud: "dateme-cdn",
    key,
    method,
    iat: now,
    nbf: now - 5,
    exp: now + 60
  });
  const unsigned = header + "." + payload;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  const signatureB64 = btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return unsigned + "." + signatureB64;
}

export async function requestCdnObject(env, key, method, headers, body, claims) {
  // Use a Cloudflare Service Binding for Worker-to-Worker traffic. Calling
  // the public workers.dev hostname from another Worker can fail with 1042.
  // CDN_HOSTNAME remains the public URL used by browsers for image retrieval.
  const token = await createCdnAuthorizationToken(env, claims, key, method);
  const requestHeaders = new Headers(headers || {});
  requestHeaders.set("Authorization", "Bearer " + token);
  const targetUrl = getCdnObjectUrl(env, key, "root");
  const init = {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body })
  };

  if (!env.CDN_PROXY || typeof env.CDN_PROXY.fetch !== "function") {
    throw new Error("CDN_PROXY service binding is not configured");
  }

  return env.CDN_PROXY.fetch(new Request(targetUrl, init));
}

function getAppMediaUrl(env, key) {
  // Profile URLs must point directly at the configured CDN proxy, never Pages/API.
  return getCdnObjectUrl(env, key, "root");
}

function normalizeWebXPayPublicKey(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("WebXPay public key is not configured");
  let key = value.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  return key.replace(/\\n/g, "\n");
}



function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function createSuperadminCustomToken(env, email, password) {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD_HASH || !env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Superadmin login is not configured");
  }
  const configuredEmail = String(env.SUPER_ADMIN_EMAIL).trim().toLowerCase();
  if (typeof email !== "string" || email.trim().toLowerCase() !== configuredEmail ||
      typeof password !== "string" || password.length < 1 || password.length > 1024) {
    return null;
  }
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule;
  const hashMatches = await bcrypt.compare(password, env.SUPER_ADMIN_PASSWORD_HASH);
  if (!hashMatches) return null;
  let serviceAccount;
  try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error("Firebase service account configuration is invalid"); }
  if (typeof serviceAccount.client_email !== "string" || typeof serviceAccount.private_key !== "string" ||
      !serviceAccount.private_key.includes("PRIVATE KEY")) {
    throw new Error("Firebase service account configuration is invalid");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlJson({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid: "superadmin_uid",
    role: "superadmin"
  });
  const unsigned = header + "." + claims;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return unsigned + "." + signer.sign(serviceAccount.private_key, "base64url");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function buildWebXPayCheckoutForm(order, env, returnPath, itemDescription = "") {
  if (!env.WEBXPAY_PUBLIC_KEY || !env.WEBXPAY_SECRET_KEY || !env.FRONTEND_URL) {
    throw new Error("WebXPay payment configuration is incomplete");
  }
  const publicKey = createPublicKey(normalizeWebXPayPublicKey(env.WEBXPAY_PUBLIC_KEY));
  const frontend = new URL(env.FRONTEND_URL);
  if (frontend.protocol !== "https:" && frontend.hostname !== "localhost") {
    throw new Error("FRONTEND_URL must use HTTPS");
  }
  const returnUrl = new URL(returnPath, frontend);
  returnUrl.searchParams.set("purchaseId", order.orderId);
  const encryptedPayment = publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(order.orderId + "|" + String(order.price), "utf8")).toString("base64");
  const user = order.user || {};
  const nameParts = String(user.name || "User").trim().split(/\s+/);
  const fields = [
    ["first_name", nameParts[0] || "User"],
    ["last_name", nameParts.slice(1).join(" ") || nameParts[0] || "User"],
    ["email", user.email || ""],
    ["contact_number", user.contactNumber || "0711234567"],
    ["address_line_one", "N/A"],
    ["process_currency", "LKR"],
    ["cms", "PHP"],
    ["enc_method", "JCs3J+6oSz4V0LgE0zi/Bg=="],
    ["secret_key", String(env.WEBXPAY_SECRET_KEY).trim()],
    ["return_url", returnUrl.toString()],
    ["custom_fields", ""],
    ["payment", encryptedPayment]
  ];
  const nonce = crypto.randomUUID();
  const inputs = fields.map(([name, value]) =>
    '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '">'
  ).join("\n");
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Redirecting to secure payment</title></head><body>' +
    '<p>Redirecting to WebXPay securely…</p>' +
    '<form action="https://stagingxpay.info/index.php?route=checkout/billing" id="webxpay-form" data-order-id="' + escapeHtml(order.orderId) + '" method="post">' +
    inputs + '</form><script nonce="' + nonce + '">document.getElementById("webxpay-form").submit();</script></body></html>';
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; form-action https://stagingxpay.info; script-src 'nonce-" + nonce + "'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin"
    }
  });
}

export { buildWebXPayCheckoutForm };

async function readWebXPayCallback(request) {
  const raw = await request.text();
  if (!raw || raw.length > 65536) return null;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  const params = new URLSearchParams(raw);
  return {
    payment: params.get("payment"),
    signature: params.get("signature"),
    custom_fields: params.get("custom_fields")
  };
}

function verifyWebXPayCallback(payment, signature, configuredPublicKey) {
  if (typeof payment !== "string" || typeof signature !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(payment) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return null;
  const encodedPayment = Buffer.from(payment, "base64");
  const encodedSignature = Buffer.from(signature, "base64");
  if (!encodedPayment.length || !encodedSignature.length) return null;
  const publicKey = createPublicKey(normalizeWebXPayPublicKey(configuredPublicKey));
  // WEBXPAY signs both callback values with its private key. Decode and
  // public-decrypt each value before comparing their plaintext payloads.
  const paymentBytes = publicDecrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_PADDING
  }, encodedPayment);
  const signatureBytes = publicDecrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_PADDING
  }, encodedSignature);
  if (signatureBytes.length !== paymentBytes.length || !timingSafeEqual(signatureBytes, paymentBytes)) return null;
  return paymentBytes.toString("utf8");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function enforceAccountRateLimit(env, scope, uid, limit, windowMs, message) {
  if (!env.RATE_LIMITER) return json({ error: "Abuse protection is unavailable. Please retry later." }, 503);
  try {
    const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(scope + ":" + uid));
    const response = await limiter.fetch("https://rate-limiter.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: scope, limit, windowMs })
    });
    if (!response.ok) return json({ error: "Abuse protection is temporarily unavailable." }, 503);
    const result = await response.json();
    if (result.allowed) return null;
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return new Response(JSON.stringify({ error: message }), {
      status: 429,
      headers: { ...JSON_HEADERS, "retry-after": String(retryAfter) }
    });
  } catch {
    return json({ error: "Abuse protection is temporarily unavailable." }, 503);
  }
}

export class RateLimiter {
  constructor(state) { this.state = state; }

  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.key !== "string" || !body.key || body.key.length > 256) {
      return json({ error: "A valid key is required" }, 400);
    }

    const now = Date.now();
    const windowMs = Number.isInteger(body.windowMs) && body.windowMs >= 1000 && body.windowMs <= 86400000 ? body.windowMs : 60000;
    const limit = Number.isInteger(body.limit) && body.limit >= 1 && body.limit <= 10000 ? body.limit : 60;
    const increment = async (storage) => {
      const record = (await storage.get(body.key)) || { count: 0, resetAt: now + windowMs };
      const current = record.resetAt <= now ? { count: 0, resetAt: now + windowMs } : record;
      current.count += 1;
      await storage.put(body.key, current);
      return current;
    };
    // Durable Object storage transactions prevent concurrent requests from
    // overwriting each other's counters at the limit boundary.
    const current = typeof this.state.storage.transaction === "function"
      ? await this.state.storage.transaction(increment)
      : await increment(this.state.storage);
    return json({ allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt });
  }
}

// Deploy this Worker together with MongoDBConnection changes so staging uses the same tested bundle.
export { MongoDBConnection } from "./mongodb-connection.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Apply a per-client edge limit to API traffic. Cloudflare supplies
    // CF-Connecting-IP; do not trust caller-controlled X-Forwarded-For.
    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/calls/") && request.method !== "OPTIONS" && env.RATE_LIMITER) {
      const clientIp = request.headers.get("CF-Connecting-IP");
      if (clientIp) {
        try {
          const limiterId = env.RATE_LIMITER.idFromName("api-ip:" + clientIp);
          const limiter = env.RATE_LIMITER.get(limiterId);
          const rateResponse = await limiter.fetch("https://rate-limiter.internal/check", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "api", limit: 120, windowMs: 60000 })
          });
          if (!rateResponse.ok) return json({ error: "Request rate limit service unavailable" }, 503);
          const rate = await rateResponse.json();
          if (!rate.allowed) {
            const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
            return new Response(JSON.stringify({ error: "Too many requests. Please retry shortly." }), {
              status: 429,
              headers: { ...JSON_HEADERS, "retry-after": String(retryAfter) }
            });
          }
        } catch {
          return json({ error: "Request rate limit service unavailable" }, 503);
        }
      }
    }

    // Keep the API origin useful when opened directly, without implying that
    // this backend URL is the React login page.
    if (url.pathname === "/" && request.method === "GET") {
      return json({
        service: "dating-app-api",
        stage: env.MIGRATION_STAGE || "unknown",
        status: "ok",
        frontend: "not_served_by_this_worker"
      });
    }
    if (url.pathname === "/favicon.ico" && request.method === "GET") {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "strict-transport-security": "max-age=31536000; includeSubDomains", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" } });
    }

    // Search crawlers should not index this API origin. Return an explicit
    // public robots policy instead of falling through to the legacy 501 route.
    if (url.pathname === "/robots.txt") {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
      return new Response(request.method === "HEAD" ? null : "User-agent: *\nDisallow: /\n", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "pragma": "no-cache",
          "expires": "0",
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "x-content-type-options": "nosniff",
          "cross-origin-resource-policy": "same-origin"
        }
      });
    }
    if (url.pathname === "/sitemap.xml") {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: JSON_HEADERS
      });
    }

    // Serve profile photos only through the dedicated CDN/private-storage proxy.
    // The dating-app API Worker never accesses Backblaze credentials or object bytes.
    const mediaMatch = url.pathname.match(/^\/(?:api\/media|media)\/([^/]+)$/) ||
      url.pathname.match(/^\/(photos-[A-Za-z0-9_-]{1,128}-[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|gif|webp))$/i);
    if (mediaMatch) {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
      let key;
      try { key = decodeURIComponent(mediaMatch[1]); }
      catch { return json({ error: "Invalid media key" }, 400); }
      if (!/^photos-[A-Za-z0-9_-]{1,128}-[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|gif|webp)$/i.test(key)) {
        return json({ error: "Media not found" }, 404);
      }
      if (!isCdnConfigured(env)) return json({ error: "Media storage unavailable" }, 503);
      return new Response(null, {
        status: 302,
        headers: {
          location: getAppMediaUrl(env, key),
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", service: "dating-app-api", stage: env.MIGRATION_STAGE || "unknown" });
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      const missing = ["FIREBASE_PROJECT_ID", "MONGODB_URI"].filter((key) => !env[key]);
      if (missing.length) {
        return json({ status: "not_ready", missingConfiguration: missing }, 503);
      }

      if (!env.MONGODB_CONNECTION) {
        return json({ status: "not_ready", reason: "MongoDB connectivity probe is unavailable" }, 503);
      }

      try {
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const probe = await connection.fetch("https://internal.invalid/internal/ping", { method: "POST" });
        if (!probe.ok) {
          return json({ status: "not_ready", dependencies: { mongodb: "unavailable" } }, 503);
        }
        return json({ status: "ready", dependencies: { mongodb: "ok", firebase: "configuration_present" } });
      } catch {
        return json({ status: "not_ready", dependencies: { mongodb: "unavailable" } }, 503);
      }
    }

    if (url.pathname === "/api/auth/set-initial-password") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Password setup service unavailable" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload.newPassword !== "string") return json({ error: "Password must be at least 6 characters long." }, 400);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/set-initial-password", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, newPassword: payload.newPassword })
        });
        const body = await response.json().catch(() => ({ error: "Password setup service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Password setup service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/auth/login") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return json({ error: "Request must contain either a Firebase token or email/password." }, 400);
      }
      if (payload.email || payload.password) {
        // Add a tighter brute-force limit specifically for password-based
        // administrator authentication, separate from the general API quota.
        const clientIp = request.headers.get("CF-Connecting-IP");
        if (env.RATE_LIMITER && clientIp) {
          try {
            const limiterId = env.RATE_LIMITER.idFromName("api-ip:" + clientIp);
            const limiter = env.RATE_LIMITER.get(limiterId);
            const rateResponse = await limiter.fetch("https://rate-limiter.internal/check", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ key: "superadmin-login", limit: 5, windowMs: 900000 })
            });
            if (!rateResponse.ok) return json({ error: "Login protection service unavailable" }, 503);
            const rate = await rateResponse.json();
            if (!rate.allowed) {
              const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
              return new Response(JSON.stringify({ error: "Too many administrator login attempts. Please try again later." }), {
                status: 429,
                headers: { ...JSON_HEADERS, "retry-after": String(retryAfter) }
              });
            }
          } catch {
            return json({ error: "Login protection service unavailable" }, 503);
          }
        }
        try {
          const token = await createSuperadminCustomToken(env, payload.email, payload.password);
          if (!token) return json({ error: "Invalid credentials" }, 401);
          if (!env.MONGODB_CONNECTION) return json({ error: "Superadmin account service unavailable" }, 503);
          const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
          const connection = env.MONGODB_CONNECTION.get(id);
          const provisionResponse = await connection.fetch("https://internal.invalid/internal/superadmin-provision", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: String(env.SUPER_ADMIN_EMAIL).trim() })
          });
          const provisionResult = await provisionResponse.json().catch(() => ({ error: "Superadmin account service unavailable" }));
          if (!provisionResponse.ok) return json(provisionResult, provisionResponse.status);
          return json({
            token,
            user: {
              uid: "superadmin_uid",
              email: String(env.SUPER_ADMIN_EMAIL).trim(),
              name: "Super Admin",
              role: "superadmin",
              isPremium: true,
              isOnboardingComplete: true
            }
          });
        } catch {
          return json({ error: "Password-based administrator login is not configured" }, 503);
        }
      }
      if (typeof payload.token !== "string" || !payload.token || payload.token.length > 10000) {
        return json({ error: "Request must contain either a Firebase token or email/password." }, 400);
      }
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      try {
        const authRequest = new Request(request.url, {
          method: "GET",
          headers: { authorization: "Bearer " + payload.token }
        });
        const claims = await authenticateFirebaseRequest(authRequest, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/profile", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims })
        });
        const user = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        if (!response.ok) return json(user, response.status);
        const responsePayload = { token: payload.token, user };
        if (user.mustSetPassword === true) responsePayload.requiresPasswordSetup = true;
        return json(responsePayload);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Invalid or expired token" }, 401);
        return json({ error: "An unexpected error occurred during login." }, 500);
      }
    }

    // Preserve the legacy, non-sensitive auth diagnostic route for deployments
    // and smoke tests. It deliberately returns no environment or identity data.
    if (url.pathname === "/api/auth/test") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return new Response("Auth test route is working", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "cross-origin-resource-policy": "same-origin" }
      });
    }

    // The legacy Express logout endpoint is stateless: the client clears its
    // Firebase session/token. Keep the response contract for existing clients.
    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return json({ message: "Logged out successfully." });
    }

    if (url.pathname === "/api/geolocation") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const ip = request.headers.get("CF-Connecting-IP") || "";
        const isPrivateIp = /^(::1|127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
        if (isPrivateIp || !ip) {
          return json({ ip, city: "Private Network", country: "N/A" });
        }
        const cf = request.cf || {};
        const city = typeof cf.city === "string" ? cf.city : "";
        const region = typeof cf.region === "string" ? cf.region : "";
        const country = typeof cf.country === "string" ? cf.country : "";
        if (!city && !region && !country) return json({ error: "Geolocation data not found." }, 404);
        return json({ ip, city, region, country, loc: cf.latitude && cf.longitude ? cf.latitude + "," + cf.longitude : undefined, timezone: typeof cf.timezone === "string" ? cf.timezone : undefined });
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Geolocation service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/auth/verify") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        return json({
          authenticated: true,
          uid: claims.sub,
          emailVerified: claims.email_verified === true
        });
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Authentication service unavailable" }, 503);
      }
    }


    if (url.pathname === "/api/users/me") {
      if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const payload = request.method === "PUT" ? await request.json().catch(() => null) : null;
        if (request.method === "PUT" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
          return json({ error: "A JSON profile object is required" }, 400);
        }
        const response = await connection.fetch("https://internal.invalid/internal/profile", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(request.method === "PUT" ? { claims, update: payload } : { claims })
        });
        const body = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Profile service unavailable" }, 503);
      }
    }


    if (url.pathname === "/api/swipe/undo") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Swipe service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        // undoSwipe performs a legacy subscription-index migration. Keep this
        // one-time index maintenance on the primary connection to avoid races
        // while the other user requests use the connection shards.
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/undo-swipe", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims })
        });
        const body = await response.json().catch(() => ({ error: "Swipe service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Swipe service unavailable" }, 503);
      }
    }

    const swipeAction = url.pathname.match(/^\/api\/swipe\/(like|pass|superlike)$/);
    if (swipeAction) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Swipe service unavailable" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload.userId !== "string" || !payload.userId || payload.userId.length > 128) {
        return json({ error: "A valid userId is required" }, 400);
      }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (env.RATE_LIMITER) {
          const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName("swipe-user:" + claims.sub));
          const rateResponse = await limiter.fetch("https://rate-limiter.internal/check", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "swipe", limit: 100, windowMs: 60 * 60 * 1000 })
          });
          if (!rateResponse.ok) return json({ error: "Swipe rate limit service unavailable" }, 503);
          const rate = await rateResponse.json();
          if (!rate.allowed) return new Response(JSON.stringify({ error: "Swipe limit reached. Please retry later." }), {
            status: 429, headers: { ...JSON_HEADERS, "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) }
          });
        }
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/swipe", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, targetUid: payload.userId, action: swipeAction[1] })
        });
        const body = await response.json().catch(() => ({ error: "Swipe service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Swipe service unavailable" }, 503);
      }
    }

    const legacyMatchLike = url.pathname.match(/^\/api\/matches\/like\/([^/]+)$/);
    if (legacyMatchLike) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Match service unavailable" }, 503);
      let targetUid;
      try { targetUid = decodeURIComponent(legacyMatchLike[1]); } catch { return json({ error: "Invalid user ID" }, 400); }
      if (!targetUid || targetUid.length > 128) return json({ error: "Invalid user ID" }, 400);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/swipe", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, targetUid, action: "like", canonical: true })
        });
        const match = await response.json().catch(() => ({ error: "Match service unavailable" }));
        if (!response.ok) return json(match, response.status);
        return json({
          status: match.status,
          likedBy: match.likedBy,
          matchId: match._id,
          user1Uid: match.user1Uid,
          user2Uid: match.user2Uid
        }, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Match service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/notification-preferences") {
      if (!["GET", "PUT"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Notification preferences unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const payload = request.method === "PUT" ? await request.json().catch(() => null) : null;
        if (request.method === "PUT" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
          return json({ error: "Invalid notification preferences" }, 400);
        }
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/notification-preferences", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, preferences: payload })
        });
        const body = await response.json().catch(() => ({ error: "Notification preferences unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Notification preferences unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/notifications") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Notification service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/notifications", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims })
        });
        const body = await response.json().catch(() => ({ error: "Notification service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Notification service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/matches" || url.pathname === "/api/matches/confirmed") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Match service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const isConfirmed = url.pathname === "/api/matches/confirmed";
        const response = await connection.fetch("https://internal.invalid/" + (isConfirmed ? "internal/confirmed-matches" : "internal/potential-matches"), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, filters: Object.fromEntries(url.searchParams.entries()) })
        });
        const body = await response.json().catch(() => ({ error: "Match service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Match service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/users/discover") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const filters = Object.fromEntries(url.searchParams.entries());
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/discover", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, filters })
        });
        const body = await response.json().catch(() => ({ error: "Discovery service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        console.error("Discovery route failed", {
          name: error && typeof error.name === "string" ? error.name : "Error",
          message: error && typeof error.message === "string" ? error.message.slice(0, 240) : undefined
        });
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Discovery service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/users/me/subscriptions") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/subscriptions", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims })
        });
        const body = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Profile service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/users/likes") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/likes", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims })
        });
        const body = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Profile service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/support-attachments" && request.method === "POST") {
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!isCdnConfigured(env)) return json({ message: "Attachment storage is not configured (CDN_HOSTNAME is missing)" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        // Apply an account-scoped quota in addition to the general edge/IP limit.
        // This prevents repeated uploads by the same account across changing IPs.
        if (env.RATE_LIMITER) {
          const limiterId = env.RATE_LIMITER.idFromName("support-upload-user:" + claims.sub);
          const limiter = env.RATE_LIMITER.get(limiterId);
          const rateResponse = await limiter.fetch("https://rate-limiter.internal/check", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "support-upload", limit: 10, windowMs: 60 * 60 * 1000 })
          });
          if (!rateResponse.ok) return json({ message: "Support attachment rate limit service unavailable" }, 503);
          const rate = await rateResponse.json();
          if (!rate.allowed) return new Response(JSON.stringify({ message: "Support attachment upload limit reached. Please retry later." }), {
            status: 429, headers: { ...JSON_HEADERS, "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) }
          });
        }
        const form = await request.formData().catch(() => null);
        const file = form && form.get("file");
        const ticketId = form && form.get("ticketId");
        const allowedTypes = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "application/pdf": "pdf" };
        if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId)) return json({ message: "A valid ticket ID is required" }, 400);
        if (!file || typeof file.arrayBuffer !== "function" || !allowedTypes[file.type]) return json({ message: "Attach a JPEG, PNG, GIF, WebP image, or PDF" }, 400);
        if (file.size < 1 || file.size > 10 * 1024 * 1024) return json({ message: "Each attachment must be 10 MB or smaller" }, 400);
        if (!env.MONGODB_CONNECTION) return json({ message: "Support ticket service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const check = async (path) => {
          const response = await connection.fetch("https://internal.invalid" + path, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, ticketId })
          });
          return response.ok;
        };
        const ownsTicket = await check("/internal/support-ticket");
        const isAdmin = ownsTicket ? false : await check("/internal/admin/support-ticket");
        if (!ownsTicket && !isAdmin) return json({ message: "Ticket not found or you do not have permission to attach files" }, 403);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const validSignature = file.type === "application/pdf"
          ? bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
          : file.type === "image/jpeg" ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          : file.type === "image/png" ? bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
          : file.type === "image/gif" ? bytes.length >= 6 && ["GIF89a", "GIF87a"].includes(String.fromCharCode(...bytes.slice(0, 6)))
          : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
        if (!validSignature) return json({ message: "The file contents do not match the selected file type" }, 400);
        const key = "support-" + ticketId + "-" + Date.now() + "-" + crypto.randomUUID() + "." + allowedTypes[file.type];
        const proxyUrl = getCdnObjectUrl(env, key, "root");
        const frontendOrigin = env.FRONTEND_URL ? new URL(env.FRONTEND_URL).origin : url.origin;
        const upload = await requestCdnObject(env, key, "PUT", { "Content-Type": file.type, "Origin": frontendOrigin }, bytes, claims);
        if (!upload.ok) {
          const detail = await upload.text().catch(() => "");
          console.error("Support attachment upload failed", { status: upload.status, detail: detail.slice(0, 120) });
          return json({ message: "Attachment storage rejected the upload", proxyStatus: upload.status }, 502);
        }
        return json({ attachment: { key, url: proxyUrl, name: String(file.name || "attachment").replace(/[\\/\\r\\n]/g, "_").slice(0, 180), type: file.type, size: file.size } }, 201);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        console.error("Support attachment upload failed", { message: String(error && error.message || "unknown").slice(0, 160) });
        return json({ message: "Support attachment upload failed" }, 503);
      }
    }

    if (url.pathname === "/api/users/photos" && request.method === "POST") {
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const uploadLimit = await enforceAccountRateLimit(
          env,
          "photo-upload-user",
          claims.sub,
          10,
          60 * 60 * 1000,
          "Photo upload limit reached. Please retry later."
        );
        if (uploadLimit) return uploadLimit;
        // Upload bytes through the CDN proxy configured by CDN_HOSTNAME; keep this
        // API route for Firebase authentication and profile metadata updates.
        if (!isCdnConfigured(env)) {
          return json({ message: "Photo CDN is not configured (CDN_HOSTNAME is missing)" }, 503);
        }
        const form = await request.formData().catch(() => null);
        const file = form && form.get("photo");
        const allowedTypes = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
        if (!file || typeof file.arrayBuffer !== "function" || !allowedTypes[file.type]) {
          return json({ message: "A JPEG, PNG, GIF, or WebP photo is required" }, 400);
        }
        if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ message: "Photo must be 5 MB or smaller" }, 400);
        if (typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)) return json({ message: "Invalid user identity" }, 400);
        const fileBytes = await file.arrayBuffer();
        const bytes = new Uint8Array(fileBytes);
        const isJpeg = file.type === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isPng = file.type === "image/png" && bytes.length >= 8 &&
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
          bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
        const isGif = file.type === "image/gif" && bytes.length >= 6 &&
          (String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a" || String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a");
        const isWebp = file.type === "image/webp" && bytes.length >= 12 &&
          String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
        if (!isJpeg && !isPng && !isGif && !isWebp) return json({ message: "File content does not match an allowed image type" }, 400);
        // Keep the legacy CDN proxy object-key format (UID + millisecond timestamp).
        // The deployed media proxy accepts timestamp keys; UUID suffixes are rejected by its route validation.
        const key = "photos-" + claims.sub + "-" + Date.now() + "." + allowedTypes[file.type];
        let cdnUrl;
        let proxyStatus;
        try {
          // The existing CDN proxy accepts PUT /<object-key> and signs the B2
          // request itself. Keep B2 credentials out of this API Worker.
          const proxyUrl = getCdnObjectUrl(env, key, "root");
          const frontendOrigin = env.FRONTEND_URL ? new URL(env.FRONTEND_URL).origin : url.origin;
          const proxyResponse = await requestCdnObject(env, key, "PUT", {
            "Content-Type": file.type,
            // The proxy allowlists the staging frontend and API Worker origins.
            "Origin": frontendOrigin
          }, fileBytes, claims);
          proxyStatus = proxyResponse.status;
          if (!proxyResponse.ok) {
            const proxyError = await proxyResponse.text().catch(() => "");
            throw new Error("CDN proxy PUT failed with status " + proxyResponse.status +
              (proxyError ? ": " + proxyError.slice(0, 120) : ""));
          }
          cdnUrl = proxyUrl;
        } catch (error) {
          console.error("Photo storage upload failed", {
            name: error && typeof error.name === "string" ? error.name.slice(0, 80) : "StorageError",
            proxyStatus,
            message: error && typeof error.message === "string" ? error.message.slice(0, 160) : "Storage upload failed"
          });
          return json({
            message: "Photo storage upload failed",
            ...(proxyStatus ? { proxyStatus } : {})
          }, 503);
        }
        const id = env.MONGODB_CONNECTION && env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        if (!id) {
          await requestCdnObject(env, key, "DELETE", { "Origin": env.FRONTEND_URL ? new URL(env.FRONTEND_URL).origin : url.origin }, undefined, claims).catch(() => {});
          return json({ message: "Photo metadata service unavailable" }, 503);
        }
        const connection = env.MONGODB_CONNECTION.get(id);
        const metadataResponse = await connection.fetch("https://internal.invalid/internal/photo-upload", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, photo: { url: key, order: 0, size: file.size } })
        });
        const result = await metadataResponse.json().catch(() => ({ message: "Photo metadata service unavailable" }));
        if (!metadataResponse.ok) {
          await requestCdnObject(env, key, "DELETE", { "Origin": env.FRONTEND_URL ? new URL(env.FRONTEND_URL).origin : url.origin }, undefined, claims).catch(() => {});
          return json(result, metadataResponse.status);
        }
        return json({
          ...result,
          fileUrl: key,
          cdnUrl,
          size: file.size
        }, metadataResponse.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Photo upload failed" }, 503);
      }
    }

    if (url.pathname === "/api/users/photos" && request.method === "DELETE") {
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!isCdnConfigured(env)) return json({ message: "Photo CDN is not configured" }, 503);
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload.photoUrl !== "string" || !payload.photoUrl) return json({ error: "photoUrl is required." }, 400);
        let key = payload.photoUrl;
        try {
          if (key.startsWith("https://") || key.startsWith("http://")) key = new URL(key).pathname.split("/").filter(Boolean).pop() || "";
          else key = key.split("/").filter(Boolean).pop() || "";
          key = decodeURIComponent(key);
        } catch {
          return json({ error: "Invalid photo URL" }, 400);
        }
        const ownedPhotoKey = new RegExp("^photos-" + claims.sub + "-[0-9]{10,16}\\.(?:jpg|jpeg|png|gif|webp)$", "i");
        if (!ownedPhotoKey.test(key)) return json({ error: "Photo does not belong to the current user or has an invalid key" }, 403);
        if (!env.MONGODB_CONNECTION) return json({ message: "Photo metadata service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/photo-delete", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, key })
        });
        const result = await response.json().catch(() => ({ message: "Photo metadata service unavailable" }));
        if (!response.ok) return json(result, response.status);
        const frontendOrigin = env.FRONTEND_URL ? new URL(env.FRONTEND_URL).origin : url.origin;
        const proxyResponse = await requestCdnObject(env, key, "DELETE", { "Origin": frontendOrigin }, undefined, claims);
        // A 404 means a previous attempt already removed the object. Keep the
        // metadata tombstone until storage is confirmed absent, then finalize it.
        if (!proxyResponse.ok && proxyResponse.status !== 404) {
          console.error("Photo CDN proxy delete failed", { status: proxyResponse.status });
          return json({ message: "Photo storage cleanup is pending; retry deletion later" }, 502);
        }
        const finalizeResponse = await connection.fetch("https://internal.invalid/internal/photo-delete-finalize", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, key })
        });
        const finalizeResult = await finalizeResponse.json().catch(() => ({ message: "Photo metadata finalization failed" }));
        if (!finalizeResponse.ok) {
          console.error("Photo metadata finalization failed", { status: finalizeResponse.status });
          return json({ message: "Photo storage was removed; profile cleanup is pending" }, 502);
        }
        return json(finalizeResult, finalizeResponse.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Photo deletion failed" }, 503);
      }
    }

    const publicProfileMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (publicProfileMatch) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      let targetUid;
      try { targetUid = decodeURIComponent(publicProfileMatch[1]); }
      catch { return json({ error: "Invalid user ID" }, 400); }
      if (!targetUid || targetUid.length > 128) return json({ error: "Invalid user ID" }, 400);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/public-profile", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, targetUid })
        });
        const body = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Profile service unavailable" }, 503);
      }
    }



    if (url.pathname === "/api/users/photos/order") {
      if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || !Array.isArray(payload.photos)) return json({ error: "Invalid payload. 'photos' must be an array." }, 400);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/photo-order", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, photos: payload.photos })
        });
        const body = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Profile service unavailable" }, 503);
      }
    }

    const unmatchRoute = url.pathname.match(/^\/api\/users\/unmatch\/([^/]+)$/);
    if (unmatchRoute) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Match service unavailable" }, 503);
      let targetUid;
      try { targetUid = decodeURIComponent(unmatchRoute[1]); }
      catch { return json({ error: "Invalid user ID" }, 400); }
      if (!targetUid || targetUid.length > 128) return json({ error: "Invalid user ID" }, 400);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const limited = await enforceAccountRateLimit(env, "unmatch-user", claims.sub, 20, 60 * 60 * 1000, "Unmatch action limit reached. Please retry later.");
        if (limited) return limited;
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/unmatch", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, targetUid })
        });
        const body = await response.json().catch(() => ({ error: "Match service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Match service unavailable" }, 503);
      }
    }

    const blockMatch = url.pathname.match(/^\/api\/users\/(block|unblock)\/([^/]+)$/);
    if (blockMatch) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);
      let targetUid;
      try { targetUid = decodeURIComponent(blockMatch[2]); }
      catch { return json({ error: "Invalid user ID" }, 400); }
      if (!targetUid || targetUid.length > 128) return json({ error: "Invalid user ID" }, 400);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const limited = await enforceAccountRateLimit(env, blockMatch[1] + "-user", claims.sub, 20, 60 * 60 * 1000, "Block action limit reached. Please retry later.");
        if (limited) return limited;
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/block", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, targetUid, action: blockMatch[1] })
        });
        const body = await response.json().catch(() => ({ error: "Profile service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Profile service unavailable" }, 503);
      }
    }

    const statusRoute = url.pathname.match(/^\/api\/(purchase|subscription)\/status\/([^/]+)$/);
    if (statusRoute) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      let idValue;
      try { idValue = decodeURIComponent(statusRoute[2]); } catch { return json({ error: "Invalid ID" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: statusRoute[1] === "purchase" ? "Purchase service unavailable" : "Subscription service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/" + statusRoute[1] + "-status", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, id: idValue })
        });
        const body = await response.json().catch(() => ({ error: "Status service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Status service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/support-tickets") {
      if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ message: "Support ticket service unavailable" }, 503);
      const payload = request.method === "POST" ? await request.json().catch(() => null) : null;
      if (request.method === "POST" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
        return json({ message: "A support ticket object is required." }, 400);
      }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/support-tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, action: request.method, payload })
        });
        const body = await response.json().catch(() => ({ message: "Support ticket service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Support ticket service unavailable" }, 503);
      }
    }

    const supportTicketMessage = url.pathname.match(/^\/api\/support-tickets\/([^/]+)\/messages$/);
    if (supportTicketMessage && request.method === "POST") {
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ message: "A message is required." }, 400);
      let ticketId;
      try { ticketId = decodeURIComponent(supportTicketMessage[1]); } catch { return json({ message: "Invalid ticket ID" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ message: "Support ticket service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/support-ticket-message", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, ticketId, payload })
        });
        const body = await response.json().catch(() => ({ message: "Support ticket service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Support ticket service unavailable" }, 503);
      }
    }

    const supportTicketDetails = url.pathname.match(/^\/api\/support-tickets\/([^/]+)$/);
    if (supportTicketDetails) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      let ticketId;
      try { ticketId = decodeURIComponent(supportTicketDetails[1]); } catch { return json({ message: "Invalid ticket ID" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ message: "Support ticket service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/support-ticket", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, ticketId })
        });
        const body = await response.json().catch(() => ({ message: "Support ticket service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Support ticket service unavailable" }, 503);
      }
    }

    const adminSupportBase = "/api/admin/support-tickets";
    const adminSupportMatch = url.pathname === adminSupportBase || url.pathname.startsWith(adminSupportBase + "/");
    if (adminSupportMatch) {
      const adminSupportParts = url.pathname.slice(adminSupportBase.length).split("/").filter(Boolean);
      if (adminSupportParts.length > 2) return json({ error: "Not found" }, 404);
      const ticketId = adminSupportParts[0];
      const action = adminSupportParts[1];
      const allowed = (!ticketId && request.method === "GET") ||
        (ticketId && !action && request.method === "GET") ||
        (ticketId && action === "messages" && request.method === "POST") ||
        (ticketId && action === "status" && request.method === "PUT");
      if (!allowed) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ message: "Administration service unavailable" }, 503);
        const payload = action ? await request.json().catch(() => null) : null;
        if (action && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
          return json({ message: "A valid request body is required" }, 400);
        }
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const internalPath = !ticketId ? "/internal/admin/support-tickets"
          : action === "messages" ? "/internal/admin/support-ticket-message"
          : action === "status" ? "/internal/admin/support-ticket-status"
          : "/internal/admin/support-ticket";
        const response = await connection.fetch("https://internal.invalid" + internalPath, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, ticketId, payload, params: Object.fromEntries(url.searchParams.entries()) })
        });
        const result = await response.json().catch(() => ({ message: "Administration service unavailable" }));
        return json(result, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Administration service unavailable" }, 503);
      }
    }

    const adminPurchasesBase = "/api/admin/users/purchases";
    const adminPurchasesMatch = url.pathname === adminPurchasesBase || url.pathname.startsWith(adminPurchasesBase + "/");
    if (adminPurchasesMatch) {
      const parts = url.pathname.slice(adminPurchasesBase.length).split("/").filter(Boolean);
      const isList = parts.length === 0 && request.method === "GET";
      const isAction = parts.length === 2 && /^[a-fA-F0-9]{24}$/.test(parts[0]) &&
        ["approve", "reject", "record-refund"].includes(parts[1]) && request.method === "POST";
      if (isList || isAction) {
        if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
        try {
          const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
          if (!env.MONGODB_CONNECTION) return json({ message: "Administration service unavailable" }, 503);
          const parsedPayload = isAction ? await request.json().catch(() => null) : null;
          const payload = isAction ? normalizeAdminPurchaseActionPayload(parts[1], parsedPayload) : null;
          if (isAction && payload === null) {
            return json({ message: parts[1] === "reject"
              ? "A valid request body with a rejection reason is required"
              : "A valid request body is required" }, 400);
          }
          const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
          const connection = env.MONGODB_CONNECTION.get(id);
          const response = await connection.fetch("https://internal.invalid" + (isList ? "/internal/admin/purchases" : "/internal/admin/purchase-action"), {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              claims, status: url.searchParams.get("status") || "all",
              purchaseId: parts[0], action: parts[1],
              reason: payload && payload.reason,
              transactionType: payload && payload.transactionType,
              refundReference: payload && payload.refundReference,
              note: payload && payload.note
            })
          });
          const result = await response.json().catch(() => ({ message: "Administration service unavailable" }));
          return json(result, response.status);
        } catch (error) {
          if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
          if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
          return json({ message: "Administration service unavailable" }, 503);
        }
      }
    }

    const adminUsersBase = "/api/admin/users";
    const adminUsersWriteMatch = url.pathname === adminUsersBase || url.pathname.startsWith(adminUsersBase + "/");
    if (adminUsersWriteMatch) {
      const parts = url.pathname.slice(adminUsersBase.length).split("/").filter(Boolean);
      const isCreate = parts.length === 0 && request.method === "POST";
      const isUpdateOrDelete = parts.length === 1 && /^[a-fA-F0-9]{24}$/.test(parts[0]) && ["PUT", "DELETE"].includes(request.method);
      const isPlanUpdate = parts.length === 2 && /^[a-fA-F0-9]{24}$/.test(parts[0]) && parts[1] === "subscription" && request.method === "PUT";
      if (isCreate || isUpdateOrDelete || isPlanUpdate) {
        if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
        try {
          const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
          if (!env.MONGODB_CONNECTION) return json({ message: "Administration service unavailable" }, 503);
          const payload = request.method === "DELETE" ? null : await request.json().catch(() => null);
          if (request.method !== "DELETE" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
            return json({ message: "A valid JSON object is required" }, 400);
          }
          const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
          const connection = env.MONGODB_CONNECTION.get(id);
          let internalPath;
          if (isCreate) internalPath = "/internal/admin/user-create";
          else if (isPlanUpdate) internalPath = "/internal/admin/user-plan";
          else if (request.method === "DELETE") internalPath = "/internal/admin/user-delete";
          else internalPath = "/internal/admin/user-update";
          const response = await connection.fetch("https://internal.invalid" + internalPath, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, userId: parts[0], payload })
          });
          const result = await response.json().catch(() => ({ message: "Administration service unavailable" }));
          if (request.method === "DELETE" && result?.anonymizationStatus === "completed") {
            return json(result, response.status);
          }
          if (request.method === "DELETE" && (response.status === 200 || response.status === 202)) {
            try {
              const assetsResponse = await connection.fetch("https://internal.invalid/internal/admin/user-deletion-assets", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ claims, userId: parts[0] })
              });
              const assetsResult = await assetsResponse.json().catch(() => null);
              if (!assetsResponse.ok || !assetsResult ||
                  typeof assetsResult.uid !== "string" ||
                  !Array.isArray(assetsResult.photoKeys) ||
                  !Array.isArray(assetsResult.supportKeys) ||
                  !Array.isArray(assetsResult.completedKeys) ||
                  !Number.isInteger(assetsResult.unresolvedAssetCount)) {
                return json({ ...result, cdnAssetCleanupStatus: "retry_pending" }, 202);
              }
              if (assetsResult.unresolvedAssetCount > 0) {
                return json({
                  ...result,
                  cdnAssetCleanupStatus: "manual_review_required",
                  unresolvedAssetCount: assetsResult.unresolvedAssetCount
                }, 202);
              }

              const frontendOrigin = env.FRONTEND_URL ? new URL(env.FRONTEND_URL).origin : url.origin;
              const deletedKeys = [];
              const completedKeySet = new Set(assetsResult.completedKeys);
              const cleanupItems = [
                ...assetsResult.photoKeys.map(key => ({ key, claims: { ...claims, sub: assetsResult.uid } })),
                ...assetsResult.supportKeys.map(key => ({ key, claims }))
              ].filter(item => !completedKeySet.has(item.key)).slice(0, 40);
              for (const item of cleanupItems) {
                const cdnResponse = await requestCdnObject(
                  env, item.key, "DELETE", { Origin: frontendOrigin }, undefined, item.claims
                );
                if (!cdnResponse.ok && cdnResponse.status !== 404) {
                  return json({ ...result, cdnAssetCleanupStatus: "retry_pending" }, 202);
                }
                deletedKeys.push(item.key);
              }

              const finalizeResponse = await connection.fetch("https://internal.invalid/internal/admin/user-deletion-assets-finalize", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ claims, userId: parts[0], deletedKeys })
              });
              const finalizeResult = await finalizeResponse.json().catch(() => null);
              if (!finalizeResponse.ok) {
                return json({
                  ...result,
                  cdnAssetCleanupStatus: finalizeResponse.status === 409 ? "manual_review_required" : "retry_pending"
                }, 202);
              }
              const cdnAssetCleanupStatus = finalizeResult?.cdnAssetCleanupStatus || "completed";
              if (result.firebaseAuthDeletionStatus === "completed" && cdnAssetCleanupStatus === "completed") {
                const anonymizeResponse = await connection.fetch("https://internal.invalid/internal/admin/user-deletion-anonymize", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ claims, userId: parts[0] })
                });
                const anonymizeResult = await anonymizeResponse.json().catch(() => null);
                if (!anonymizeResponse.ok || !anonymizeResult ||
                    anonymizeResult.anonymizationStatus !== "completed") {
                  return json({
                    ...result,
                    cdnAssetCleanupStatus,
                    anonymizationStatus: "retry_pending",
                    deletedAssetCount: finalizeResult?.deletedAssetCount ?? deletedKeys.length
                  }, 202);
                }
                return json({
                  ...result,
                  cdnAssetCleanupStatus,
                  deletedAssetCount: finalizeResult?.deletedAssetCount ?? deletedKeys.length,
                  deletionStatus: "completed",
                  anonymizationStatus: "completed",
                  retainedHistoricalRecords: true
                }, 200);
              }
              return json({
                ...result,
                cdnAssetCleanupStatus,
                anonymizationStatus: "awaiting_prerequisites",
                deletedAssetCount: finalizeResult?.deletedAssetCount ?? deletedKeys.length
              }, 202);
            } catch {
              return json({ ...result, cdnAssetCleanupStatus: "retry_pending" }, 202);
            }
          }
          return json(result, response.status);
        } catch (error) {
          if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
          if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
          return json({ message: "Administration service unavailable" }, 503);
        }
      }
    }

    const adminReadRoute = url.pathname === "/api/admin/users" ||
      url.pathname === "/api/admin/users/stats" ||
      (url.pathname.startsWith("/api/admin/users/") && /^[a-fA-F0-9]{24}$/.test(url.pathname.split("/").pop())) ||
      url.pathname === "/api/admin/transactions" ||
      url.pathname === "/api/admin/analytics/summary" ||
      url.pathname === "/api/admin/analytics/export" ||
      url.pathname === "/api/admin/payment-logs" ||
      url.pathname === "/api/admin/user-activity/login-history" ||
      url.pathname === "/api/admin/audit-logs";
    if (adminReadRoute) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ message: "Administration service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        let internalPath;
        const body = { claims };
        if (url.pathname === "/api/admin/users") {
          internalPath = "/internal/admin/users";
          body.params = Object.fromEntries(url.searchParams.entries());
        } else if (url.pathname === "/api/admin/users/stats") {
          internalPath = "/internal/admin/stats";
        } else if (url.pathname === "/api/admin/transactions") {
          internalPath = "/internal/admin/transactions";
        } else if (url.pathname === "/api/admin/analytics/summary" || url.pathname === "/api/admin/analytics/export") {
          internalPath = "/internal/admin/analytics";
          body.params = Object.fromEntries(url.searchParams.entries());
        } else if (url.pathname === "/api/admin/payment-logs") {
          internalPath = "/internal/admin/payment-logs";
          body.search = url.searchParams.get("search") || "";
        } else if (url.pathname === "/api/admin/user-activity/login-history") {
          internalPath = "/internal/admin/login-history";
          body.search = url.searchParams.get("search") || "";
        } else if (url.pathname === "/api/admin/audit-logs") {
          internalPath = "/internal/admin/audit-logs";
          body.search = url.searchParams.get("search") || "";
        } else {
          internalPath = "/internal/admin/user";
          body.userId = url.pathname.split("/").pop();
        }
        const response = await connection.fetch("https://internal.invalid" + internalPath, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({ message: "Administration service unavailable" }));
        if (url.pathname === "/api/admin/analytics/export" && response.ok) {
          const csv = buildAnalyticsCsv(result.signupsPerDay);
          if (csv !== null) {
            return new Response(csv, {
              status: 200,
              headers: {
                ...JSON_HEADERS,
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": 'attachment; filename="analytics_export.csv"'
              }
            });
          }
        }
        return json(result, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Administration service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/admin/reports" || /^\/api\/admin\/reports\/[^/]+(?:\/action)?$/.test(url.pathname)) {
      const reportAction = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)\/action$/);
      const reportDetail = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
      const isList = url.pathname === "/api/admin/reports";
      if ((isList && request.method !== "GET") ||
          (reportAction && request.method !== "POST") ||
          (reportDetail && request.method !== "GET")) return json({ error: "Method not allowed" }, 405);
      if (!isList && !reportAction && !reportDetail) return json({ error: "Not found" }, 404);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      let payload = null;
      if (reportAction) {
        payload = await request.json().catch(() => null);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ message: "A moderation action is required." }, 400);
      }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (reportAction) {
          const limited = await enforceAccountRateLimit(env, "admin-moderation", claims.sub, 30, 15 * 60 * 1000, "Moderation action limit reached. Please retry later.");
          if (limited) return limited;
        }
        if (!env.MONGODB_CONNECTION) return json({ message: "Report administration service unavailable." }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const params = Object.fromEntries(url.searchParams.entries());
        const body = isList
          ? { claims, params: { status: params.status, search: params.search, page: Number(params.page), limit: Number(params.limit) } }
          : reportAction
            ? { claims, reportId: decodeURIComponent(reportAction[1]), payload }
            : { claims, reportId: decodeURIComponent(reportDetail[1]) };
        const internalPath = isList ? "/internal/admin/reports" : reportAction ? "/internal/admin/report-action" : "/internal/admin/report";
        const response = await connection.fetch("https://internal.invalid" + internalPath, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({ message: "Report administration service unavailable." }));
        return json(result, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Report administration service unavailable." }, 503);
      }
    }

    if (url.pathname === "/api/reports") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Report service unavailable" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return json({ error: "Invalid report request" }, 400);
      }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        // Require both edge and account-level controls. Reporting remains protected
        // even if the Durable Object binding is accidentally omitted at deploy time.
        const limited = await enforceAccountRateLimit(env, "report-user", claims.sub, 3, 60 * 60 * 1000, "Report limit reached. Please retry later.");
        if (limited) return limited;
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/create-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, payload })
        });
        const body = await response.json().catch(() => ({ error: "Report service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Report service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/verification" || url.pathname === "/api/admin/photo-verifications" ||
        /^\/api\/admin\/photo-verifications\/[a-f0-9]{24}(?:\/(?:evidence|action))?$/i.test(url.pathname)) {
      const isOwn = url.pathname === "/api/verification";
      const isQueue = url.pathname === "/api/admin/photo-verifications";
      const evidenceMatch = url.pathname.match(/^\/api\/admin\/photo-verifications\/([a-f0-9]{24})\/evidence$/i);
      const actionMatch = url.pathname.match(/^\/api\/admin\/photo-verifications\/([a-f0-9]{24})\/action$/i);
      const detailMatch = url.pathname.match(/^\/api\/admin\/photo-verifications\/([a-f0-9]{24})$/i);
      if ((isOwn && !["GET", "POST", "DELETE"].includes(request.method)) ||
          (isQueue && request.method !== "GET") ||
          (evidenceMatch && request.method !== "GET") ||
          (actionMatch && request.method !== "POST") ||
          (detailMatch && request.method !== "GET")) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID || !env.MONGODB_CONNECTION) return json({ error: "Verification service unavailable" }, 503);
      const payload = request.method === "POST" ? await request.json().catch(() => null) : null;
      if (request.method === "POST" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
        return json({ error: "Invalid verification request" }, 400);
      }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (isOwn && request.method === "POST" && env.RATE_LIMITER) {
          const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName("photo-verification:" + claims.sub));
          const limited = await limiter.fetch("https://rate-limiter.internal/check", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "photo-verification", limit: 2, windowMs: 24 * 60 * 60 * 1000 })
          });
          if (!limited.ok) return json({ error: "Verification rate limit service unavailable" }, 503);
          const quota = await limited.json();
          if (!quota.allowed) return json({ error: "You have reached the daily verification submission limit." }, 429);
        }
        const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        let internalPath;
        let body = { claims };
        if (isOwn) {
          internalPath = request.method === "POST" ? "/internal/photo-verification/submit" : request.method === "DELETE" ? "/internal/photo-verification/withdraw" : "/internal/photo-verification/status";
          if (payload) body.payload = payload;
        } else if (isQueue) {
          internalPath = "/internal/admin/photo-verifications";
        } else if (evidenceMatch) {
          internalPath = "/internal/admin/photo-verification/" + evidenceMatch[1] + "/evidence";
        } else if (actionMatch) {
          internalPath = "/internal/admin/photo-verification/" + actionMatch[1] + "/action";
          body.payload = payload;
        } else {
          internalPath = "/internal/admin/photo-verification/" + detailMatch[1];
        }
        const response = await connection.fetch("https://internal.invalid" + internalPath, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({ error: "Verification service unavailable" }));
        return json(result, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Verification service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/dark-fantasy/catalog") {
      const regionBlock = darkFantasyRegionGate(request, env);
      if (regionBlock) return regionBlock;
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      // Public product listings only. Fetch from fixed, public Shopify collection endpoints;
      // never proxy arbitrary URLs or accept caller-supplied hostnames.
      const collections = [
        { handle: "costumes", label: "Costumes" },
        { handle: "lingerie", label: "Lingerie" },
        { handle: "essentials", label: "Toys & essentials" }
      ];
      try {
        const responses = await Promise.all(collections.map(async collection => {
          const upstream = await fetch(`https://midnightdivas.com/collections/${collection.handle}/products.json?limit=12`, {
            headers: { "accept": "application/json", "user-agent": "DatingAppPublicCatalog/1.0 (+https://dating-app-staging.pages.dev)" },
            cf: { cacheTtl: 900, cacheEverything: true }
          });
          if (!upstream.ok) return [];
          const data = await upstream.json().catch(() => null);
          if (!Array.isArray(data?.products)) return [];
          return data.products.map(product => {
            const handle = String(product?.handle || "").trim();
            const title = String(product?.title || "").replaceAll("<", "").replaceAll(">", "").trim().slice(0, 180);
            if (!handle || !title || !/^[a-z0-9-]+$/i.test(handle)) return null;
            const imageCandidate = product?.images?.[0]?.src || product?.image?.src || "";
            let image = "";
            try {
              const parsedImage = new URL(imageCandidate);
              if (parsedImage.protocol === "https:" && /(^|\.)shopifycdn\.com$|(^|\.)midnightdivas\.com$/i.test(parsedImage.hostname)) image = parsedImage.href;
            } catch {}
            const variant = Array.isArray(product?.variants) ? product.variants.find(item => item?.available) || product.variants[0] : null;
            const priceValue = variant?.price;
            const price = priceValue !== undefined && priceValue !== null && /^\d+(\.\d{1,2})?$/.test(String(priceValue)) ? String(priceValue) : "";
            return {
              id: String(product.id || handle),
              title,
              category: collection.label,
              url: `https://midnightdivas.com/products/${handle}`,
              image,
              price
            };
          }).filter(Boolean);
        }));
        const seen = new Set();
        const products = responses.flat().filter(product => {
          if (seen.has(product.id)) return false;
          seen.add(product.id);
          return true;
        }).slice(0, 36);
        return new Response(JSON.stringify({ products, source: "Midnight Divas", fetchedAt: new Date().toISOString() }), {
          status: 200,
          headers: { ...JSON_HEADERS, "cache-control": "public, max-age=300, s-maxage=900", "access-control-allow-origin": "https://dating-app-staging.pages.dev" }
        });
      } catch {
        return json({ error: "Public product catalogue is temporarily unavailable", products: [] }, 502);
      }
    }

    if (url.pathname === "/api/dark-fantasy/communities" || url.pathname.startsWith("/api/dark-fantasy/communities/")) {
      if (String(env.DARK_FANTASY_ENABLED || "").toLowerCase() !== "true") return json({ error: "Dark Fantasy is not currently available." }, 404);
      const countrySetting = String(env.DARK_FANTASY_ALLOWED_COUNTRIES || "").trim().toUpperCase();
      const globalAccess = countrySetting === "*";
      const allowedCountries = countrySetting.split(",").map(country => country.trim()).filter(country => /^[A-Z]{2}$/.test(country));
      const requestCountry = String(request.cf?.country || "").toUpperCase();
      if (!globalAccess && (!allowedCountries.length || !requestCountry || !allowedCountries.includes(requestCountry))) return json({ error: "Dark Fantasy is not available in this region." }, 404);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: "Community service unavailable" }, 503);
        const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        const route = url.pathname.replace(/\/+$/, "");
        const segments = route.replace("/api/dark-fantasy/communities", "").split("/").filter(Boolean);
        const method = request.method;
        let internalPath = "/internal/dark-fantasy/communities/";
        const payload = {};
        if (segments.length === 0 && method === "GET") internalPath += "list";
        else if (segments.length === 1 && method === "GET") { internalPath += "detail"; payload.slug = segments[0]; }
        else if (segments.length === 2 && segments[1] === "requests" && method === "GET") { internalPath += "requests"; payload.slug = segments[0]; }
        else if (segments.length === 2 && segments[1] === "join" && method === "POST") { internalPath += "join"; payload.slug = segments[0]; }
        else if (segments.length === 2 && segments[1] === "posts" && method === "GET") { internalPath += "posts"; payload.slug = segments[0]; }
        else if (segments.length === 2 && segments[1] === "posts" && method === "POST") { internalPath += "create-post"; payload.slug = segments[0]; payload.input = await request.json().catch(() => null); }
        else if (segments.length === 4 && segments[1] === "posts" && segments[3] === "comments" && method === "POST") { internalPath += "comment"; payload.slug = segments[0]; payload.postId = segments[2]; payload.input = await request.json().catch(() => null); }
        else if (segments.length === 4 && segments[1] === "posts" && segments[3] === "reaction" && method === "POST") { internalPath += "reaction"; payload.slug = segments[0]; payload.postId = segments[2]; payload.input = await request.json().catch(() => null); }
        else if (segments.length === 4 && segments[1] === "requests" && segments[3] === "decision" && method === "POST") { internalPath += "decision"; payload.slug = segments[0]; payload.targetUid = segments[2]; payload.input = await request.json().catch(() => null); }
        else return json({ error: "Not found" }, 404);
        const response = await connection.fetch("https://internal.invalid" + internalPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, ...payload }) });
        const body = await response.json().catch(() => ({ error: "Community service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Community service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/dark-fantasy" || url.pathname.startsWith("/api/dark-fantasy/")) {
      // This feature is intentionally fail-closed until jurisdiction, age-assurance,
      // moderation, and payment-provider approvals are recorded by the operator.
      if (String(env.DARK_FANTASY_ENABLED || "").toLowerCase() !== "true") {
        return json({ error: "Dark Fantasy is not currently available." }, 404);
      }
      // Fail closed unless an operator configures an approved ISO country allowlist.
      // Cloudflare's country signal is a coarse access control, not proof of residence.
      const countrySetting = String(env.DARK_FANTASY_ALLOWED_COUNTRIES || "").trim().toUpperCase();
      const globalAccess = countrySetting === "*";
      const allowedCountries = countrySetting.split(",").map(country => country.trim()).filter(country => /^[A-Z]{2}$/.test(country));
      const requestCountry = String(request.cf?.country || "").toUpperCase();
      if (!globalAccess && (!allowedCountries.length || !requestCountry || !allowedCountries.includes(requestCountry))) {
        return json({ error: "Dark Fantasy is not available in this region." }, 404);
      }
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      const route = url.pathname.replace(/\/+$/, "");
      const method = request.method;
      const allowed =
        (route === "/api/dark-fantasy/status" && method === "GET") ||
        (route === "/api/dark-fantasy/profile" && ["GET", "PUT", "DELETE"].includes(method)) ||
        (route === "/api/dark-fantasy/discover" && method === "GET") ||
        (route === "/api/dark-fantasy/purchase" && method === "POST");
      if (!allowed) return json({ error: "Not found" }, 404);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (route === "/api/dark-fantasy/purchase") {
          if (String(env.DARK_FANTASY_PAYMENTS_APPROVED || "").toLowerCase() !== "true") {
            return json({ error: "Dark Fantasy payments are not approved for this deployment." }, 503);
          }
          if (!env.WEBXPAY_PUBLIC_KEY || !env.WEBXPAY_SECRET_KEY || !env.FRONTEND_URL) {
            return json({ error: "Payment gateway is not configured." }, 503);
          }
          createPublicKey(normalizeWebXPayPublicKey(env.WEBXPAY_PUBLIC_KEY));
          if (!env.MONGODB_CONNECTION) return json({ error: "Purchase service unavailable" }, 503);
          const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
          const eligibilityResponse = await connection.fetch("https://internal.invalid/internal/dark-fantasy/status", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims })
          });
          const eligibility = await eligibilityResponse.json().catch(() => ({}));
          if (!eligibilityResponse.ok) return json(eligibility, eligibilityResponse.status);
          if (!eligibility.ageEligible) return json({ error: "Dark Fantasy requires an eligible adult account." }, 403);
          if (!eligibility.accountEligible) return json({ error: "This account is not eligible to purchase this add-on." }, 403);
          const response = await connection.fetch("https://internal.invalid/internal/create-purchase", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, itemId: (await request.clone().json().catch(() => ({}))).itemId || "dark-fantasy-monthly" })
          });
          const order = await response.json().catch(() => ({ error: "Purchase service unavailable" }));
          if (!response.ok) return json(order, response.status);
          try { return buildWebXPayCheckoutForm(order, env, "/dark-fantasy", order.itemName || "Dark Fantasy purchase"); }
          catch { return json({ error: "Payment gateway is not configured." }, 503); }
        }
        if (!env.MONGODB_CONNECTION) return json({ error: "Dark Fantasy service unavailable" }, 503);
        const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        const internalPath = route === "/api/dark-fantasy/status" ? "/internal/dark-fantasy/status"
          : route === "/api/dark-fantasy/discover" ? "/internal/dark-fantasy/discover"
          : "/internal/dark-fantasy/profile";
        const payload = method === "PUT" ? await request.json().catch(() => null) : null;
        if (method === "PUT" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
          return json({ error: "Invalid profile payload" }, 400);
        }
        const response = await connection.fetch("https://internal.invalid" + internalPath, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, ...(method === "PUT" ? { action: "save", payload } : method === "DELETE" ? { action: "delete" } : {}) })
        });
        const body = await response.json().catch(() => ({ error: "Dark Fantasy service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Dark Fantasy service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/purchase/store-item") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        if (!env.WEBXPAY_PUBLIC_KEY || !env.WEBXPAY_SECRET_KEY || !env.FRONTEND_URL) {
          return json({ error: "Payment gateway is not configured." }, 503);
        }
        createPublicKey(normalizeWebXPayPublicKey(env.WEBXPAY_PUBLIC_KEY));
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload.itemId !== "string") return json({ error: "Invalid item ID." }, 400);
        if (!env.MONGODB_CONNECTION) return json({ error: "Purchase service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/create-purchase", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, itemId: payload.itemId })
        });
        const order = await response.json().catch(() => ({ error: "Purchase service unavailable" }));
        if (!response.ok) return json(order, response.status);
        try { return buildWebXPayCheckoutForm(order, env, "/store"); }
        catch { return json({ error: "Payment gateway is not configured." }, 503); }
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Purchase service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/subscription") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        if (!env.WEBXPAY_PUBLIC_KEY || !env.WEBXPAY_SECRET_KEY || !env.FRONTEND_URL) {
          return json({ error: "Payment gateway is not configured." }, 503);
        }
        createPublicKey(normalizeWebXPayPublicKey(env.WEBXPAY_PUBLIC_KEY));
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload.plan !== "string") return json({ error: "Invalid subscription plan." }, 400);
        if (!env.MONGODB_CONNECTION) return json({ error: "Subscription service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/create-subscription", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, plan: payload.plan })
        });
        const order = await response.json().catch(() => ({ error: "Subscription service unavailable" }));
        if (!response.ok) return json(order, response.status);
        const planLabel = order.plan ? order.plan.charAt(0).toUpperCase() + order.plan.slice(1) + " Subscription" : "Premium Subscription";
        try { return buildWebXPayCheckoutForm(order, env, "/premium", planLabel); }
        catch {
          // A checkout reservation must not survive a form-generation failure.
          await connection.fetch("https://internal.invalid/internal/subscription-abandon", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, orderId: order.orderId })
          }).catch(() => null);
          return json({ error: "Payment gateway is not configured. You can try again." }, 503);
        }
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Subscription service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/subscription/abandon") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID || !env.MONGODB_CONNECTION) return json({ error: "Subscription service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload.orderId !== "string" || !/^[a-fA-F0-9]{24}$/.test(payload.orderId)) {
          return json({ error: "Invalid checkout request." }, 400);
        }
        const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        const response = await connection.fetch("https://internal.invalid/internal/subscription-abandon", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, orderId: payload.orderId })
        });
        const body = await response.json().catch(() => ({ error: "Subscription checkout recovery unavailable." }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Subscription checkout recovery unavailable." }, 503);
      }
    }

    if (url.pathname === "/api/webxpay/response") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.WEBXPAY_PUBLIC_KEY) return json({ error: "Payment gateway is not configured." }, 503);
      const callback = await readWebXPayCallback(request).catch(() => null);
      if (!callback || typeof callback.payment !== "string" || typeof callback.signature !== "string") {
        return json({ error: "Payment or signature missing." }, 400);
      }

      // Keep cryptographic failures distinct from settlement infrastructure
      // failures. WebXPay can retry a 5xx callback after MongoDB recovers.
      let decoded;
      try {
        decoded = verifyWebXPayCallback(callback.payment, callback.signature, env.WEBXPAY_PUBLIC_KEY);
      } catch {
        return json({ error: "Signature verification failed." }, 400);
      }
      if (!decoded) return json({ error: "Signature verification failed." }, 400);

      const fields = decoded.split("|").map(value => value.trim());
      // WebXPay's documented redirect response is:
      // order_id|order_reference|transaction_datetime|status_code|comment|gateway_id
      // Do not search other fields for a status-like value: doing so can turn a
      // malformed response into an approval.
      if (fields.length !== 6 || !/^[a-fA-F0-9]{24}$/.test(fields[0]) ||
          !fields[1] || fields[1].length > 128 ||
          !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fields[2]) || !Number.isFinite(Date.parse(fields[2])) ||
          !["0", "00", "15"].includes(fields[3]) ||
          !fields[5] || fields[5].length > 32) {
        return json({ error: "Invalid payment response." }, 400);
      }
      if (!env.MONGODB_CONNECTION) return json({ error: "Payment settlement unavailable" }, 503);
      try {
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/webxpay-settle", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: fields[0],
            statusCode: fields[3],
            reference: fields[1],
            transactionDate: fields[2],
            gatewayComment: fields[4].slice(0, 256),
            gatewayId: fields[5]
          })
        });
        const body = await response.json().catch(() => ({ error: "Payment settlement unavailable" }));
        return json(body, response.status);
      } catch {
        return json({ error: "Payment settlement temporarily unavailable. Please retry the callback." }, 503);
      }
    }



    if (url.pathname === "/api/calls/ice-config") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const stunServers = [
          { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
          { urls: ["stun:global.stun.twilio.com:3478"] }
        ];
        const turnUrls = String(env.TURN_URLS || "").split(",").map(value => value.trim()).filter(value => /^turns?:[^\s]+$/i.test(value));
        const sharedSecret = env.TURN_SHARED_SECRET;
        let turnServer = null;
        let credentialExpiresAt = null;
        if (turnUrls.length && sharedSecret) {
          credentialExpiresAt = Math.floor(Date.now() / 1000) + 3600;
          const username = credentialExpiresAt + ":" + String(claims.sub).slice(0, 96);
          const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sharedSecret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
          const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
          let binary = "";
          for (const byte of signature) binary += String.fromCharCode(byte);
          turnServer = { username, credential: btoa(binary) };
        }
        const iceServers = [...stunServers, ...(turnServer ? [{ urls: turnUrls, ...turnServer }] : [])];
        return new Response(JSON.stringify({
          iceServers, iceTransportPolicy: "all",
          turnConfigured: Boolean(turnServer && turnUrls.length), credentialExpiresAt
        }), { status: 200, headers: { ...JSON_HEADERS, "cache-control": "no-store", "pragma": "no-cache" } });
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Call ICE configuration unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/video-rooms/ice-config") {
      const regionBlock = darkFantasyRegionGate(request, env);
      if (regionBlock) return regionBlock;
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const connection = env.MONGODB_CONNECTION?.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        if (!connection) return json({ error: "Video Rooms service unavailable" }, 503);
        const accessResponse = await connection.fetch("https://internal.invalid/internal/dark-fantasy/status", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims })
        });
        const access = await accessResponse.json().catch(() => ({}));
        if (!accessResponse.ok) return json(access, accessResponse.status);
        if (!access.ageEligible) return json({ error: "Video Rooms are available only to eligible adults." }, 403);
        if (!access.hasAccess) return json({ error: "An active Video Rooms add-on is required." }, 402);

        const stunServers = [
          { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
          { urls: ["stun:global.stun.twilio.com:3478"] }
        ];
        const turnUrls = String(env.TURN_URLS || "").split(",").map(value => value.trim()).filter(value => /^turns?:[^\s]+$/i.test(value));
        const sharedSecret = env.TURN_SHARED_SECRET;
        let turnServer = null;
        if (turnUrls.length && sharedSecret) {
          const expiresAt = Math.floor(Date.now() / 1000) + 3600;
          const username = expiresAt + ":" + String(claims.sub).slice(0, 96);
          const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sharedSecret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
          const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
          let binary = "";
          for (const byte of signature) binary += String.fromCharCode(byte);
          turnServer = { username, credential: btoa(binary) };
        }
        const turnGroups = [
          { name: "turn-udp", urls: turnUrls.filter(value => /^turn:/i.test(value) && !/transport=tcp/i.test(value)) },
          { name: "turn-tcp", urls: turnUrls.filter(value => /^turn:/i.test(value) && /transport=tcp/i.test(value)) },
          { name: "turn-tls", urls: turnUrls.filter(value => /^turns:/i.test(value) || /:443(?:\?|$)/i.test(value)) }
        ].filter(group => group.urls.length > 0);
        const iceServerTiers = [
          { name: "direct-stun", iceServers: stunServers },
          ...turnGroups.map(group => ({ name: group.name, iceServers: [{ urls: group.urls, ...turnServer }] })).filter(() => Boolean(turnServer))
        ];
        const iceServers = [...stunServers, ...(turnServer ? [{ urls: turnUrls, ...turnServer }] : [])];
        return new Response(JSON.stringify({
          iceServers, iceServerTiers, iceTransportPolicy: "all",
          turnConfigured: Boolean(turnServer && turnUrls.length),
          credentialExpiresAt: turnServer ? Math.floor(Date.now() / 1000) + 3600 : null
        }), { status: 200, headers: { ...JSON_HEADERS, "cache-control": "no-store", "pragma": "no-cache" } });
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "ICE configuration unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/video-rooms/earnings") {
      const regionBlock = darkFantasyRegionGate(request, env);
      if (regionBlock) return regionBlock;
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID || !env.MONGODB_CONNECTION) return json({ error: "Video Rooms service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        const response = await connection.fetch("https://internal.invalid/internal/video-rooms/earnings", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, payload: {} })
        });
        const body = await response.json().catch(() => ({ error: "Creator earnings unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Creator earnings unavailable" }, 503);
      }
    }

    const videoRoomTicketMatch = url.pathname.match(/^\/api\/video-rooms\/([^/]+)\/ticket$/);
    if (videoRoomTicketMatch) {
      const regionBlock = darkFantasyRegionGate(request, env);
      if (regionBlock) return regionBlock;
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID || !env.MONGODB_CONNECTION) return json({ error: "Video Rooms service unavailable" }, 503);
      if (String(env.DARK_FANTASY_PAYMENTS_APPROVED || "").toLowerCase() !== "true") return json({ error: "Video Room payments are not approved for this deployment." }, 503);
      if (!env.WEBXPAY_PUBLIC_KEY || !env.WEBXPAY_SECRET_KEY || !env.FRONTEND_URL) return json({ error: "WebXPay payment gateway is not configured." }, 503);
      try {
        createPublicKey(normalizeWebXPayPublicKey(env.WEBXPAY_PUBLIC_KEY));
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const accessConnection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        const accessResponse = await accessConnection.fetch("https://internal.invalid/internal/dark-fantasy/status", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims })
        });
        const access = await accessResponse.json().catch(() => ({}));
        if (!accessResponse.ok) return json(access, accessResponse.status);
        if (!access.ageEligible) return json({ error: "Video Rooms are available only to eligible adults." }, 403);
        if (!access.hasAccess) return json({ error: "An active Video Rooms add-on is required." }, 402);
        let roomId;
        try { roomId = decodeURIComponent(videoRoomTicketMatch[1]); } catch { return json({ error: "Invalid room ID." }, 400); }
        if (!roomId || roomId.length > 64) return json({ error: "Invalid room ID." }, 400);
        const response = await accessConnection.fetch("https://internal.invalid/internal/create-video-room-ticket", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, roomId })
        });
        const order = await response.json().catch(() => ({ error: "Video room ticket checkout unavailable." }));
        if (!response.ok) return json(order, response.status);
        try { return buildWebXPayCheckoutForm(order, env, "/dark-fantasy?section=videorooms", order.itemName || "Live video room ticket"); }
        catch { return json({ error: "WebXPay payment gateway is not configured." }, 503); }
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Video room ticket checkout unavailable." }, 503);
      }
    }

    const videoRoomMatch = url.pathname.match(/^\/api\/video-rooms(?:\/([^/]+)\/(join|leave|end))?$/);
    if (videoRoomMatch) {
      const regionBlock = darkFantasyRegionGate(request, env);
      if (regionBlock) return regionBlock;
      const action = videoRoomMatch[2] || (request.method === "GET" ? "list" : "create");
      if (request.method !== (action === "list" ? "GET" : "POST")) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID || !env.MONGODB_CONNECTION) return json({ error: "Video Rooms service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const connection = env.MONGODB_CONNECTION.get(env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env)));
        const accessResponse = await connection.fetch("https://internal.invalid/internal/dark-fantasy/status", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims })
        });
        const access = await accessResponse.json().catch(() => ({}));
        if (!accessResponse.ok) return json(access, accessResponse.status);
        if (!access.ageEligible) return json({ error: "Video Rooms are available only to eligible adults." }, 403);
        if (!access.hasAccess) return json({ error: "An active Video Rooms add-on is required." }, 402);
        const roomId = videoRoomMatch[1] || null;
        const payload = action === "create" ? await request.json().catch(() => null) : {};
        if (action === "create" && (!payload || typeof payload !== "object" || Array.isArray(payload))) return json({ error: "Invalid room setup." }, 400);
        const response = await connection.fetch("https://internal.invalid/internal/video-rooms/" + action, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, roomId, payload })
        });
        const body = await response.json().catch(() => ({ error: "Video Rooms service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Video Rooms service unavailable" }, 503);
      }
    }

    const callRoute = url.pathname.match(/^\/api\/calls\/(start|poll|history|incoming|signal|action)$/);
    if (callRoute) {
      const action = callRoute[1];
      const methodAllowed = ["poll", "history", "incoming"].includes(action) ? request.method === "GET" : request.method === "POST";
      if (!methodAllowed) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: "Calling service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        let payload = null;
        let internalPath = "/internal/calls/" + action;
        if (action === "poll" || action === "history" || action === "incoming") {
          const roomId = url.searchParams.get("roomId") || "";
          const response = await connection.fetch("https://internal.invalid" + internalPath, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, roomId })
          });
          const result = await response.json().catch(() => ({ error: "Call state unavailable" }));
          return json(result, response.status);
        }
        payload = await request.json().catch(() => null);
        if (!payload || typeof payload !== "object") return json({ error: "Invalid call request" }, 400);
        const response = await connection.fetch("https://internal.invalid" + internalPath, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, payload })
        });
        const result = await response.json().catch(() => ({ error: "Calling service unavailable" }));
        return json(result, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Calling service unavailable" }, 503);
      }
    }

    const chatRoute = url.pathname.match(/^\/api\/chat\/(history\/([^/]+)|conversations|send|delivered|read|typing)$/);
    if (chatRoute) {
      const methodAllowed = chatRoute[1] === "history/" + chatRoute[2] ? request.method === "GET"
        : chatRoute[1] === "conversations" || chatRoute[1] === "typing" && request.method === "GET"
          ? request.method === "GET" : request.method === "POST";
      if (!methodAllowed) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        // Bound message creation per authenticated account, independent of IP.
        if (chatRoute[1] === "send") {
          if (!env.RATE_LIMITER) return json({ error: "Chat rate limit service unavailable" }, 503);
          const limiterId = env.RATE_LIMITER.idFromName("chat-send-user:" + claims.sub);
          const limiter = env.RATE_LIMITER.get(limiterId);
          const rateResponse = await limiter.fetch("https://rate-limiter.internal/check", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "chat-send", limit: 30, windowMs: 60000 })
          });
          if (!rateResponse.ok) return json({ error: "Chat rate limit service unavailable" }, 503);
          const rate = await rateResponse.json();
          if (!rate.allowed) return new Response(JSON.stringify({ error: "Message limit reached. Please wait before sending more messages." }), {
            status: 429, headers: { ...JSON_HEADERS, "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) }
          });
        }
        if (!env.MONGODB_CONNECTION) return json({ error: "Chat service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        if (chatRoute[1] === "conversations") {
          const response = await connection.fetch("https://internal.invalid/internal/chat/conversations", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims })
          });
          const result = await response.json().catch(() => ({ error: "Chat conversations unavailable" }));
          return json(result, response.status);
        }
        if (chatRoute[1].startsWith("history/")) {
          let roomId;
          try { roomId = decodeURIComponent(chatRoute[2]); } catch { return json({ error: "Invalid room ID" }, 400); }
          const limitRaw = url.searchParams.get("limit");
          const skipRaw = url.searchParams.get("skip");
          const afterRaw = url.searchParams.get("after");
          const afterId = url.searchParams.get("afterId");
          const beforeRaw = url.searchParams.get("before");
          const beforeId = url.searchParams.get("beforeId");
          const limit = limitRaw === null ? 50 : Number(limitRaw);
          const skip = skipRaw === null ? 0 : Number(skipRaw);
          const hasAfter = afterRaw !== null || afterId !== null;
          const hasBefore = beforeRaw !== null || beforeId !== null;
          const validCursor = (timestamp, id) => timestamp !== null && id !== null &&
            !Number.isNaN(Date.parse(timestamp)) && /^[a-fA-F0-9]{24}$/.test(id);
          if (!Number.isInteger(limit) || !Number.isInteger(skip) || limit < 1 || limit > 100 || skip < 0 ||
              (hasAfter && !validCursor(afterRaw, afterId)) ||
              (hasBefore && !validCursor(beforeRaw, beforeId)) || (hasAfter && hasBefore)) {
            return json({ error: "Invalid pagination or message cursor" }, 400);
          }
          const after = hasAfter ? { timestamp: new Date(afterRaw), id: afterId } : null;
          const before = hasBefore ? { timestamp: new Date(beforeRaw), id: beforeId } : null;
          const response = await connection.fetch("https://internal.invalid/internal/chat/history", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, roomId, limit, skip, after, before })
          });
          const result = await response.json().catch(() => ({ error: "Chat history unavailable" }));
          return json(result, response.status);
        }
        if (chatRoute[1] === "typing" && request.method === "GET") {
          const roomId = url.searchParams.get("roomId") || "";
          const response = await connection.fetch("https://internal.invalid/internal/chat/typing-read", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, roomId })
          });
          const result = await response.json().catch(() => ({ error: "Typing status unavailable" }));
          return json(result, response.status);
        }
        const payload = await request.json().catch(() => null);
        if (chatRoute[1] === "typing" || chatRoute[1] === "delivered" || chatRoute[1] === "read") {
          const internalPath = chatRoute[1] === "typing"
            ? "/internal/chat/typing-write"
            : chatRoute[1] === "read" ? "/internal/chat/read" : "/internal/chat/delivered";
          const response = await connection.fetch("https://internal.invalid" + internalPath, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, payload })
          });
          const result = await response.json().catch(() => ({ error: "Chat status update unavailable" }));
          return json(result, response.status);
        }
        const response = await connection.fetch("https://internal.invalid/internal/chat/send", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, payload })
        });
        const result = await response.json().catch(() => ({ error: "Unable to send chat message" }));
        if (!response.ok) return json(result, response.status);
        const authorization = request.headers.get("authorization") || "";
        const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        // MongoDB is the source of truth. Realtime Database is a best-effort
        // notification/sync layer and must never invalidate a saved message.
        // The current staging Firebase RTDB is deactivated. MongoDB is the
        // source of truth, and the frontend polls message history, so RTDB sync
        // stays off unless an operator explicitly enables a live database.
        const realtimeSyncEnabled = env.ENABLE_FIREBASE_REALTIME_SYNC === "true";
        const databaseUrl = realtimeSyncEnabled
          ? (env.FIREBASE_DATABASE_URL ||
            (env.FIREBASE_PROJECT_ID ? `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com` : ""))
          : "";
        let realtimeSync = false;
        let databaseBase = "";
        if (realtimeSyncEnabled && (!idToken || !databaseUrl)) {
          console.warn("Firebase Realtime Database chat sync is not configured", {
            phase: "write-realtime-chat-message",
            hasIdToken: Boolean(idToken),
            hasDatabaseUrl: Boolean(databaseUrl)
          });
        } else if (realtimeSyncEnabled) {
          try {
            if (!isFirebaseDatabaseUrl(databaseUrl)) {
              throw new Error("Invalid Firebase Realtime Database URL");
            }
            const configured = new URL(databaseUrl);
            databaseBase = configured.toString().replace(/\/+$/, "");
          } catch {
            console.error("Firebase Realtime Database chat sync URL is invalid", {
              phase: "write-realtime-chat-message"
            });
          }
        }
        if (realtimeSyncEnabled && idToken && databaseBase) {
          const room = encodeURIComponent(result.roomId);
          const messageKey = encodeURIComponent(String(result._id));
          let realtimeResponse = null;
          let realtimeNetworkError = null;
          try {
            realtimeResponse = await fetch(
              databaseBase + "/chats/" + room + "/" + messageKey + ".json?auth=" + encodeURIComponent(idToken),
              {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  _id: String(result._id), roomId: result.roomId,
                  senderUid: result.senderUid, receiverUid: result.receiverUid,
                  messageContent: result.messageContent,
                  timestamp: result.timestamp instanceof Date ? result.timestamp.toISOString() : result.timestamp
                })
              }
            );
          } catch (error) {
            realtimeNetworkError = error && typeof error.message === "string" ? error.message.slice(0, 160) : "Network request failed";
          }
          realtimeSync = Boolean(realtimeResponse && realtimeResponse.ok);
          if (!realtimeSync) {
            const firebaseErrorBody = realtimeResponse
              ? (await realtimeResponse.clone().text().catch(() => "")).slice(0, 240)
              : "";
            console.error("Firebase Realtime Database chat write failed", {
              phase: "write-realtime-chat-message",
              status: realtimeResponse ? realtimeResponse.status : null,
              databaseHost: new URL(databaseBase).hostname,
              error: firebaseErrorBody || realtimeNetworkError || "No response from Firebase"
            });
          }
        }
        return json({ ...result, realtimeSync }, 201);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Chat service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/status") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      let databaseStatus = "unavailable";
      if (env.MONGODB_CONNECTION) {
        try {
          const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
          const connection = env.MONGODB_CONNECTION.get(id);
          const response = await connection.fetch("https://internal.invalid/internal/ping", { method: "POST" });
          databaseStatus = response.ok ? "connected" : "disconnected";
        } catch { databaseStatus = "disconnected"; }
      }
      const body = {
        application: { name: "dating-app", version: "serverless" },
        worker: { status: "ok", stage: env.MIGRATION_STAGE || "unknown" },
        database: { status: databaseStatus },
        firebase: { status: env.FIREBASE_PROJECT_ID ? "configured" : "unavailable" }
      };
      return json(body, databaseStatus === "connected" && env.FIREBASE_PROJECT_ID ? 200 : 503);
    }

    const cronRoute = url.pathname.match(/^\/api\/cron\/(trials|subscriptions)$/);
    if (cronRoute) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length < 32) {
        return json({ error: "Manual expiration trigger is not configured" }, 503);
      }
      const supplied = request.headers.get("x-cron-secret") || "";
      const expectedBytes = Buffer.from(env.CRON_SECRET, "utf8");
      const suppliedBytes = Buffer.from(supplied, "utf8");
      if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
        return json({ error: "Unauthorized" }, 401);
      }
      if (!env.MONGODB_CONNECTION) return json({ error: "Expiration service unavailable" }, 503);
      try {
        const id = env.MONGODB_CONNECTION.idFromName(getMongoShardName(request, env));
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/scheduled-expirations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: cronRoute[1] }) });
        const result = await response.json().catch(() => ({ error: "Expiration service unavailable" }));
        if (!response.ok) return json(result, response.status);
        return json({ message: cronRoute[1] === "trials" ? "Trial expiration check completed." : "Subscription expiration check completed.", ...result });
      } catch {
        return json({ error: "Expiration service unavailable" }, 503);
      }
    }

    return json({ error: "Route not migrated yet" }, 501);
  },

  async scheduled(controller, env, ctx) {
    // Only the isolated staging environment gets scheduled jobs until production cutover is approved.
    if (env.MIGRATION_STAGE !== "staging") return;
    if (!env.MONGODB_CONNECTION) throw new Error("MongoDB scheduled-job binding is unavailable");
    const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
    const connection = env.MONGODB_CONNECTION.get(id);
    const task = connection.fetch("https://internal.invalid/internal/scheduled-expirations", {
      method: "POST"
    }).then(async (response) => {
      if (!response.ok) throw new Error("Scheduled expiration job failed with status " + response.status);
      return response.json();
    });
    ctx.waitUntil(task);
  }
};