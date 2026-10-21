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
    const record = (await this.state.storage.get(body.key)) || { count: 0, resetAt: now + windowMs };
    const current = record.resetAt <= now ? { count: 0, resetAt: now + windowMs } : record;
    current.count += 1;
    await this.state.storage.put(body.key, current);
    return json({ allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt });
  }
}

export { MongoDBConnection } from "./mongodb-connection.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    // The legacy Express logout endpoint is stateless: the client clears its
    // Firebase session/token. Keep the response contract for existing clients.
    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return json({ message: "Logged out successfully." });
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

    return json({ error: "Route not migrated yet" }, 501);
  }
};
