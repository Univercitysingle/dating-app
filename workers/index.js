import { authenticateFirebaseRequest, FirebaseTokenError, FirebaseKeyServiceError } from "./firebase-auth.js";
import { Buffer } from "node:buffer";
import { constants, createPublicKey, createSign, publicDecrypt, publicEncrypt, timingSafeEqual } from "node:crypto";
import { isB2Configured, putPrivateObject, getPrivateObject, deletePrivateObject } from "./backblaze-storage.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};



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
    claims: { role: "superadmin" }
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
    ["secret_key", env.WEBXPAY_SECRET_KEY],
    ["return_url", returnUrl.toString()],
    ["custom_fields", ""],
    ["payment", encryptedPayment]
  ];
  if (itemDescription) fields.push(["items", itemDescription]);
  const nonce = crypto.randomUUID();
  const inputs = fields.map(([name, value]) =>
    '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '">'
  ).join("\n");
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Redirecting to secure payment</title></head><body>' +
    '<p>Redirecting to WebXPay securely…</p>' +
    '<form action="https://stagingxpay.info/index.php?route=checkout/billing" id="webxpay-form" method="post">' +
    inputs + '</form><script nonce="' + nonce + '">document.getElementById("webxpay-form").submit();</script></body></html>';
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; form-action https://stagingxpay.info; script-src 'nonce-" + nonce + "'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff"
    }
  });
}

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
  const paymentBytes = Buffer.from(payment, "base64");
  const signatureBytes = Buffer.from(signature, "base64");
  if (!paymentBytes.length || !signatureBytes.length) return null;
  const verifiedBytes = publicDecrypt({
    key: createPublicKey(normalizeWebXPayPublicKey(configuredPublicKey)),
    padding: constants.RSA_PKCS1_PADDING
  }, signatureBytes);
  if (verifiedBytes.length !== paymentBytes.length || !timingSafeEqual(verifiedBytes, paymentBytes)) return null;
  return paymentBytes.toString("utf8");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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

