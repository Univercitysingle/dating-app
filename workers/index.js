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
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (!env.FIREBASE_PROJECT_ID) return json({ error: "Authentication is not configured" }, 503);
      if (!env.MONGODB_CONNECTION) return json({ error: "Profile service unavailable" }, 503);

      try {
        const claims = await authenticateFirebaseRequest(request, env.FIREBASE_PROJECT_ID);
        const id = env.MONGODB_CONNECTION.idFromName("mongo-primary");
        const connection = env.MONGODB_CONNECTION.get(id);
        const response = await connection.fetch("https://internal.invalid/internal/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
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

    return json({ error: "Route not migrated yet" }, 501);
  }
};
