import { authenticateFirebaseRequest, FirebaseTokenError, FirebaseKeyServiceError } from "./firebase-auth.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

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
        return json({ error: "Password-based administrator login is not yet supported by the serverless API." }, 501);
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
        const isPrivateIp = /^(::1|127\\.|10\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.|192\\.168\\.)/.test(ip);
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
      if (!env.MONGODB_CONNECTION) return json({ error: statusRoute[1] === "purchase" ? "Purchase service unavailable" : "Subscription service unavailable" }, 503);
      let idValue;
      try { idValue = decodeURIComponent(statusRoute[2]); } catch { return json({ error: "Invalid ID" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
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
      if (!env.MONGODB_CONNECTION) return json({ message: "Support ticket service unavailable" }, 503);
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ message: "A message is required." }, 400);
      let ticketId;
      try { ticketId = decodeURIComponent(supportTicketMessage[1]); } catch { return json({ message: "Invalid ticket ID" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
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
      if (!env.MONGODB_CONNECTION) return json({ message: "Support ticket service unavailable" }, 503);
      let ticketId;
      try { ticketId = decodeURIComponent(supportTicketDetails[1]); } catch { return json({ message: "Invalid ticket ID" }, 400); }
      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
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

    return json({ error: "Route not migrated yet" }, 501);
  }
};