export { MongoDBConnection } from "./mongodb-connection.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Apply a per-client edge limit to API traffic. Cloudflare supplies
    // CF-Connecting-IP; do not trust caller-controlled X-Forwarded-For.
    if (url.pathname.startsWith("/api/") && request.method !== "OPTIONS" && env.RATE_LIMITER) {
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
      return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=86400" } });
    }

    // Serve private B2 profile images through the existing CDN hostname.
    // Accept both the legacy /<object-key> URL and the explicit /media/<key> form.
    const mediaMatch = url.pathname.match(/^\/media\/([^/]+)$/) ||
      url.pathname.match(/^\/(photos-[A-Za-z0-9_-]{1,128}-[0-9a-f-]{36}\.(jpg|jpeg|png|gif))$/i);
    if (mediaMatch) {
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
      let key;
      try { key = decodeURIComponent(mediaMatch[1]); } catch { return json({ error: "Invalid media key" }, 400); }
      if (!/^photos-[A-Za-z0-9_-]{1,128}-[0-9a-f-]{36}\.(jpg|jpeg|png|gif)$/i.test(key)) return json({ error: "Media not found" }, 404);
      if (!isB2Configured(env)) return json({ error: "Media storage unavailable" }, 503);
      try {
        const object = await getPrivateObject(env, key);
        const headers = new Headers({ "content-type": object.ContentType || "application/octet-stream", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" });
        if (object.ContentLength !== undefined) headers.set("content-length", String(object.ContentLength));
        if (request.method === "HEAD") return new Response(null, { status: 200, headers });
        const body = object.Body && typeof object.Body.transformToWebStream === "function" ? object.Body.transformToWebStream() : object.Body;
        return new Response(body, { status: 200, headers });
      } catch { return json({ error: "Media not found" }, 404); }
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        try {
          const token = await createSuperadminCustomToken(env, payload.email, payload.password);
          if (!token) return json({ error: "Invalid credentials" }, 401);
          if (!env.MONGODB_CONNECTION) return json({ error: "Superadmin account service unavailable" }, 503);
          const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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

    if (url.pathname === "/api/notifications") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Notification service unavailable" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/discover", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, filters })
        });
        const body = await response.json().catch(() => ({ error: "Discovery service unavailable" }));
        return json(body, response.status);
      } catch (error) {
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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

    if (url.pathname === "/api/users/subscription/upload-slip") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!isB2Configured(env)) return json({ message: "Bank-slip storage is not configured" }, 503);
        if (typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)) return json({ message: "Invalid user identity" }, 400);
        const form = await request.formData().catch(() => null);
        const file = form && form.get("bankSlip");
        const planId = form && form.get("planId");
        const allowedTypes = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };
        if (!file || typeof file.arrayBuffer !== "function" || !allowedTypes[file.type] ||
            typeof planId !== "string" || !["basic_1m", "premium_1m", "premium_3m"].includes(planId)) {
          return json({ message: "A valid bank-slip image and planId are required" }, 400);
        }
        if (file.size < 1 || file.size > 5 * 1024 * 1024) return json({ message: "Bank slip must be 5 MB or smaller" }, 400);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const isJpeg = file.type === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isPng = file.type === "image/png" && bytes.length >= 8 &&
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
          bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
        const signature = bytes.length >= 6 ? String.fromCharCode(...bytes.slice(0, 6)) : "";
        const isGif = file.type === "image/gif" && (signature === "GIF87a" || signature === "GIF89a");
        if (!isJpeg && !isPng && !isGif) return json({ message: "File content does not match an allowed image type" }, 400);
        const key = "bank-slips-" + claims.sub + "-" + crypto.randomUUID() + "." + allowedTypes[file.type];
        try { await putPrivateObject(env, key, bytes, file.type, claims.sub, "bank-slip"); }
        catch { return json({ message: "Bank-slip upload failed" }, 503); }
        if (!env.MONGODB_CONNECTION) {
          await deletePrivateObject(env, key).catch(() => {});
          return json({ message: "Subscription service unavailable" }, 503);
        }
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/bank-slip-upload", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, key, contentType: file.type, size: file.size, planId })
        });
        const result = await response.json().catch(() => ({ error: "Subscription service unavailable" }));
        if (!response.ok) await deletePrivateObject(env, key).catch(() => {});
        return json(result, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ message: "Bank-slip upload failed" }, 503);
      }
    }

    if (url.pathname === "/api/users/subscription/upload-slip" && request.method === "DELETE") {
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!isB2Configured(env)) return json({ error: "Bank-slip storage is not configured" }, 503);
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload.subscriptionId !== "string") return json({ error: "subscriptionId is required" }, 400);
        if (!env.MONGODB_CONNECTION) return json({ error: "Subscription service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/bank-slip-delete", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, subscriptionId: payload.subscriptionId })
        });
        const result = await response.json().catch(() => ({ error: "Bank-slip deletion unavailable" }));
        if (!response.ok) return json(result, response.status);
        if (typeof result.key === "string") await deletePrivateObject(env, result.key).catch(() => {});
        return json({ success: true, message: "Pending bank-slip submission deleted" }, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Bank-slip deletion unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/users/photos" && request.method === "POST") {
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!isB2Configured(env)) {
          return json({ message: "Photo storage is not configured" }, 503);
        }
        const form = await request.formData().catch(() => null);
        const file = form && form.get("photo");
        const allowedTypes = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };
        if (!file || typeof file.arrayBuffer !== "function" || !allowedTypes[file.type]) {
          return json({ message: "A JPEG, PNG, or GIF photo is required" }, 400);
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
          String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a" || file.type === "image/gif" && bytes.length >= 6 &&
          String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a";
        if (!isJpeg && !isPng && !isGif) return json({ message: "File content does not match an allowed image type" }, 400);
        const key = "photos-" + claims.sub + "-" + crypto.randomUUID() + "." + allowedTypes[file.type];
        try {
          await putPrivateObject(env, key, fileBytes, file.type, claims.sub);
        } catch {
          return json({ message: "Photo upload failed" }, 503);
        }
        const id = env.MONGODB_CONNECTION && env.MONGODB_CONNECTION.idFromName("mongo-primary");
        if (!id) {
          await deletePrivateObject(env, key).catch(() => {});
          return json({ message: "Photo metadata service unavailable" }, 503);
        }
        const connection = env.MONGODB_CONNECTION.get(id);
        const metadataResponse = await connection.fetch("https://internal.invalid/internal/photo-upload", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, photo: { url: key, order: 0, size: file.size } })
        });
        const result = await metadataResponse.json().catch(() => ({ message: "Photo metadata service unavailable" }));
        if (!metadataResponse.ok) {
          await deletePrivateObject(env, key).catch(() => {});
          return json(result, metadataResponse.status);
        }
        return json({
          ...result,
          cdnUrl: (function () {
            const configured = String(env.CDN_HOSTNAME || new URL(request.url).host).trim();
            const base = /^https:\/\//i.test(configured) ? configured.replace(/\/+$/, "") : "https://" + configured.replace(/\/+$/, "");
            return base + "/" + encodeURIComponent(key);
          })()
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
        if (!isB2Configured(env)) return json({ message: "Photo storage is not configured" }, 503);
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
        if (!key.startsWith("photos-" + claims.sub + "-")) return json({ error: "Photo does not belong to the current user" }, 403);
        if (!env.MONGODB_CONNECTION) return json({ message: "Photo metadata service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/photo-delete", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, key })
        });
        const result = await response.json().catch(() => ({ message: "Photo metadata service unavailable" }));
        if (!response.ok) return json(result, response.status);
        await deletePrivateObject(env, key).catch(() => {});
        return json(result, response.status);
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        if (url.pathname === "/api/admin/analytics/export" && response.ok && Array.isArray(result.signupsPerDay)) {
          const rows = ["date,new_signups", ...result.signupsPerDay.map(item => String(item._id || "") + "," + String(Number(item.count) || 0))];
          return new Response(rows.join("\n"), { status: 200, headers: { ...JSON_HEADERS, "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=analytics_export.csv" } });
        }
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
        ["approve", "reject"].includes(parts[1]) && request.method === "POST";
      if (isList || isAction) {
        if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
        try {
          const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
          if (!env.MONGODB_CONNECTION) return json({ message: "Administration service unavailable" }, 503);
          const payload = isAction ? await request.json().catch(() => null) : null;
          if (isAction && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
            return json({ message: "A valid request body is required" }, 400);
          }
          const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
          const connection = env.MONGODB_CONNECTION.get(id);
          const response = await connection.fetch("https://internal.invalid" + (isList ? "/internal/admin/purchases" : "/internal/admin/purchase-action"), {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              claims, status: url.searchParams.get("status") || "all",
              purchaseId: parts[0], action: parts[1],
              reason: payload && payload.reason
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
          const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        if (!env.MONGODB_CONNECTION) return json({ message: "Report administration service unavailable." }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/create-subscription", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, plan: payload.plan })
        });
        const order = await response.json().catch(() => ({ error: "Subscription service unavailable" }));
        if (!response.ok) return json(order, response.status);
        const planLabel = order.plan ? order.plan.charAt(0).toUpperCase() + order.plan.slice(1) + " Subscription" : "Premium Subscription";
        try { return buildWebXPayCheckoutForm(order, env, "/premium", planLabel); }
        catch { return json({ error: "Payment gateway is not configured." }, 503); }
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Subscription service unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/webxpay/response") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.WEBXPAY_PUBLIC_KEY) return json({ error: "Payment gateway is not configured." }, 503);
      try {
        const callback = await readWebXPayCallback(request);
        if (!callback || typeof callback.payment !== "string" || typeof callback.signature !== "string") {
          return json({ error: "Payment or signature missing." }, 400);
        }
        const decoded = verifyWebXPayCallback(callback.payment, callback.signature, env.WEBXPAY_PUBLIC_KEY);
        if (!decoded) return json({ error: "Signature verification failed." }, 400);
        const fields = decoded.split("|").map(value => value.trim());
        if (fields.length < 5 || !/^[a-fA-F0-9]{24}$/.test(fields[0])) {
          return json({ error: "Invalid payment response." }, 400);
        }
        // WEBXPAY's published examples differ on whether gateway ID or status is field 4.
        const statusCode = [fields[3], fields[4]].find(value => ["0", "00", "15"].includes(value));
        if (!statusCode) return json({ error: "Unsupported payment status." }, 400);
        if (!env.MONGODB_CONNECTION) return json({ error: "Payment settlement unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/webxpay-settle", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: fields[0], statusCode, reference: fields[1] || "" })
        });
        const body = await response.json().catch(() => ({ error: "Payment settlement unavailable" }));
        return json(body, response.status);
      } catch {
        return json({ error: "Invalid payment signature or callback." }, 400);
      }
    }

    if (url.pathname === "/api/admin/subscriptions/pending") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: "Administration service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/admin/bank-slip-pending", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims })
        });
        const body = await response.json().catch(() => ({ error: "Administration service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Administration service unavailable" }, 503);
      }
    }

    const bankSlipAction = url.pathname.match(/^\/api\/admin\/subscriptions\/([a-fA-F0-9]{24})\/(approve|reject)$/);
    if (bankSlipAction) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      const payload = await request.json().catch(() => ({}));
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: "Administration service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/admin/bank-slip-moderate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, subscriptionId: bankSlipAction[1], action: bankSlipAction[2], reason: payload && payload.reason })
        });
        const body = await response.json().catch(() => ({ error: "Administration service unavailable" }));
        return json(body, response.status);
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Administration service unavailable" }, 503);
      }
    }

    const bankSlipView = url.pathname.match(/^\/api\/admin\/bank-slips\/([^/]+)$/);
    if (bankSlipView) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      let key;
      try { key = decodeURIComponent(bankSlipView[1]); } catch { return json({ error: "Invalid bank-slip key" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: "Bank-slip service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const authorization = await connection.fetch("https://internal.invalid/internal/admin/bank-slip-authorize", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims, key })
        });
        const authBody = await authorization.json().catch(() => ({ error: "Bank-slip authorization unavailable" }));
        if (!authorization.ok) return json(authBody, authorization.status);
        if (!isB2Configured(env)) return json({ error: "Bank-slip storage is not configured" }, 503);
        const object = await getPrivateObject(env, key);
        const body = object.Body && typeof object.Body.transformToWebStream === "function" ? object.Body.transformToWebStream() : object.Body;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": authBody.contentType || object.ContentType || "application/octet-stream",
            "cache-control": "private, no-store",
            "content-disposition": "inline",
            "x-content-type-options": "nosniff"
          }
        });
      } catch (error) {
        if (error instanceof FirebaseKeyServiceError) return json({ error: "Authentication service unavailable" }, 503);
        if (error instanceof FirebaseTokenError) return json({ error: "Unauthorized" }, 401);
        return json({ error: "Bank slip not found" }, 404);
      }
    }

    const chatRoute = url.pathname.match(/^\/api\/chat\/(history\/([^/]+)|conversations|send)$/);
    if (chatRoute) {
      const methodAllowed = chatRoute[1] === "history/" + chatRoute[2] ? request.method === "GET"
        : chatRoute[1] === "conversations" ? request.method === "GET" : request.method === "POST";
      if (!methodAllowed) return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        if (!env.MONGODB_CONNECTION) return json({ error: "Chat service unavailable" }, 503);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
          const limit = limitRaw === null ? 50 : Number(limitRaw);
          const skip = skipRaw === null ? 0 : Number(skipRaw);
          if (!Number.isInteger(limit) || !Number.isInteger(skip) || limit < 1 || skip < 0) return json({ error: "Invalid pagination" }, 400);
          const response = await connection.fetch("https://internal.invalid/internal/chat/history", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, roomId, limit, skip })
          });
          const result = await response.json().catch(() => ({ error: "Chat history unavailable" }));
          return json(result, response.status);
        }
        const payload = await request.json().catch(() => null);
        const response = await connection.fetch("https://internal.invalid/internal/chat/send", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ claims, payload })
        });
        const result = await response.json().catch(() => ({ error: "Unable to send chat message" }));
        if (!response.ok) return json(result, response.status);
        const authorization = request.headers.get("authorization") || "";
        const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        if (!idToken || !env.FIREBASE_DATABASE_URL) {
          await connection.fetch("https://internal.invalid/internal/chat/rollback", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, messageId: result._id })
          }).catch(() => {});
          return json({ error: "Realtime chat is not configured" }, 503);
        }
        let databaseBase;
        try {
          const configured = new URL(env.FIREBASE_DATABASE_URL);
          if (configured.protocol !== "https:" || !configured.hostname.endsWith("firebasedatabase.app") && !configured.hostname.endsWith("firebaseio.com")) throw new Error("Invalid database URL");
          databaseBase = configured.toString().replace(/\/+$/, "");
        } catch {
          await connection.fetch("https://internal.invalid/internal/chat/rollback", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, messageId: result._id })
          }).catch(() => {});
          return json({ error: "Realtime chat is not configured" }, 503);
        }
        const room = encodeURIComponent(result.roomId);
        const messageKey = encodeURIComponent(String(result._id));
        const realtimeResponse = await fetch(
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
        ).catch(() => null);
        if (!realtimeResponse || !realtimeResponse.ok) {
          await connection.fetch("https://internal.invalid/internal/chat/rollback", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ claims, messageId: result._id })
          }).catch(() => {});
          return json({ error: "Realtime chat write was rejected; check Firebase Realtime Database rules and configuration" }, 503);
        }
        return json(result, 201);
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
          const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
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
