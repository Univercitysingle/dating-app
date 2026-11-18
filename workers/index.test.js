import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { constants, createPublicKey, createSign, generateKeyPairSync, privateEncrypt } from "node:crypto";
import worker, { RateLimiter, MongoDBConnection, requestCdnObject, isFirebaseDatabaseUrl, enforceAccountRateLimit, buildWebXPayCheckoutForm, buildAnalyticsCsv, normalizeAdminPurchaseActionPayload, enforceCallIceRateLimit } from "./index.js";
import { deleteFirebaseAuthIdentity, isValidEmailAddress } from "./mongodb-connection.js";

function request(path, method = "GET") {
  return new Request("https://dating-app.test" + path, { method });
}

test("Firebase Realtime Database URL validation requires an actual Firebase hostname", () => {
  assert.equal(isFirebaseDatabaseUrl("https://test-project-default-rtdb.firebaseio.com"), true);
  assert.equal(isFirebaseDatabaseUrl("https://test-project.firebasedatabase.app"), true);
  assert.equal(isFirebaseDatabaseUrl("https://evilfirebaseio.com"), false);
  assert.equal(isFirebaseDatabaseUrl("https://firebaseio.com.attacker.example"), false);
  assert.equal(isFirebaseDatabaseUrl("http://test-project.firebaseio.com"), false);
  assert.equal(isFirebaseDatabaseUrl("https://user:pass@test-project.firebaseio.com"), false);
});

test("admin email validation rejects malformed and oversized values", () => {
  assert.equal(isValidEmailAddress("admin@example.com"), true);
  assert.equal(isValidEmailAddress(" first.last+tag@example.co.uk "), true);
  assert.equal(isValidEmailAddress("not-an-email"), false);
  assert.equal(isValidEmailAddress("user@@example.com"), false);
  assert.equal(isValidEmailAddress("user@-example.com"), false);
  assert.equal(isValidEmailAddress("user@example..com"), false);
  assert.equal(isValidEmailAddress("x".repeat(250) + "@example.com"), false);
});

test("superadmin login issues a Firebase custom token with root-level role claim", async () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule;
  const passwordHash = await bcrypt.hash("correct-test-password", 4);
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    SUPER_ADMIN_EMAIL: "sadmin",
    SUPER_ADMIN_PASSWORD_HASH: passwordHash,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "firebase-adminsdk@test-project.iam.gserviceaccount.com",
      private_key: privateKey
    }),
    RATE_LIMITER: {
      idFromName() { return "test-rate-limit"; },
      get() {
        return {
          async fetch() {
            return new Response(JSON.stringify({ allowed: true, resetAt: Date.now() + 900000 }), { status: 200 });
          }
        };
      }
    },
    MONGODB_CONNECTION: {
      idFromName: name => name,
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      })
    }
  };
  const response = await worker.fetch(new Request("https://dating-app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.41" },
    body: JSON.stringify({ email: "sadmin", password: "correct-test-password" })
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const payload = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(payload.uid, "superadmin_uid");
  assert.equal(payload.role, "superadmin");
  assert.equal(payload.claims, undefined);
});

test("restricted features reject wildcard country configuration on every route family", async () => {
  const env = { DARK_FANTASY_ENABLED: "true", DARK_FANTASY_ALLOWED_COUNTRIES: "*" };
  for (const path of [
    "/api/video-rooms/ice-config",
    "/api/dark-fantasy/communities",
    "/api/dark-fantasy/profile",
    "/api/dark-fantasy/catalog"
  ]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 404, path + " must reject wildcard access");
    assert.deepEqual(await response.json(), { error: "Dark Fantasy is not available in this region." });
  }
});

test("GET / returns API metadata without pretending to serve the login UI", async () => {
  const response = await worker.fetch(request("/"), { MIGRATION_STAGE: "test" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: "dating-app-api",
    stage: "test",
    status: "ok",
    frontend: "not_served_by_this_worker"
  });
});

test("API JSON responses include a same-origin resource policy", async () => {
  const response = await worker.fetch(request("/health"), { MIGRATION_STAGE: "test" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
});

test("GET /favicon.ico returns an empty response instead of an unmigrated-route error", async () => {
  const response = await worker.fetch(request("/favicon.ico"), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(await response.text(), "");
});

test("API JSON responses explicitly disable browser and intermediary caching", async () => {
  const response = await worker.fetch(request("/"), { MIGRATION_STAGE: "test" });
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, max-age=0");
});

test("API robots policy is explicit, non-cacheable, and protected by HSTS", async () => {
  const response = await worker.fetch(request("/robots.txt"), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, max-age=0");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(await response.text(), "User-agent: *\nDisallow: /\n");
});

test("API sitemap path returns a real not-found response instead of a 501 server error", async () => {
  const response = await worker.fetch(request("/sitemap.xml"), {});
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found" });
});

test("HEAD requests for API crawler resources do not return response bodies", async () => {
  const robots = await worker.fetch(request("/robots.txt", "HEAD"), {});
  const sitemap = await worker.fetch(request("/sitemap.xml", "HEAD"), {});
  assert.equal(robots.status, 200);
  assert.equal(sitemap.status, 404);
  assert.equal(await robots.text(), "");
  assert.equal(await sitemap.text(), "");
});

test("legacy /api/media reads redirect to the configured CDN hostname", async () => {
  const key = "photos-D6gTK2fprqcNk7hSWpWFPx8kdgE2-1757226432186.jpg";
  const response = await worker.fetch(request("/api/media/" + key), {
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/"
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"),
    "https://dateme.enadoctemp.workers.dev/" + key);
});

test("legacy /api/media reads fail closed when CDN_HOSTNAME is missing", async () => {
  const response = await worker.fetch(request("/api/media/photos-user-1757226432186.jpg"), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Media storage unavailable" });
});

test("media object writes cannot bypass the dedicated CDN proxy", async () => {
  const key = "photos-user-1757226432186.jpg";
  const response = await worker.fetch(request("/api/media/" + key, "PUT"), {
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/"
  });
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "Method not allowed" });
});

test("GET /health returns a non-sensitive liveness response", async () => {
  const response = await worker.fetch(request("/health"), { MIGRATION_STAGE: "test" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "dating-app-api", stage: "test" });
});

test("GET /ready fails closed when required configuration is missing", async () => {
  const response = await worker.fetch(request("/ready"), {});
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, "not_ready");
  assert.ok(body.missingConfiguration.includes("FIREBASE_PROJECT_ID"));
  assert.ok(body.missingConfiguration.includes("MONGODB_URI"));
});

test("GET /ready fails closed when MongoDB binding is missing", async () => {
  const response = await worker.fetch(request("/ready"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_URI: "mongodb://unused",
    MONGODB_DATABASE: "test"
  });
  assert.equal(response.status, 503);
});

test("GET /ready reports ready only when the MongoDB probe succeeds", async () => {
  const response = await worker.fetch(request("/ready"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_URI: "mongodb://unused",
    MONGODB_DATABASE: "test",
    MONGODB_CONNECTION: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response("ok", { status: 200 }) })
    }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ready",
    dependencies: { mongodb: "ok", firebase: "configuration_present" }
  });
});

test("GET /ready does not expose probe errors", async () => {
  const response = await worker.fetch(request("/ready"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_URI: "mongodb://unused",
    MONGODB_DATABASE: "test",
    MONGODB_CONNECTION: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => { throw new Error("private database detail"); } })
    }
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private database detail/);
});

test("unmigrated API routes are not silently accepted", async () => {
  const response = await worker.fetch(request("/api/admin/not-migrated"), {});
  assert.equal(response.status, 501);
});

test("rate limiter rejects invalid payloads and methods", async () => {
  const limiter = new RateLimiter({ storage: { get: async () => undefined, put: async () => {} } });
  assert.equal((await limiter.fetch(request("/"))).status, 405);
  const invalid = await limiter.fetch(new Request("https://do.test", {
    method: "POST", body: JSON.stringify({ key: "" }), headers: { "content-type": "application/json" }
  }));
  assert.equal(invalid.status, 400);
});

test("rate limiter enforces a configured count within a window", async () => {
  const store = new Map();
  const limiter = new RateLimiter({ storage: {
    get: async (key) => store.get(key),
    put: async (key, value) => store.set(key, value)
  }});
  const call = () => limiter.fetch(new Request("https://do.test", {
    method: "POST", body: JSON.stringify({ key: "user-1", limit: 1, windowMs: 10000 }),
    headers: { "content-type": "application/json" }
  }));
  assert.equal((await (await call()).json()).allowed, true);
  assert.equal((await (await call()).json()).allowed, false);
});

test("rate limiter serializes concurrent requests at the limit boundary", async () => {
  const values = new Map();
  const storage = {
    get: async (key) => values.get(key),
    put: async (key, value) => values.set(key, value)
  };
  let transactionTail = Promise.resolve();
  const state = {
    storage: {
      ...storage,
      transaction: async (callback) => {
        const result = transactionTail.then(() => callback(storage));
        transactionTail = result.catch(() => {});
        return result;
      }
    }
  };
  const limiter = new RateLimiter(state);
  const call = () => limiter.fetch(new Request("https://do.test", {
    method: "POST",
    body: JSON.stringify({ key: "concurrent-user", limit: 5, windowMs: 10000 }),
    headers: { "content-type": "application/json" }
  }));
  const responses = await Promise.all(Array.from({ length: 20 }, call));
  const results = await Promise.all(responses.map(response => response.json()));
  assert.equal(results.filter(result => result.allowed).length, 5);
  assert.equal(results.filter(result => !result.allowed).length, 15);
  assert.equal(values.get("concurrent-user").count, 20);
});

test("Report creation rejects invalid input before touching MongoDB", async () => {
  const connection = new MongoDBConnection({}, {});
  const selfReport = await connection.createReport("user-a", {
    reportedUserUid: "user-a",
    reason: "This is a test",
    category: "spam"
  });
  assert.equal(selfReport.status, 400);
  const invalidCategory = await connection.createReport("user-a", {
    reportedUserUid: "user-b",
    reason: "This is a test",
    category: "made-up"
  });
  assert.equal(invalidCategory.status, 400);
  const emptyReason = await connection.createReport("user-a", {
    reportedUserUid: "user-b",
    reason: "   ",
    category: "spam"
  });
  assert.equal(emptyReason.status, 400);
});

test("MongoDB Durable Object honors the configured database name", () => {
  let selectedDatabase;
  const connection = new MongoDBConnection({}, { MONGODB_DATABASE: "test" });
  const database = connection.getDatabase({
    db: (name) => {
      selectedDatabase = name;
      return { name };
    }
  });
  assert.equal(selectedDatabase, "test");
  assert.deepEqual(database, { name: "test" });
});

test("MongoDB Durable Object preserves the URI default when no database override is set", () => {
  let selectedDatabase = "not-called";
  const connection = new MongoDBConnection({}, {});
  connection.getDatabase({
    db: (name) => {
      selectedDatabase = name;
      return { name };
    }
  });
  assert.equal(selectedDatabase, undefined);
});

test("MongoDB Durable Object ping fails closed without a URI", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.deepEqual(await connection.ping(), { ok: false });
});

test("MongoDB readiness probe checks connectivity without requiring index-management permissions", async () => {
  const events = [];
  const db = { async command(value) { events.push(value); return { ok: 1 }; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  connection.ensureSubscriptionIndexes = async () => {
    assert.fail("Readiness must not require subscription index-management permissions");
  };
  assert.deepEqual(await connection.ping(), { ok: true });
  assert.deepEqual(events, [{ ping: 1 }]);
});

test("MongoDB Durable Object exposes no general-purpose HTTP operation", async () => {
  const connection = new MongoDBConnection({}, {});
  const response = await connection.fetch(request("/internal/query", "POST"));
  assert.equal(response.status, 404);
});

test("report, block, and unmatch routes require Firebase authentication", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project", MONGODB_CONNECTION: {} };
  const report = await worker.fetch(new Request("https://dating-app.test/api/reports", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ reportedUserUid: "target", category: "spam", reason: "This is spam." })
  }), env);
  const block = await worker.fetch(new Request("https://dating-app.test/api/users/block/target", { method: "POST" }), env);
  const unmatch = await worker.fetch(new Request("https://dating-app.test/api/users/unmatch/target", { method: "POST" }), env);
  assert.equal(report.status, 401);
  assert.equal(block.status, 401);
  assert.equal(unmatch.status, 401);
});

test("initial password setup rejects anonymous requests and unsupported methods", async () => {
  const anonymous = await worker.fetch(new Request("https://dating-app.test/api/auth/set-initial-password", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newPassword: "long-enough" })
  }), { FIREBASE_PROJECT_ID: "test-project", MONGODB_CONNECTION: {} });
  assert.equal(anonymous.status, 401);
  const wrongMethod = await worker.fetch(request("/api/auth/set-initial-password", "GET"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(wrongMethod.status, 405);
});

test("initial password setup hashes the password and clears the setup flag", async () => {
  let update;
  const users = {
    findOne: async () => ({ mustSetPassword: true }),
    updateOne: async (_query, value) => { update = value; return { matchedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.setInitialPassword("user-1", "secure-password");
  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Password set successfully.");
  assert.match(update.$set.password, /^\$2[aby]\$/);
  assert.equal(update.$set.mustSetPassword, false);
});

test("Firebase token login rejects missing credentials and unsupported methods", async () => {
  const missing = await worker.fetch(new Request("https://dating-app.test/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({})
  }), { FIREBASE_PROJECT_ID: "test-project", MONGODB_CONNECTION: {} });
  assert.equal(missing.status, 400);
  const wrongMethod = await worker.fetch(request("/api/auth/login", "GET"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(wrongMethod.status, 405);
});

test("Firebase token login rejects invalid tokens without provisioning users", async () => {
  const response = await worker.fetch(new Request("https://dating-app.test/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "not-a-valid-token" })
  }), { FIREBASE_PROJECT_ID: "test-project", MONGODB_CONNECTION: {} });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid or expired token" });
});

test("password-based administrator login fails closed when secure signing secrets are missing", async () => {
  const response = await worker.fetch(new Request("https://dating-app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "not-a-real-password" })
  }), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test("GET /api/auth/test preserves the legacy non-sensitive diagnostic route", async () => {
  const response = await worker.fetch(request("/api/auth/test"), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(await response.text(), "Auth test route is working");
});

test("POST /api/auth/test rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/auth/test", "POST"), {});
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "Method not allowed" });
});

test("POST /api/auth/logout preserves the legacy stateless logout response", async () => {
  const response = await worker.fetch(request("/api/auth/logout", "POST"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "Logged out successfully." });
});

test("POST /api/auth/logout rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/auth/logout", "GET"), {});
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "Method not allowed" });
});

test("undo swipe endpoint rejects anonymous requests", async () => {
  const response = await worker.fetch(request("/api/swipe/undo", "POST"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 401);
});

test("undo swipe restores a prior like and consumes an undo credit", async () => {
  const current = { uid: "current", purchasedUndoSwipes: 1, lastSwipe: { action: "like", targetUserId: "target", matchId: "match-id" } };
  const target = { _id: "target-id", uid: "target", email: "private@example.com", password: "secret", photos: [] };
  let matchUpdate, userUpdates = [];
  const users = {
    findOne: async (query) => query.uid === "current" ? current : target,
    updateOne: async (query, update) => { userUpdates.push({ query, update }); return { matchedCount: 1 }; }
  };
  const matches = {
    findOne: async () => ({ _id: "match-id", user1Uid: "current", user2Uid: "target", likedBy: ["current"] }),
    updateOne: async (_query, update) => { matchUpdate = update; return { matchedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : matches }) });
  const result = await connection.undoSwipe("current");
  assert.equal(result.status, 200);
  assert.equal(result.body.undoneUser.uid, "target");
  assert.equal(result.body.undoneUser.email, undefined);
  assert.equal(result.body.undoneUser.password, undefined);
  assert.deepEqual(matchUpdate.$pull, { likedBy: "current" });
  assert.equal(matchUpdate.$set.status, "pending");
  assert.ok(userUpdates.some(entry => entry.update.$inc?.purchasedUndoSwipes === -1));
  assert.ok(userUpdates.some(entry => entry.update.$unset?.lastSwipe === ""));
});

test("swipe endpoints reject anonymous requests and invalid methods", async () => {
  const anonymous = await worker.fetch(new Request("https://dating-app.test/api/swipe/like", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "target" })
  }), { FIREBASE_PROJECT_ID: "test-project", MONGODB_CONNECTION: {} });
  assert.equal(anonymous.status, 401);
  const wrongMethod = await worker.fetch(request("/api/swipe/pass"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(wrongMethod.status, 405);
});

test("swipe persistence rejects self-swipes and blocked targets", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.equal((await connection.recordSwipe("user-1", "user-1", "like")).status, 400);
  const users = {
    findOne: async (query) => query.uid === "user-1" ? { blocked: ["user-2"] } : { blocked: [] }
  };
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const blocked = await connection.recordSwipe("user-1", "user-2", "like");
  assert.equal(blocked.status, 403);
});

test("like swipe creates a pending match and notification", async () => {
  let insertedMatch, insertedNotification, recordedSwipe;
  const users = {
    findOne: async (query) => ({ uid: query.uid, blocked: [] }),
    updateOne: async (_query, update) => { recordedSwipe = update.$set.lastSwipe; return { matchedCount: 1 }; }
  };
  const matches = {
    findOne: async () => null,
    insertOne: async (doc) => { insertedMatch = doc; return { insertedId: "match-id" }; },
    updateOne: async () => ({ matchedCount: 1 })
  };
  const notifications = {
    async updateOne(query, update, options) {
      insertedNotification = { ...query, ...update.$setOnInsert, updatedAt: update.$set.updatedAt };
      assert.equal(options.upsert, true);
      return { upsertedCount: 1 };
    },
    deleteOne: async () => ({ deletedCount: 0 })
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : name === "matches" ? matches : notifications }) });
  const result = await connection.recordSwipe("user-1", "user-2", "like");
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "pending");
  assert.deepEqual(result.body.likedBy, ["user-1"]);
  assert.equal(insertedMatch.user1Uid, "user-1");
  assert.equal(insertedNotification.type, "like");
  assert.equal(insertedNotification.recipientUid, "user-2");
  assert.equal(recordedSwipe.targetUserId, "user-2");
});

test("super-like consumes a purchased credit and records super-like notification", async () => {
  const userUpdates = [];
  let insertedMatch, insertedNotification;
  const users = {
    findOne: async (query) => query.uid === "user-1"
      ? { uid: "user-1", blocked: [], purchasedSuperLikes: 1, superLikes: { count: 0 } }
      : { uid: "user-2", blocked: [] },
    updateOne: async (query, update) => { userUpdates.push({ query, update }); return { matchedCount: 1 }; }
  };
  const matches = {
    findOne: async () => null,
    insertOne: async (doc) => { insertedMatch = doc; return { insertedId: "super-match-id" }; },
    updateOne: async () => ({ matchedCount: 1 })
  };
  const notifications = {
    async updateOne(query, update, options) {
      insertedNotification = { ...query, ...update.$setOnInsert, updatedAt: update.$set.updatedAt };
      assert.equal(options.upsert, true);
      return { upsertedCount: 1 };
    },
    deleteOne: async () => ({ deletedCount: 0 })
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : name === "matches" ? matches : notifications }) });
  const result = await connection.recordSwipe("user-1", "user-2", "superlike");
  assert.equal(result.status, 200);
  assert.equal(result.body.superLike, true);
  assert.equal(insertedMatch.superLike, true);
  assert.equal(insertedNotification.type, "superlike");
  assert.ok(userUpdates.some(entry => entry.update.$inc?.purchasedSuperLikes === -1));
});

test("legacy match-like route rejects anonymous requests and unsupported methods", async () => {
  const anonymous = await worker.fetch(request("/api/matches/like/target", "POST"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(anonymous.status, 401);
  const wrongMethod = await worker.fetch(request("/api/matches/like/target", "GET"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(wrongMethod.status, 405);
});

test("notifications endpoint rejects anonymous requests and unsupported methods", async () => {
  const anonymous = await worker.fetch(request("/api/notifications"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(anonymous.status, 401);
  const wrongMethod = await worker.fetch(request("/api/notifications", "POST"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(wrongMethod.status, 405);
});

test("notifications return pending items ordered newest first", async () => {
  let query, sortSpec;
  const notifications = {
    find: (value) => {
      query = value;
      return { sort: (value) => { sortSpec = value; return { toArray: async () => [{ type: "like" }] }; } };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => notifications }) });
  const result = await connection.getNotifications("user-1");
  assert.equal(result.status, 200);
  assert.deepEqual(query, { recipientUid: "user-1", status: "pending" });
  assert.deepEqual(sortSpec, { createdAt: -1 });
  assert.deepEqual(result.body, [{ type: "like" }]);
});

test("match read endpoints reject anonymous requests", async () => {
  for (const path of ["/api/matches", "/api/matches/confirmed"]) {
    const response = await worker.fetch(request(path), {
      FIREBASE_PROJECT_ID: "test-project",
      MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  }
});

test("match read endpoints reject unsupported methods", async () => {
  const response = await worker.fetch(request("/api/matches", "POST"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 405);
});

test("discovery endpoint rejects anonymous requests", async () => {
  const response = await worker.fetch(request("/api/users/discover"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("discovery endpoint rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/users/discover", "POST"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 405);
});

test("subscription history endpoint rejects anonymous requests", async () => {
  const response = await worker.fetch(request("/api/users/me/subscriptions"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("subscription history endpoint rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/users/me/subscriptions", "POST"), {
    FIREBASE_PROJECT_ID: "test-project"
  });
  assert.equal(response.status, 405);
});

test("likes endpoint rejects anonymous requests", async () => {
  const response = await worker.fetch(request("/api/users/likes"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("likes endpoint rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/users/likes", "POST"), {
    FIREBASE_PROJECT_ID: "test-project"
  });
  assert.equal(response.status, 405);
});

test("Firebase verification endpoint rejects missing bearer credentials", async () => {
  const response = await worker.fetch(request("/api/auth/verify"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("Firebase verification endpoint fails closed when project configuration is missing", async () => {
  const response = await worker.fetch(request("/api/auth/verify"), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Authentication is not configured" });
});

test("Firebase verification endpoint rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/auth/verify", "POST"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 405);
});

test("current-user profile endpoint rejects anonymous requests", async () => {
  const response = await worker.fetch(request("/api/users/me"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("current-user profile endpoint rejects unsupported methods", async () => {
  const response = await worker.fetch(request("/api/users/me", "POST"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 405);
});

test("account provisioning refuses unverified email for a new account", async () => {
  let inserted = false;
  const users = {
    findOne: async () => null,
    insertOne: async () => { inserted = true; return { insertedId: "new-id" }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.findOrCreateUserFromClaims({ sub: "firebase-user-1", email: "new@example.com", email_verified: false });
  assert.equal(result.status, 403);
  assert.equal(inserted, false);
});

test("account provisioning creates a verified user with legacy trial defaults", async () => {
  const users = {
    findOne: async () => null,
    insertOne: async (user) => { assert.equal(user.uid, "firebase-user-2"); return { insertedId: "new-id" }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.findOrCreateUserFromClaims({
    sub: "firebase-user-2", email: "  New@Example.com ", email_verified: true, name: "New User"
  });
  assert.equal(result.status, 200);
  assert.equal(result.user.email, "new@example.com");
  assert.equal(result.user.name, "New User");
  assert.equal(result.user.plan, "basic");
  assert.equal(result.user.role, "user");
  assert.equal(result.user.isOnboardingComplete, false);
  assert.ok(result.user.trialExpires instanceof Date);
});

test("account provisioning never links an email already bound to another UID", async () => {
  const users = {
    findOne: async (query) => query.uid
      ? null
      : { _id: "existing-id", uid: "different-firebase-user", email: "same@example.com" },
    findOneAndUpdate: async () => { throw new Error("Must not relink an account"); }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.findOrCreateUserFromClaims({
    sub: "firebase-user-3", email: "same@example.com", email_verified: true
  });
  assert.equal(result.status, 409);
});

test("MongoDB Durable Object rejects malformed internal profile requests", async () => {
  const connection = new MongoDBConnection({}, {});
  const response = await connection.fetch(new Request("https://do.test/internal/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uid: "" })
  }));
  assert.equal(response.status, 400);
});

test("profile updates whitelist fields and preserve legacy response shape", async () => {
  const stored = { _id: "mongo-id", uid: "user-1", email: "user@example.com", isOnboardingComplete: false, name: "Old", role: "user" };
  let updateDoc;
  const users = {
    findOne: async (_query, options) => options?.projection?.isOnboardingComplete ? { isOnboardingComplete: false } : stored,
    updateOne: async (_query, update) => { updateDoc = update; Object.assign(stored, update.$set); return { modifiedCount: 1 }; }
  };
  const subscriptions = { findOne: async () => null };
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : subscriptions }) });
  const result = await connection.updateCurrentUserProfile("user-1", {
    name: "New Name", role: "admin", password: "do-not-store", bio: "Hello",
    socialMediaLinks: { instagram: "@ok", unsafe: "drop" }
  });
  assert.equal(result.status, 200);
  assert.equal(stored.name, "New Name");
  assert.equal(stored.role, "user");
  assert.equal(stored.password, undefined);
  assert.deepEqual(updateDoc.$set.socialMediaLinks, { instagram: "@ok" });
  assert.equal(result.body.id, "mongo-id");
  assert.equal(result.body.email, "user@example.com");
  assert.equal(result.body.bio, "Hello");
});

test("profile updates reject underage birthdays and malformed mobile numbers", async () => {
  const users = { findOne: async () => ({ isOnboardingComplete: false }) };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  assert.equal((await connection.updateCurrentUserProfile("user-1", { birthday: "2015-01-01" })).status, 400);
  assert.equal((await connection.updateCurrentUserProfile("user-1", { mobileNumber: "123" })).status, 400);
});

test("subscription history returns the ten newest records for the current user", async () => {
  let subscriptionQuery, sortSpec, limitValue;
  const user = { _id: "mongo-user-id" };
  const subscriptions = {
    updateMany: async () => ({ modifiedCount: 0 }),
    find: (query) => {
      subscriptionQuery = query;
      return {
        sort: (value) => { sortSpec = value; return {
          limit: (value) => { limitValue = value; return { toArray: async () => [{ plan: "premium" }] }; }
        }; }
      };
    }
  };
  const users = { findOne: async () => user };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : subscriptions }) });
  const result = await connection.getSubscriptionHistory("current");
  assert.equal(result.status, 200);
  assert.deepEqual(subscriptionQuery, { userId: "mongo-user-id" });
  assert.deepEqual(sortSpec, { createdAt: -1 });
  assert.equal(limitValue, 10);
  assert.deepEqual(result.body, [{ plan: "premium" }]);
});

test("potential matches preserve legacy score and pagination response shape", async () => {
  const current = { uid: "current", interests: ["music"], relationshipGoals: "Long-term", personalityQuizResults: { type: "INFJ" }, role: "user" };
  const candidates = [
    { _id: "candidate-id", uid: "candidate", name: "Candidate", email: "private@example.com", interests: ["MUSIC"], relationshipGoals: "long-term", personalityQuizResults: { type: "infj" }, photos: [] },
    { _id: "other-id", uid: "other", name: "Other", interests: [], photos: [] }
  ];
  const users = {
    findOne: async () => current,
    find: () => ({ toArray: async () => candidates })
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.getPotentialMatches("current", { page: "1", limit: "1" });
  assert.equal(result.status, 200);
  assert.equal(result.body.totalMatches, 2);
  assert.equal(result.body.totalPages, 2);
  assert.equal(result.body.matches.length, 1);
  assert.equal(result.body.matches[0].user.uid, "candidate");
  assert.equal(result.body.matches[0].matchScore, 60);
  assert.equal(result.body.matches[0].user.email, undefined);
});

test("discovery validates filters before querying MongoDB", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => ({ findOne: async () => ({ uid: "current" }) }) }) });
  const invalid = await connection.discoverUsers("current", { minAge: "not-a-number" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: "Invalid discovery filter" });
});

test("profile updates persist only supported discovery preferences", async () => {
  let update;
  const current = { _id: "current-id", uid: "current", isOnboardingComplete: true, preference: "everyone" };
  const users = {
    findOne: async () => current,
    updateOne: async (_query, value) => { update = value; return { matchedCount: 1 }; }
  };
  const subscriptions = { findOne: async () => null };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({
    db: () => ({ collection: name => name === "users" ? users : subscriptions })
  });

  const valid = await connection.updateCurrentUserProfile("current", { preference: "Female" });
  assert.equal(valid.status, 200);
  assert.equal(update.$set.preference, "Female");

  update = null;
  const invalid = await connection.updateCurrentUserProfile("current", { preference: "anyone" });
  assert.equal(invalid.status, 400);
  assert.equal(update, null);
});

test("discovery applies the saved gender preference and everyone remains unfiltered", async () => {
  let femalePipeline;
  const createConnection = preference => {
    const users = {
      findOne: async () => ({ uid: "current", preference, location: { coordinates: [0, 0] } }),
      aggregate: pipeline => {
        if (preference === "Female") femalePipeline = pipeline;
        return { toArray: async () => [] };
      }
    };
    const matches = { createIndex: async () => "index-created" };
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({
      db: () => ({ collection: name => name === "users" ? users : matches })
    });
    return connection;
  };

  const female = await createConnection("Female").discoverUsers("current", {});
  assert.equal(female.status, 200);
  const femaleMatch = femalePipeline.find(stage => stage.$match)?.$match;
  assert.equal(femaleMatch.gender, "Female");

  let everyonePipeline;
  const everyoneUsers = {
    findOne: async () => ({ uid: "current", preference: "everyone", location: { coordinates: [0, 0] } }),
    aggregate: pipeline => { everyonePipeline = pipeline; return { toArray: async () => [] }; }
  };
  const matches = { createIndex: async () => "index-created" };
  const everyoneConnection = new MongoDBConnection({}, {});
  everyoneConnection.getClient = async () => ({
    db: () => ({ collection: name => name === "users" ? everyoneUsers : matches })
  });
  const everyone = await everyoneConnection.discoverUsers("current", {});
  assert.equal(everyone.status, 200);
  const everyoneMatch = everyonePipeline.find(stage => stage.$match)?.$match;
  assert.equal(Object.hasOwn(everyoneMatch, "gender"), false);
});

test("discovery returns ordered public profiles with super-like metadata", async () => {
  const current = { uid: "current", preference: "everyone", location: { coordinates: [0, 0] } };
  const candidate = { _id: "candidate-id", uid: "candidate", name: "Candidate", email: "private@example.com", password: "secret", lastLoginIp: "192.0.2.1", photos: [{ url: "photos/a.jpg" }] };
  let pipeline;
  const users = {
    findOne: async () => current,
    aggregate: (value) => { pipeline = value; return { toArray: async () => [{ uid: "candidate" }] }; },
    find: () => ({ toArray: async () => [candidate] })
  };
  const matches = { createIndex: async () => "index-created", find: () => ({ project: () => ({ toArray: async () => [{ user1Uid: "candidate" }] }) }) };
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : matches }) });
  const result = await connection.discoverUsers("current", { relationshipGoals: "Long-term relationship" });
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].uid, "candidate");
  assert.equal(result.body[0].email, undefined);
  assert.equal(result.body[0].password, undefined);
  assert.equal(result.body[0].lastLoginIp, undefined);
  assert.equal(result.body[0].superLikedByCurrentUser, true);
  assert.equal(result.body[0].photos[0].url, "https://cdn.example.com/photos/a.jpg");
  assert.ok(pipeline.some(stage => stage.$lookup && stage.$lookup.from === "matches"));
  const initialMatch = pipeline.find(stage => stage.$match)?.$match;
  assert.equal(initialMatch.uid.$type, "string", "profiles without a valid UID must not enter the candidate pipeline");
  const combinedUsersProjection = pipeline.find(stage => stage.$project?.combinedUsers)?.$project.combinedUsers;
  assert.ok(combinedUsersProjection, "boosted and regular candidates should be combined safely");
  assert.doesNotMatch(JSON.stringify(combinedUsersProjection), /"\$in"/,
    "Discover candidate assembly must not rely on an aggregation $in with potentially missing array values");
});

test("likes query returns pending likers with privacy filtering and premium blur metadata", async () => {
  const current = { _id: "current-id", uid: "current", plan: "premium" };
  const liker = {
    _id: "liker-id", uid: "liker", name: "Liker", email: "private@example.com",
    mobileNumber: "+971501234567", password: "never-return", lastLoginIp: "192.0.2.1",
    photos: [{ url: "photos/one.jpg" }]
  };
  const users = {
    findOne: async (query) => query.uid === "current" ? current : null,
    find: () => ({ toArray: async () => [liker] })
  };
  const matches = { find: (query) => {
    assert.deepEqual(query, { $or: [{ user1Uid: "current" }, { user2Uid: "current" }], status: "pending" });
    return { toArray: async () => [{ user1Uid: "liker", user2Uid: "current", status: "pending", superLike: true }] };
  }};
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : matches }) });
  const result = await connection.getLikes("current");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].likeType, "superlike");
  assert.equal(result.body[0].isBlurred, false);
  assert.equal(result.body[0].email, undefined);
  assert.equal(result.body[0].mobileNumber, undefined);
  assert.equal(result.body[0].password, undefined);
  assert.equal(result.body[0].lastLoginIp, undefined);
  assert.equal(result.body[0].photos[0].url, "https://cdn.example.com/photos/one.jpg");
});

test("likes query returns an empty list when no pending likes exist", async () => {
  const users = { findOne: async () => ({ _id: "current-id", plan: "premium" }) };
  const matches = { find: () => ({ toArray: async () => [] }) };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : matches }) });
  const result = await connection.getLikes("current");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, []);
});

test("public profile endpoint rejects anonymous requests", async () => {
  const response = await worker.fetch(request("/api/users/some-user"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  });
  assert.equal(response.status, 401);
});

test("public profile sanitization hides email and mobile from other users", async () => {
  const target = { _id: "target-id", uid: "target", email: "private@example.com", mobileNumber: "private-mobile", phoneNumber: "private-phone", contactNumber: "private-contact", name: "Target", photos: [{ url: "photo.jpg" }] };
  const viewer = { uid: "viewer", role: "user" };
  const users = { findOne: async (query) => query.uid === "target" ? target : viewer };
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.getUserProfile("target", "viewer");
  assert.equal(result.status, 200);
  assert.equal(result.body.id, "target-id");
  assert.equal(result.body.email, undefined);
  assert.equal(result.body.mobileNumber, undefined);
  assert.equal(result.body.phoneNumber, undefined);
  assert.equal(result.body.contactNumber, undefined);
  assert.equal(result.body.photos[0].url, "https://cdn.example.com/photo.jpg");
});

test("profile owner and superadmin retain the legacy full-profile view", async () => {
  const target = { _id: "target-id", uid: "target", email: "private@example.com", mobileNumber: "+971501234567", role: "user" };
  const admin = { uid: "admin", role: "superadmin" };
  const users = { findOne: async (query) => query.uid === "target" ? target : admin };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const owner = await connection.getUserProfile("target", "target");
  const superadmin = await connection.getUserProfile("target", "admin");
  assert.equal(owner.body.email, "private@example.com");
  assert.equal(superadmin.body.mobileNumber, "+971501234567");
});

test("ordinary admins cannot view another user's private contact fields", async () => {
  const target = { _id: "target-id", uid: "target", email: "private@example.com", mobileNumber: "private-mobile", phoneNumber: "private-phone", contactNumber: "private-contact" };
  const admin = { uid: "admin", role: "admin" };
  const users = { findOne: async (query) => query.uid === "target" ? target : admin };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.getUserProfile("target", "admin");
  assert.equal(result.status, 200);
  assert.equal(result.body.email, undefined);
  assert.equal(result.body.mobileNumber, undefined);
  assert.equal(result.body.phoneNumber, undefined);
  assert.equal(result.body.contactNumber, undefined);
});

test("public profile returns 404 for unknown users", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => ({ findOne: async () => null }) }) });
  assert.equal((await connection.getUserProfile("missing", "viewer")).status, 404);
});

test("blocking rejects self-targets and unknown target users", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.equal((await connection.updateBlockedUser("user-1", "user-1", "block")).status, 400);
  connection.getClient = async () => ({ db: () => ({ collection: () => ({ findOne: async () => null }) }) });
  const missing = await connection.updateBlockedUser("user-1", "missing", "block");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "User to block not found.");
});

test("blocking updates block list and unmatches the pair using sorted UIDs", async () => {
  let userUpdate, matchUpdate;
  const users = {
    findOne: async () => ({ _id: "target-id" }),
    updateOne: async (_query, update) => { userUpdate = update; return { matchedCount: 1 }; }
  };
  const matches = { updateOne: async (query, update) => { matchUpdate = { query, update }; return { matchedCount: 1 }; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : matches }) });
  const result = await connection.updateBlockedUser("z-user", "a-user", "block");
  assert.equal(result.status, 200);
  assert.deepEqual(userUpdate.$addToSet, { blocked: "a-user" });
  assert.deepEqual(matchUpdate.query, { user1Uid: "a-user", user2Uid: "z-user" });
  assert.equal(matchUpdate.update.$set.status, "unmatched");
  assert.deepEqual(matchUpdate.update.$unset, { likedBy: "" });
});

test("unblocking removes the target and preserves legacy message shape", async () => {
  let update;
  const users = { updateOne: async (_query, value) => { update = value; return { matchedCount: 1 }; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.updateBlockedUser("user-1", "user-2", "unblock");
  assert.equal(result.status, 200);
  assert.deepEqual(update.$pull, { blocked: "user-2" });
  assert.deepEqual(result.body, { message: "User user-2 successfully unblocked." });
});


test("call ICE credential requests use an isolated per-account limiter", async () => {
  let observedName = "";
  let observedPayload = null;
  const env = {
    RATE_LIMITER: {
      idFromName(name) { observedName = name; return name; },
      get() {
        return { async fetch(_url, options) {
          observedPayload = JSON.parse(options.body);
          return new Response(JSON.stringify({ allowed: true, resetAt: Date.now() + 60000 }), { status: 200 });
        }};
      }
    }
  };
  assert.equal(await enforceCallIceRateLimit(env, { sub: "user-123" }), null);
  assert.equal(observedName, "call-ice-config:user-123");
  assert.deepEqual(observedPayload, { key: "call-ice-config", limit: 20, windowMs: 60000 });
  assert.equal(await enforceCallIceRateLimit(env, { sub: "user-123" }, "video-room-ice-config"), null);
  assert.equal(observedName, "video-room-ice-config:user-123");
  assert.deepEqual(observedPayload, { key: "video-room-ice-config", limit: 20, windowMs: 60000 });
});

test("call ICE credential limiter fails closed when abuse protection is unavailable", async () => {
  const response = await enforceCallIceRateLimit({}, { sub: "user-123" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /abuse protection/i);
});

test("photo upload rate limiting fails closed when the limiter binding is missing", async () => {
  const response = await enforceAccountRateLimit(
    {},
    "photo-upload-user",
    "user-123",
    10,
    60 * 60 * 1000,
    "Photo upload limit reached. Please retry later."
  );
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /abuse protection is unavailable/i);
});

test("photo upload rate limiting fails closed when the limiter service is unavailable", async () => {
  const response = await enforceAccountRateLimit({
    RATE_LIMITER: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response("unavailable", { status: 503 }) })
    }
  }, "photo-upload-user", "user-123", 10, 60 * 60 * 1000, "Photo upload limit reached. Please retry later.");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/i);
});

test("R2 photo upload and deletion routes require Firebase authentication", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project" };
  const upload = await worker.fetch(new Request("https://dating-app.test/api/users/photos", {
    method: "POST", body: new FormData()
  }), env);
  assert.equal(upload.status, 401);
  const deletion = await worker.fetch(new Request("https://dating-app.test/api/users/photos", {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoUrl: "photos-user-a-sample.jpg" })
  }), env);
  assert.equal(deletion.status, 401);
});

test("photo metadata operations reject cross-user object keys before database access", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.equal((await connection.addUploadedPhoto("user-a", { url: "photos-user-b-sample.jpg", size: 100, order: 0 })).status, 400);
  assert.equal((await connection.removeUploadedPhoto("user-a", "photos-user-b-sample.jpg")).status, 400);
});

test("photo ordering rejects malformed payloads and too many photos", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.equal((await connection.updatePhotoOrder("user-1", null)).status, 400);
  assert.equal((await connection.updatePhotoOrder("user-1", Array.from({ length: 7 }, (_, i) => ({ url: "photo-" + i })))).status, 400);
  assert.equal((await connection.updatePhotoOrder("user-1", [{ url: "" }])).status, 400);
});

test("photo ordering persists only supported fields and returns the current profile", async () => {
  const stored = { _id: "user-id", uid: "user-1", email: "user@example.com", photos: [{ _id: "0123456789abcdef01234567", url: "photo.jpg", order: 0, size: 20 }] };
  let update;
  const users = {
    updateOne: async (_query, value) => { update = value; stored.photos = value.$set.photos.map((photo) => ({ ...photo })); return { matchedCount: 1 }; },
    findOne: async () => stored
  };
  const subscriptions = { findOne: async () => null };
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : subscriptions }) });
  const result = await connection.updatePhotoOrder("user-1", [
    { _id: "0123456789abcdef01234567", url: "photo.jpg", order: 0, size: 20, admin: true }
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(update.$set.photos, [{ _id: "0123456789abcdef01234567", url: "photo.jpg", order: 0, size: 20 }]);
  assert.equal(result.body.photos[0].url, "https://cdn.example.com/photo.jpg");
});

test("photo ordering returns 404 when the user does not exist", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => ({ updateOne: async () => ({ matchedCount: 0 }) }) }) });
  assert.equal((await connection.updatePhotoOrder("missing", [{ url: "photo.jpg" }])).status, 404);
});


test("API requests are rate limited per Cloudflare client IP", async () => {
  let calls = 0;
  const env = {
    RATE_LIMITER: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async (_url, init) => {
          calls++;
          assert.equal(init.method, "POST");
          const payload = JSON.parse(init.body);
          assert.equal(payload.limit, 120);
          return new Response(JSON.stringify({ allowed: false, remaining: 0, resetAt: Date.now() + 30000 }), {
            status: 200, headers: { "content-type": "application/json" }
          });
        }
      })
    }
  };
  const response = await worker.fetch(new Request("https://dating-app.test/api/auth/verify", {
    headers: { "CF-Connecting-IP": "203.0.113.10", "X-Forwarded-For": "198.51.100.20" }
  }), env);
  assert.equal(calls, 1);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) >= 1);
  assert.match((await response.json()).error, /Too many requests/);
});

test("API rate limiting fails closed if the configured Durable Object fails", async () => {
  const response = await worker.fetch(new Request("https://dating-app.test/api/auth/verify", {
    headers: { "CF-Connecting-IP": "203.0.113.11" }
  }), {
    RATE_LIMITER: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => { throw new Error("internal failure"); } })
    }
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /internal failure/);
});

test("rate limiter uses a storage transaction when supported", async () => {
  const values = new Map();
  let transactionCalls = 0;
  const storage = {
    get: async (key) => values.get(key),
    put: async (key, value) => values.set(key, value),
    transaction: async (callback) => {
      transactionCalls++;
      return callback(storage);
    }
  };
  const limiter = new RateLimiter({ storage });
  const response = await limiter.fetch(new Request("https://do.test", {
    method: "POST", body: JSON.stringify({ key: "transaction-key", limit: 1, windowMs: 10000 }),
    headers: { "content-type": "application/json" }
  }));
  assert.equal(response.status, 200);
  assert.equal(transactionCalls, 1);
  assert.equal((await response.json()).allowed, true);
});


test("support ticket creation validates subject and message before database access", async () => {
  const connection = new MongoDBConnection({}, {});
  const emptySubject = await connection.createSupportTicket("user-1", { subject: "  ", message: "Help" });
  assert.equal(emptySubject.status, 400);
  const emptyMessage = await connection.createSupportTicket("user-1", { subject: "Help", message: " " });
  assert.equal(emptyMessage.status, 400);
});

test("support ticket endpoints reject anonymous requests", async () => {
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response("unexpected") }) }
  };
  const list = await worker.fetch(request("/api/support-tickets"), env);
  assert.equal(list.status, 401);
  const create = await worker.fetch(new Request("https://dating-app.test/api/support-tickets", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject: "Help", message: "Need help" })
  }), env);
  assert.equal(create.status, 401);
});

test("support ticket internal route validates request structure", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return { findOne: async () => null };
    }
  });
  const response = await connection.fetch(new Request("https://internal.invalid/internal/support-tickets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: { sub: "user-1", email_verified: true }, action: "POST", payload: { subject: " ", message: "help" } })
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /subject and message/i);
});


test("support ticket detail and message routes reject anonymous requests", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project" };
  const detail = await worker.fetch(request("/api/support-tickets/0123456789abcdef01234567"), env);
  assert.equal(detail.status, 401);
  const message = await worker.fetch(new Request("https://dating-app.test/api/support-tickets/0123456789abcdef01234567/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Please help" })
  }), env);
  assert.equal(message.status, 401);
});


test("purchase and subscription status routes require authentication", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project" };
  const purchase = await worker.fetch(request("/api/purchase/status/0123456789abcdef01234567"), env);
  assert.equal(purchase.status, 401);
  const subscription = await worker.fetch(request("/api/subscription/status/0123456789abcdef01234567"), env);
  assert.equal(subscription.status, 401);
});

test("purchase and subscription status reject malformed IDs before database access", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.equal((await connection.getPurchaseStatus("user-1", "not-an-id")).status, 400);
  assert.equal((await connection.getSubscriptionStatus("user-1", "not-an-id")).status, 400);
});


test("purchase and subscription status cannot be read by a different user", async () => {
  const { ObjectId } = await import("mongodb");
  const ownUserId = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const otherUserId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const purchaseId = new ObjectId("cccccccccccccccccccccccc");
  const subscriptionId = new ObjectId("dddddddddddddddddddddddd");
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({
    db: () => ({
      collection: (name) => {
        if (name === "users") return { findOne: async () => ({ _id: ownUserId }) };
        if (name === "purchases") return { findOne: async () => ({ _id: purchaseId, userId: otherUserId, status: "completed" }) };
        if (name === "subscriptions") return { findOne: async () => ({ _id: subscriptionId, userId: otherUserId, status: "active", plan: "monthly" }) };
        throw new Error("Unexpected collection");
      }
    })
  });
  assert.equal((await connection.getPurchaseStatus("user-1", String(purchaseId))).status, 403);
  assert.equal((await connection.getSubscriptionStatus("user-1", String(subscriptionId))).status, 403);
});


test("geolocation endpoint requires Firebase authentication", async () => {
  const response = await worker.fetch(request("/api/geolocation"), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 401);
});


test("migrated admin read endpoints reject anonymous requests before database checks", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project" };
  const paths = [
    "/api/admin/users",
    "/api/admin/users/stats",
    "/api/admin/users/purchases",
    "/api/admin/transactions",
    "/api/admin/analytics/summary",
    "/api/admin/analytics/export",
    "/api/admin/payment-logs",
    "/api/admin/user-activity/login-history",
    "/api/admin/audit-logs",
    "/api/admin/support-tickets",
    "/api/admin/support-tickets/0123456789abcdef01234567"
  ];
  for (const path of paths) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401, path);
  }
  const approve = await worker.fetch(new Request("https://dating-app.test/api/admin/users/purchases/0123456789abcdef01234567/approve", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({})
  }), env);
  assert.equal(approve.status, 401);
  const reject = await worker.fetch(new Request("https://dating-app.test/api/admin/users/purchases/0123456789abcdef01234567/reject", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Test" })
  }), env);
  assert.equal(reject.status, 401);
  const message = await worker.fetch(new Request("https://dating-app.test/api/admin/support-tickets/0123456789abcdef01234567/messages", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Help" })
  }), env);
  assert.equal(message.status, 401);
  const status = await worker.fetch(new Request("https://dating-app.test/api/admin/support-tickets/0123456789abcdef01234567/status", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Closed" })
  }), env);
  assert.equal(status.status, 401);
});

test("admin user write routes reject anonymous requests", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project" };
  const userId = "0123456789abcdef01234567";
  const calls = [
    new Request("https://dating-app.test/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "test@example.com" }) }),
    new Request("https://dating-app.test/api/admin/users/" + userId, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Changed" }) }),
    new Request("https://dating-app.test/api/admin/users/" + userId, { method: "DELETE" }),
    new Request("https://dating-app.test/api/admin/users/" + userId + "/subscription", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "premium" }) })
  ];
  for (const call of calls) assert.equal((await worker.fetch(call, env)).status, 401, call.url);
});

test("admin user deletion runs CDN cleanup after the account deletion route", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: "admin-route-test" });
  const payload = encode({
    aud: "test-project",
    iss: "https://securetoken.google.com/test-project",
    sub: "superadmin-user",
    user_id: "superadmin-user",
    role: "superadmin",
    iat: now,
    exp: now + 3600,
    auth_time: now
  });
  const unsigned = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const calls = [];
  const photoKey = "photos-target-user-1730000000000.webp";
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    JWT_SECRET: "test-cdn-jwt-secret-that-is-long-enough-32",
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/",
    FRONTEND_URL: "https://dating-app-staging.pages.dev",
    MONGODB_CONNECTION: {
      idFromName: name => name,
      get: () => ({
        async fetch(input, options = {}) {
          const path = new URL(String(input)).pathname;
          const body = JSON.parse(options.body || "{}");
          calls.push({ path, body });
          if (path === "/internal/admin/user-delete") {
            return new Response(JSON.stringify({ message: "Account access disabled", deletionStatus: "deletion_pending", firebaseAuthDeletionStatus: "completed" }), { status: 202 });
          }
          if (path === "/internal/admin/user-deletion-assets") {
            return new Response(JSON.stringify({
              uid: "target-user", photoKeys: [photoKey], supportKeys: [], completedKeys: [], unresolvedAssetCount: 0
            }), { status: 200 });
          }
          if (path === "/internal/admin/user-deletion-assets-finalize") {
            assert.deepEqual(body.deletedKeys, [photoKey]);
            return new Response(JSON.stringify({ cdnAssetCleanupStatus: "completed", deletedAssetCount: 1 }), { status: 200 });
          }
          if (path === "/internal/admin/user-deletion-anonymize") {
            return new Response(JSON.stringify({ deletionStatus: "completed", anonymizationStatus: "completed" }), { status: 200 });
          }
          throw new Error("Unexpected internal route: " + path);
        }
      })
    },
    CDN_PROXY: {
      async fetch(request) {
        calls.push({ path: new URL(request.url).pathname, method: request.method, authorization: request.headers.get("authorization") });
        assert.equal(request.method, "DELETE");
        return new Response(null, { status: 204 });
      }
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    return new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: "admin-route-test", alg: "RS256", use: "sig" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request(
      "https://dating-app.test/api/admin/users/0123456789abcdef01234567",
      { method: "DELETE", headers: { authorization: "Bearer " + token } }
    ), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.cdnAssetCleanupStatus, "completed");
    assert.equal(result.anonymizationStatus, "completed");
    assert.deepEqual(calls.filter(call => call.path.startsWith("/internal/admin/user-deletion-assets") || call.path === "/internal/admin/user-deletion-anonymize").map(call => call.path), [
      "/internal/admin/user-deletion-assets",
      "/internal/admin/user-deletion-assets-finalize",
      "/internal/admin/user-deletion-anonymize"
    ]);
    assert.equal(calls.filter(call => call.method === "DELETE").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin read methods deny users without an admin role", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({
    db: () => ({
      collection: () => ({ findOne: async () => ({ role: "user" }) })
    })
  });
  assert.equal((await connection.getAdminUsers("ordinary-user")).status, 403);
  assert.equal((await connection.getAdminDashboardStats("ordinary-user")).status, 403);
  assert.equal((await connection.getAdminTransactions("ordinary-user")).status, 403);
  assert.equal((await connection.getAdminAnalyticsSummary("ordinary-user")).status, 403);
  assert.equal((await connection.getAdminLogs("ordinary-user", "payment")).status, 403);
  assert.equal((await connection.getAdminLogs("ordinary-user", "login")).status, 403);
  assert.equal((await connection.getAdminLogs("ordinary-user", "audit")).status, 403);
  assert.equal((await connection.getAdminPurchases("ordinary-user")).status, 403);
  assert.equal((await connection.moderateAdminPurchase("ordinary-user", "0123456789abcdef01234567", "approve")).status, 403);
});

test("admin report endpoints reject anonymous requests", async () => {
  const env = { FIREBASE_PROJECT_ID: "test-project" };
  const list = await worker.fetch(request("/api/admin/reports"), env);
  assert.equal(list.status, 401);
  const detail = await worker.fetch(request("/api/admin/reports/0123456789abcdef01234567"), env);
  assert.equal(detail.status, 401);
});

test("admin report operations enforce database-backed admin roles", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({
    db: () => ({
      collection: () => ({ findOne: async () => ({ role: "user" }) })
    })
  });
  assert.equal((await connection.getAdminReports("ordinary-user")).status, 403);
  assert.equal((await connection.getAdminReport("ordinary-user", "0123456789abcdef01234567")).status, 403);
  assert.equal((await connection.moderateReport("ordinary-user", "0123456789abcdef01234567", { action: "dismiss" })).status, 403);
});

test("report moderation validates action and suspension duration", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.equal((await connection.moderateReport("admin", "0123456789abcdef01234567", { action: "delete_database" })).status, 400);
  assert.equal((await connection.moderateReport("admin", "0123456789abcdef01234567", { action: "suspend_user", durationDays: 0 })).status, 400);
  assert.equal((await connection.moderateReport("admin", "0123456789abcdef01234567", { action: "suspend_user", durationDays: 99999 })).status, 400);
});


test("scheduled expiration processing is bounded, idempotent, and preserves active subscriptions", async () => {
  const expiredSub = { _id: "expired-sub", userId: "paid-user", endDate: new Date("2026-01-01T00:00:00Z") };
  const trialUser = { _id: "trial-user", plan: "premium", trialExpires: new Date("2026-01-01T00:00:00Z") };
  let subscriptionUpdates = 0;
  let userUpdates = 0;
  const userUpdateFilters = [];
  const subscriptions = {
    find: () => ({ sort() { return this; }, limit() { return this; }, async toArray() { return [expiredSub]; } }),
    async updateOne() { subscriptionUpdates += 1; return { modifiedCount: 1 }; },
    async findOne() { return null; }
  };
  const users = {
    find: () => ({ sort() { return this; }, limit() { return this; }, async toArray() { return [trialUser]; } }),
    async updateOne(filter) { userUpdates += 1; userUpdateFilters.push(filter); return { modifiedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection(name) { return name === "subscriptions" ? subscriptions : users; } }) });
  const result = await connection.runScheduledExpirations(new Date("2026-10-21T00:00:00Z"));
  assert.deepEqual(result, { success: true, expiredSubscriptions: 1, expiredTrials: 1, downgradedUsers: 2 });
  assert.equal(subscriptionUpdates, 1);
  assert.equal(userUpdates, 2);
  assert.ok(userUpdateFilters[0].$or.some(clause => clause.trialExpires && clause.trialExpires.$lte instanceof Date));
});

test("scheduled expiration does not downgrade users with another active subscription", async () => {
  const expiredSub = { _id: "expired-sub", userId: "paid-user", endDate: new Date("2026-01-01T00:00:00Z") };
  const subscriptions = {
    find: () => ({ sort() { return this; }, limit() { return this; }, async toArray() { return [expiredSub]; } }),
    async updateOne() { return { modifiedCount: 1 }; },
    async findOne() { return { _id: "still-active" }; }
  };
  const users = {
    find: () => ({ sort() { return this; }, limit() { return this; }, async toArray() { return [{ _id: "trial-user", plan: "premium" }]; } }),
    async updateOne() { assert.fail("User with an active subscription must not be downgraded"); }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection(name) { return name === "subscriptions" ? subscriptions : users; } }) });
  const result = await connection.runScheduledExpirations(new Date("2026-10-21T00:00:00Z"));
  assert.deepEqual(result, { success: true, expiredSubscriptions: 1, expiredTrials: 0, downgradedUsers: 0 });
});

test("scheduled handler only runs in staging and delegates to the MongoDB Durable Object", async () => {
  let delegated = 0;
  let waited = null;
  const env = {
    MIGRATION_STAGE: "staging",
    MONGODB_CONNECTION: {
      idFromName(name) { assert.equal(name, "mongo-primary"); return "id"; },
      get(id) {
        assert.equal(id, "id");
        return { async fetch(url, init) {
          assert.ok(url.endsWith("/internal/scheduled-expirations"));
          assert.equal(init.method, "POST");
          delegated += 1;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        } };
      }
    }
  };
  await worker.scheduled({ cron: "0 * * * *" }, env, { waitUntil(promise) { waited = promise; } });
  await waited;
  assert.equal(delegated, 1);
  await worker.scheduled({ cron: "0 * * * *" }, { MIGRATION_STAGE: "production" }, { waitUntil() { assert.fail("production job must not run before cutover"); } });
});


test("WebXPay checkout form includes the documented CMS and encryption mechanism fields", async () => {
  const { publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const response = buildWebXPayCheckoutForm({
    orderId: "0123456789abcdef01234567",
    price: 800,
    user: { name: "Test User", email: "test@example.com", contactNumber: "+94771234567" }
  }, {
    WEBXPAY_PUBLIC_KEY: publicKey,
    WEBXPAY_SECRET_KEY: "test-secret",
    FRONTEND_URL: "https://dating-app-staging.pages.dev",
    WEBXPAY_CHECKOUT_URL: "https://stagingxpay.info/index.php?route=checkout/billing",
    MIGRATION_STAGE: "staging"
  }, "/premium", "Monthly Subscription");
  const html = await response.text();
  assert.match(html, /name="cms" value="PHP"/);
  assert.match(html, /name="enc_method" value="JCs3J\+6oSz4V0LgE0zi\/Bg=="/);
  assert.match(html, /name="secret_key" value="test-secret"/);
  assert.match(html, /name="payment" value="[A-Za-z0-9+/=]+"/);
  assert.doesNotMatch(html, /name="items"/);
  assert.match(html, /form action="https:\/\/stagingxpay\.info\/index\.php\?route=checkout\/billing"/);
  assert.match(response.headers.get("content-security-policy"), /form-action https:\/\/stagingxpay\.info/);
});

test("WebXPay checkout rejects missing or insecure checkout endpoint instead of silently using staging", () => {
  const { publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const baseEnv = {
    WEBXPAY_PUBLIC_KEY: publicKey,
    WEBXPAY_SECRET_KEY: "test-secret",
    FRONTEND_URL: "https://dating-app.example"
  };
  const order = { orderId: "0123456789abcdef01234567", price: 800, user: {} };
  assert.throws(() => buildWebXPayCheckoutForm(order, baseEnv, "/premium"), /payment configuration is incomplete/i);
  assert.throws(() => buildWebXPayCheckoutForm(order, {
    ...baseEnv,
    WEBXPAY_CHECKOUT_URL: "http://untrusted.example/checkout"
  }, "/premium"), /must be a valid HTTPS checkout endpoint/i);
  assert.throws(() => buildWebXPayCheckoutForm(order, {
    ...baseEnv,
    WEBXPAY_CHECKOUT_URL: "https://stagingxpay.info/index.php?route=checkout/billing",
    MIGRATION_STAGE: "production"
  }, "/premium"), /cannot be used outside the staging environment/i);
});

test("WebXPay callback verifies the signed response before asking MongoDB to settle", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const orderId = "0123456789abcdef01234567";
  const signedPayload = orderId + "|T123456|2026-10-21 12:00:00|00|Approved|1";
  const payment = privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(signedPayload, "utf8")).toString("base64");
  const signature = privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(signedPayload, "utf8")).toString("base64");
  let settled = null;
  const env = {
    WEBXPAY_PUBLIC_KEY: publicKey,
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-id"; },
      get() {
        return { async fetch(url, init) {
          assert.ok(url.endsWith("/internal/webxpay-settle"));
          settled = JSON.parse(init.body);
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        } };
      }
    }
  };
  const body = new URLSearchParams({ payment, signature, custom_fields: "" });
  const response = await worker.fetch(new Request("https://dating-app.test/api/webxpay/response", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(settled, { orderId, statusCode: "00", reference: "T123456", transactionDate: "2026-10-21 12:00:00", gatewayComment: "Approved", gatewayId: "1" });
});

test("WebXPay callback rejects invalid signatures and does not settle an order", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  let called = false;
  const payment = privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from("0123456789abcdef01234567|T123|2026-10-21 12:00:00|00|Approved|1")).toString("base64");
  const response = await worker.fetch(new Request("https://dating-app.test/api/webxpay/response", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment, signature: Buffer.from("not a signature").toString("base64") })
  }), {
    WEBXPAY_PUBLIC_KEY: publicKey,
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-id"; },
      get() { return { async fetch() { called = true; return new Response("{}", { status: 200 }); } }; }
    }
  });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});


test("WebXPay callback returns retryable 503 when MongoDB settlement is unavailable", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const payload = "0123456789abcdef01234567|T123456|2026-10-21 12:00:00|00|Approved|1";
  const encrypt = value => privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(value, "utf8")).toString("base64");
  const response = await worker.fetch(new Request("https://dating-app.test/api/webxpay/response", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment: encrypt(payload), signature: encrypt(payload) })
  }), {
    WEBXPAY_PUBLIC_KEY: publicKey,
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-id"; },
      get() { return { async fetch() { throw new Error("MongoDB temporarily unavailable"); } }; }
    }
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/i);
});


test("WebXPay purchase settlement grants benefits once and is idempotent", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "0123456789abcdef01234567";
  const purchase = { _id: new ObjectId(orderId), userId: new ObjectId("abcdef0123456789abcdef01"), status: "pending", itemId: "super-like-5" };
  const user = { _id: purchase.userId, purchasedSuperLikes: 0 };
  let userUpdates = 0;
  const purchases = {
    async findOne(filter) { return String(filter._id) === orderId ? purchase : null; },
    async updateOne(filter, update) {
      if (String(filter._id) !== orderId || purchase.status !== filter.status) return { modifiedCount: 0 };
      Object.assign(purchase, update.$set || {});
      return { modifiedCount: 1 };
    }
  };
  const subscriptions = { async findOne() { return null; }, async updateOne() { return { modifiedCount: 0 }; } };
  const users = {
    async updateOne(filter, update) {
      userUpdates += 1;
      if (update.$inc?.purchasedSuperLikes) user.purchasedSuperLikes += update.$inc.purchasedSuperLikes;
      Object.assign(user, update.$set || {});
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const db = { collection(name) { return name === "purchases" ? purchases : name === "subscriptions" ? subscriptions : users; } };
  const client = { db: () => db, startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => client;
  const first = await connection.settleWebXPay(orderId, "00", "T123");
  const second = await connection.settleWebXPay(orderId, "00", "T123");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.match(second.body.message, /already processed/i);
  assert.equal(purchase.status, "completed");
  assert.equal(user.purchasedSuperLikes, 5);
  assert.equal(userUpdates, 1);
});

test("WebXPay subscription settlement activates the plan and sets an expiry once", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "1123456789abcdef01234567";
  const subscription = { _id: new ObjectId(orderId), userId: new ObjectId("abcdef0123456789abcdef02"), status: "pending", plan: "monthly" };
  const user = { _id: subscription.userId, plan: "basic" };
  let userUpdates = 0;
  const purchases = { async findOne() { return null; } };
  const subscriptions = {
    async findOne(filter) { return String(filter._id) === orderId ? subscription : null; },
    async updateOne(filter, update) {
      if (String(filter._id) !== orderId || subscription.status !== filter.status) return { modifiedCount: 0 };
      Object.assign(subscription, update.$set || {});
      return { modifiedCount: 1 };
    }
  };
  const users = {
    async updateOne(filter, update) {
      userUpdates += 1;
      Object.assign(user, update.$set || {});
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const db = { collection(name) { return name === "purchases" ? purchases : name === "subscriptions" ? subscriptions : users; } };
  const client = { db: () => db, startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => client;
  const result = await connection.settleWebXPay(orderId, "00", "T456");
  assert.equal(result.status, 200);
  assert.equal(subscription.status, "active");
  assert.ok(subscription.endDate instanceof Date);
  assert.equal(user.plan, "premium");
  assert.equal(userUpdates, 1);
});


test("declined WebXPay callbacks are acknowledged idempotently without granting benefits", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "2123456789abcdef01234567";
  const purchase = { _id: new ObjectId(orderId), userId: new ObjectId("abcdef0123456789abcdef03"), status: "pending", itemId: "super-like-5" };
  let userUpdates = 0;
  const purchases = {
    async findOne(filter) { return String(filter._id) === orderId ? purchase : null; },
    async updateOne(filter, update) {
      if (String(filter._id) !== orderId || purchase.status !== filter.status) return { modifiedCount: 0 };
      Object.assign(purchase, update.$set || {});
      return { modifiedCount: 1 };
    }
  };
  const subscriptions = { async findOne() { return null; } };
  const users = { async updateOne() { userUpdates += 1; return { matchedCount: 1, modifiedCount: 1 }; } };
  const db = { collection(name) { return name === "purchases" ? purchases : name === "subscriptions" ? subscriptions : users; } };
  const client = { db: () => db, startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => client;
  const first = await connection.settleWebXPay(orderId, "15", "Tdeclined");
  const second = await connection.settleWebXPay(orderId, "15", "Tdeclined");
  assert.equal(first.status, 200);
  assert.equal(first.body.processed, false);
  assert.equal(second.status, 200);
  assert.match(second.body.message, /already processed/i);
  assert.equal(purchase.status, "rejected");
  assert.equal(userUpdates, 0);
});


test("chat message creation requires both participants and refuses blocked conversations", async () => {
  const { ObjectId } = await import("mongodb");
  const usersByUid = {
    sender: { _id: new ObjectId("abcdef0123456789abcdef01"), uid: "sender", blocked: [] },
    receiver: { _id: new ObjectId("abcdef0123456789abcdef02"), uid: "receiver", blocked: [] }
  };
  const stored = [];
  const db = {
    collection(name) {
      if (name === "users") return { async findOne(filter) { return usersByUid[filter.uid] || null; } };
      if (name === "matches") return { async findOne() { return { _id: "matched-pair", status: "matched" }; } };
      if (name === "chatmessages") return { async insertOne(doc) { stored.push({ ...doc, _id: new ObjectId("abcdef0123456789abcdef03") }); return { insertedId: stored[0]._id }; } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const ok = await connection.createChatMessage("sender", {
    roomId: "sender-receiver", receiverUid: "receiver", messageContent: "Hello"
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.senderUid, "sender");
  assert.equal(stored.length, 1);
  const wrongRoom = await connection.createChatMessage("sender", {
    roomId: "sender-other", receiverUid: "receiver", messageContent: "Hello"
  });
  assert.equal(wrongRoom.status, 400);
  usersByUid.receiver.blocked = ["sender"];
  const blocked = await connection.createChatMessage("sender", {
    roomId: "sender-receiver", receiverUid: "receiver", messageContent: "Hello"
  });
  assert.equal(blocked.status, 403);
  assert.equal(stored.length, 1);
});

test("chat history refuses cross-user access and limits result pagination", async () => {
  let capturedQuery;
  let capturedLimit;
  let capturedSkip;
  let capturedMaxTimeMS;
  const messages = [{ roomId: "alice-bob", senderUid: "alice", receiverUid: "bob", messageContent: "Hi" }];
  const db = {
    collection(name) {
      if (name === "users") return { async findOne(filter) { return filter.uid === "alice" ? { uid: "alice", role: "user" } : filter.uid === "bob" ? { uid: "bob", role: "user" } : null; } };
      return {
        find(query) {
          capturedQuery = query;
          return { sort() { return this; }, skip(value) { capturedSkip = value; return this; }, limit(value) { capturedLimit = value; return this; }, maxTimeMS(value) { capturedMaxTimeMS = value; return this; }, async toArray() { return messages; } };
        },
        async findOne(query) {
          if (query && query.roomId === "alice-bob") {
            return { roomId: "alice-bob", senderUid: "alice", receiverUid: "bob", _id: "message-id" };
          }
          return { _id: "message-id" };
        }
      };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const denied = await connection.getChatHistory("mallory", "alice-bob", 1000, 2);
  assert.equal(denied.status, 404);
  const result = await connection.getChatHistory("alice", "alice-bob", 1000, 2);
  assert.equal(result.status, 200);
  assert.equal(capturedLimit, 100);
  assert.equal(capturedSkip, 2);
  assert.equal(capturedMaxTimeMS, 10000);
  assert.equal(capturedQuery.roomId, "alice-bob");
  assert.deepEqual(capturedQuery.$or, [{ senderUid: "alice" }, { receiverUid: "alice" }]);
});


test("password-based superadmin login signs a Firebase custom token only for the configured hash", async () => {
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule;
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    SUPER_ADMIN_EMAIL: "admin@example.com",
    SUPER_ADMIN_PASSWORD_HASH: await bcrypt.hash("correct horse battery", 4),
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "firebase-adminsdk@test-project.iam.gserviceaccount.com",
      private_key: privateKey
    }),
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-primary"; },
      get() { return { async fetch() { return new Response(JSON.stringify({ success: true }), { status: 200 }); } }; }
    }
  };
  const login = async password => worker.fetch(new Request("https://dating-app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.42" },
    body: JSON.stringify({ email: "admin@example.com", password })
  }), env);
  const denied = await login("wrong password");
  assert.equal(denied.status, 401);
  const response = await login("correct horse battery");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.uid, "superadmin_uid");
  assert.equal(body.user.role, "superadmin");
  const parts = body.token.split(".");
  assert.equal(parts.length, 3);
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(claims.uid, "superadmin_uid");
  assert.equal(claims.role, "superadmin");
  assert.equal(claims.claims, undefined);
  assert.equal(claims.iss, "firebase-adminsdk@test-project.iam.gserviceaccount.com");
  assert.equal(claims.aud, "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit");
});


test("scheduled expiration scopes run only the requested category", async () => {
  const emptyCursor = { sort() { return this; }, limit() { return this; }, async toArray() { return []; } };
  const trialsOnly = new MongoDBConnection({}, {});
  trialsOnly.getClient = async () => ({
    db: () => ({
      collection(name) {
        if (name === "subscriptions") return {
          find() { assert.fail("trial-only run must not query expired subscriptions"); },
          async findOne() { return null; }
        };
        return { find() { return emptyCursor; }, async updateOne() { return { modifiedCount: 0 }; } };
      }
    })
  });
  assert.deepEqual(await trialsOnly.runScheduledExpirations(new Date(), "trials"), {
    success: true, expiredSubscriptions: 0, expiredTrials: 0, downgradedUsers: 0
  });

  const subscriptionsOnly = new MongoDBConnection({}, {});
  subscriptionsOnly.getClient = async () => ({
    db: () => ({
      collection(name) {
        if (name === "users") return {
          find() { assert.fail("subscription-only run must not query expired trials"); },
          async updateOne() { return { modifiedCount: 0 }; }
        };
        return { find() { return emptyCursor; }, async updateOne() { return { modifiedCount: 0 }; }, async findOne() { return null; } };
      }
    })
  });
  assert.deepEqual(await subscriptionsOnly.runScheduledExpirations(new Date(), "subscriptions"), {
    success: true, expiredSubscriptions: 0, expiredTrials: 0, downgradedUsers: 0
  });
});


test("status endpoint reports service readiness without exposing configuration", async () => {
  const response = await worker.fetch(request("/api/status"), {
    FIREBASE_PROJECT_ID: "test-project",
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-primary"; },
      get() { return { async fetch() { return new Response(JSON.stringify({ status: "ok" }), { status: 200 }); } }; }
    }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.database.status, "connected");
  assert.equal(body.firebase.status, "configured");
  assert.equal(JSON.stringify(body).includes("test-project"), false);
});

test("manual cron routes require a configured secret and execute only their requested scope", async () => {
  const missing = await worker.fetch(new Request("https://dating-app.test/api/cron/trials", { method: "POST" }), {});
  assert.equal(missing.status, 503);
  const unauthorized = await worker.fetch(new Request("https://dating-app.test/api/cron/trials", {
    method: "POST", headers: { "x-cron-secret": "wrong" }
  }), { CRON_SECRET: "a".repeat(32) });
  assert.equal(unauthorized.status, 401);
  let body;
  const response = await worker.fetch(new Request("https://dating-app.test/api/cron/trials", {
    method: "POST", headers: { "x-cron-secret": "a".repeat(32) }
  }), {
    CRON_SECRET: "a".repeat(32),
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-primary"; },
      get() { return { async fetch(url, init) {
        assert.ok(url.endsWith("/internal/scheduled-expirations"));
        body = JSON.parse(init.body);
        return new Response(JSON.stringify({ success: true, expiredTrials: 1 }), { status: 200 });
      } }; }
    }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(body, { scope: "trials" });
});

test("chat conversations use a valid inclusion projection and return successfully", async () => {
  let userProjection;
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne(filter, options) {
          if (filter.uid === "alice") {
            userProjection = options?.projection;
            return { _id: "alice-id", uid: "alice", blocked: [] };
          }
          return null;
        }
      };
      return {
        aggregate(pipeline) {
          if (pipeline[0]?.$match?.receiverUid === "alice") {
            assert.deepEqual(pipeline, [
              { $match: { receiverUid: "alice", status: { $ne: "read" } } },
              { $group: { _id: "$roomId", unreadCount: { $sum: 1 } } }
            ]);
            return { async toArray() { return []; } };
          }
          assert.deepEqual(pipeline, [
            { $match: { $or: [{ senderUid: "alice" }, { receiverUid: "alice" }] } },
            { $sort: { timestamp: -1, _id: -1 } },
            { $group: { _id: "$roomId", lastMessage: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$lastMessage" } },
            { $sort: { timestamp: -1, _id: -1 } }
          ]);
          return { async toArray() { return []; } };
        }
      };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const result = await connection.getChatConversations("alice");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, []);
  assert.deepEqual(userProjection, {
    _id: 1, uid: 1, blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1
  });
});

test("chat message remains saved when Firebase Realtime Database rejects the sync write", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: "test-key" });
  const claims = encode({
    aud: "test-project",
    iss: "https://securetoken.google.com/test-project",
    sub: "sender-uid",
    user_id: "sender-uid",
    iat: now,
    exp: now + 3600,
    auth_time: now
  });
  const unsigned = header + "." + claims;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  let rollbackCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const target = String(input);
    if (target === "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com") {
      return new Response(JSON.stringify({
        keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.startsWith("https://test-project-default-rtdb.firebaseio.com/")) {
      return new Response(JSON.stringify({ error: "Permission denied" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }
    throw new Error("Unexpected network request in chat sync test");
  };
  const connection = {
    idFromName: name => name,
    get: () => ({
      fetch: async (input) => {
        const target = String(input);
        if (target.endsWith("/internal/chat/send")) {
          return new Response(JSON.stringify({
            _id: "message-id",
            roomId: "sender-uid-receiver-uid",
            senderUid: "sender-uid",
            receiverUid: "receiver-uid",
            messageContent: "hello",
            timestamp: new Date(now * 1000).toISOString()
          }), { status: 201, headers: { "content-type": "application/json" } });
        }
        if (target.endsWith("/internal/chat/rollback")) {
          rollbackCalled = true;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        throw new Error("Unexpected Durable Object request in chat sync test");
      }
    })
  };
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/chat/send", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        roomId: "sender-uid-receiver-uid",
        receiverUid: "receiver-uid",
        messageContent: "hello"
      })
    }), {
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_DATABASE_URL: "https://test-project-default-rtdb.firebaseio.com",
      RATE_LIMITER: {
        idFromName(name) {
          assert.equal(name, "chat-send-user:sender-uid");
          return "chat-send-test";
        },
        get() {
          return {
            async fetch(_url, options) {
              assert.deepEqual(JSON.parse(options.body), { key: "chat-send", limit: 30, windowMs: 60000 });
              return new Response(JSON.stringify({ allowed: true, resetAt: Date.now() + 60000 }), {
                status: 200, headers: { "content-type": "application/json" }
              });
            }
          };
        }
      },
      MONGODB_CONNECTION: connection
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body._id, "message-id");
    assert.equal(body.realtimeSync, false);
    assert.equal(body.messageContent, "hello");
    assert.equal(rollbackCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test("WebXPay callback rejects validly encrypted but mismatched payment and signature values", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const paymentPayload = "0123456789abcdef01234567|T123|2026-10-21 12:00:00|00|Approved|1";
  const signaturePayload = "0123456789abcdef01234567|T123|2026-10-21 12:00:00|15|Declined|1";
  const encrypt = value => privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(value, "utf8")).toString("base64");
  let settled = false;
  const response = await worker.fetch(new Request("https://dating-app.test/api/webxpay/response", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment: encrypt(paymentPayload), signature: encrypt(signaturePayload) })
  }), {
    WEBXPAY_PUBLIC_KEY: publicKey,
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-id"; },
      get() { return { async fetch() { settled = true; return new Response("{}", { status: 200 }); } }; }
    }
  });
  assert.equal(response.status, 400);
  assert.equal(settled, false);
});


test("WebXPay callback rejects a status code in the wrong field", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const payload = "0123456789abcdef01234567|T123|2026-10-21 12:00:00|1|00|Approved";
  const payment = privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(payload, "utf8")).toString("base64");
  const signature = privateEncrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(payload, "utf8")).toString("base64");
  let settled = false;
  const response = await worker.fetch(new Request("https://dating-app.test/api/webxpay/response", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment, signature })
  }), {
    WEBXPAY_PUBLIC_KEY: publicKey,
    MONGODB_CONNECTION: {
      idFromName() { return "mongo-id"; },
      get() { return { async fetch() { settled = true; return new Response("{}", { status: 200 }); } }; }
    }
  });
  assert.equal(response.status, 400);
  assert.equal(settled, false);
});


test("call signaling endpoints bypass the generic per-IP API limiter", async () => {
  let limiterCalls = 0;
  const response = await worker.fetch(new Request("https://dating-app.test/api/calls/poll?roomId=user-other", {
    headers: { "CF-Connecting-IP": "203.0.113.77" }
  }), {
    FIREBASE_PROJECT_ID: "",
    RATE_LIMITER: {
      idFromName() { return "call-test"; },
      get() { return { async fetch() { limiterCalls += 1; return new Response(JSON.stringify({ allowed: false }), { status: 200 }); } }; }
    }
  });
  assert.equal(limiterCalls, 0);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Authentication is not configured/);
});


test("CDN uploads use the service binding instead of the public workers.dev hostname", async () => {
  let capturedRequest;
  let publicFetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    publicFetchCalled = true;
    throw new Error("Public CDN fetch must not be used");
  };
  try {
    const response = await requestCdnObject({
      CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/",
      JWT_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
      CDN_PROXY: {
        async fetch(request) {
          capturedRequest = request;
          return new Response(JSON.stringify({ key: "photos-user-1757226432186.webp" }), { status: 201 });
        }
      }
    }, "photos-user-1757226432186.webp", "PUT", {
      "Content-Type": "image/webp",
      "Origin": "https://dating-app-staging.pages.dev"
    }, new Uint8Array([1, 2, 3]), { sub: "user" });

    assert.equal(response.status, 201);
    assert.equal(publicFetchCalled, false);
    assert.ok(capturedRequest instanceof Request);
    assert.equal(new URL(capturedRequest.url).hostname, "dateme.enadoctemp.workers.dev");
    assert.equal(capturedRequest.method, "PUT");
    assert.equal(capturedRequest.headers.get("Content-Type"), "image/webp");
    assert.equal(capturedRequest.headers.get("Origin"), "https://dating-app-staging.pages.dev");
    const token = capturedRequest.headers.get("Authorization").replace(/^Bearer /, "");
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    assert.equal(claims.sub, "user");
    assert.equal(claims.key, "photos-user-1757226432186.webp");
    assert.equal(claims.method, "PUT");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CDN authorization accepts valid support attachment object keys", async () => {
  let capturedRequest;
  const response = await requestCdnObject({
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/",
    JWT_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
    CDN_PROXY: {
      async fetch(request) {
        capturedRequest = request;
        return new Response(null, { status: 201 });
      }
    }
  }, "support-0123456789abcdef01234567-1760000000000-123e4567-e89b-42d3-a456-426614174000.jpg",
  "PUT", { "Content-Type": "image/jpeg" }, new Uint8Array([1, 2, 3]), { sub: "support-user-1" });
  assert.equal(response.status, 201);
  assert.ok(capturedRequest instanceof Request);
  const token = capturedRequest.headers.get("authorization").replace(/^Bearer /, "");
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.key, "support-0123456789abcdef01234567-1760000000000-123e4567-e89b-42d3-a456-426614174000.jpg");
  assert.equal(claims.method, "PUT");
});

test("CDN uploads fail clearly when the service binding is not configured", async () => {
  await assert.rejects(
    requestCdnObject({
      CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/",
      JWT_SECRET: "test-secret-that-is-at-least-thirty-two-characters"
    }, "photos-user-1757226432186.webp", "PUT", {}, new Uint8Array([1]), { sub: "user" }),
    /CDN_PROXY service binding is not configured/
  );
});


test("support attachment uploads enforce an account-scoped hourly quota", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "support-upload-test" }) + "." +
    encode({
      iss: "https://securetoken.google.com/test-project",
      aud: "test-project",
      sub: "support-user-1",
      user_id: "support-user-1",
      iat: now,
      exp: now + 3600,
      auth_time: now
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  let limiterRequest;
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    return new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: "support-upload-test", alg: "RS256", use: "sig" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/",
    RATE_LIMITER: {
      idFromName(name) {
        assert.equal(name, "support-upload-user:support-user-1");
        return "support-upload-limiter";
      },
      get() {
        return {
          async fetch(_url, options) {
            limiterRequest = JSON.parse(options.body);
            return new Response(JSON.stringify({ allowed: false, resetAt: Date.now() + 60000 }), {
              status: 200, headers: { "content-type": "application/json" }
            });
          }
        };
      }
    }
  };
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/support-attachments", {
      method: "POST",
      headers: { authorization: "Bearer " + token }
    }), env);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after") !== null, true);
    assert.deepEqual(limiterRequest, { key: "support-upload", limit: 10, windowMs: 3600000 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("chat send rate limit rejects excess messages before accessing MongoDB", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "chat-limit-test" }) + "." +
    encode({
      iss: "https://securetoken.google.com/test-project",
      aud: "test-project",
      sub: "chat-user-1",
      user_id: "chat-user-1",
      iat: now,
      exp: now + 3600,
      auth_time: now
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    return new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: "chat-limit-test", alg: "RS256", use: "sig" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  let databaseAccessed = false;
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    RATE_LIMITER: {
      idFromName(name) {
        assert.equal(name, "chat-send-user:chat-user-1");
        return "chat-send-limit";
      },
      get() {
        return {
          async fetch(_url, options) {
            assert.deepEqual(JSON.parse(options.body), { key: "chat-send", limit: 30, windowMs: 60000 });
            return new Response(JSON.stringify({ allowed: false, resetAt: Date.now() + 30000 }), {
              status: 200, headers: { "content-type": "application/json" }
            });
          }
        };
      }
    },
    MONGODB_CONNECTION: {
      idFromName() { databaseAccessed = true; throw new Error("MongoDB must not be accessed"); },
      get() { databaseAccessed = true; throw new Error("MongoDB must not be accessed"); }
    }
  };
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/chat/send", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ roomId: "chat-user-1-other", receiverUid: "other", messageContent: "spam" })
    }), env);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.equal(databaseAccessed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("chat send persists through MongoDB and returns the saved message", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "chat-send-success-test" }) + "." +
    encode({
      iss: "https://securetoken.google.com/test-project",
      aud: "test-project",
      sub: "chat-sender-1",
      user_id: "chat-sender-1",
      iat: now,
      exp: now + 3600,
      auth_time: now
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    return new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: "chat-send-success-test", alg: "RS256", use: "sig" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const savedMessage = {
    _id: "message-123",
    roomId: "chat-sender-1-chat-receiver-1",
    senderUid: "chat-sender-1",
    receiverUid: "chat-receiver-1",
    messageContent: "Hello",
    timestamp: "2026-11-03T10:00:00.000Z"
  };
  let internalRequest;
  const env = {
    FIREBASE_PROJECT_ID: "test-project",
    RATE_LIMITER: {
      idFromName(name) {
        assert.equal(name, "chat-send-user:chat-sender-1");
        return "chat-send-limiter";
      },
      get() {
        return {
          async fetch(_url, options) {
            assert.deepEqual(JSON.parse(options.body), { key: "chat-send", limit: 30, windowMs: 60000 });
            return new Response(JSON.stringify({ allowed: true, resetAt: Date.now() + 60000 }), {
              status: 200, headers: { "content-type": "application/json" }
            });
          }
        };
      }
    },
    MONGODB_CONNECTION: {
      idFromName(name) {
        assert.match(name, /^mongo-shard-[0-3]$/);
        return "mongo-primary";
      },
      get() {
        return {
          async fetch(url, options) {
            assert.equal(url, "https://internal.invalid/internal/chat/send");
            internalRequest = JSON.parse(options.body);
            return new Response(JSON.stringify(savedMessage), {
              status: 201, headers: { "content-type": "application/json" }
            });
          }
        };
      }
    }
  };
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/chat/send", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        roomId: savedMessage.roomId,
        receiverUid: savedMessage.receiverUid,
        messageContent: savedMessage.messageContent
      })
    }), env);
    assert.equal(response.status, 201);
    assert.deepEqual(internalRequest.claims.sub, "chat-sender-1");
    assert.deepEqual(internalRequest.payload, {
      roomId: savedMessage.roomId,
      receiverUid: savedMessage.receiverUid,
      messageContent: "Hello"
    });
    const body = await response.json();
    assert.equal(body._id, savedMessage._id);
    assert.equal(body.senderUid, savedMessage.senderUid);
    assert.equal(body.realtimeSync, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat send fails closed when the account rate limiter is not configured", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "chat-no-limiter-test" }) + "." +
    encode({
      iss: "https://securetoken.google.com/test-project",
      aud: "test-project",
      sub: "chat-user-no-limiter",
      user_id: "chat-user-no-limiter",
      iat: now,
      exp: now + 3600,
      auth_time: now
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    keys: [{ ...publicJwk, kid: "chat-no-limiter-test", alg: "RS256", use: "sig" }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  let databaseAccessed = false;
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/chat/send", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ roomId: "chat-user-no-limiter-other", receiverUid: "other", messageContent: "Hello" })
    }), {
      FIREBASE_PROJECT_ID: "test-project",
      MONGODB_CONNECTION: {
        idFromName() { databaseAccessed = true; throw new Error("MongoDB must not be accessed"); },
        get() { databaseAccessed = true; throw new Error("MongoDB must not be accessed"); }
      }
    });
    assert.equal(response.status, 503);
    assert.equal(databaseAccessed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("authenticated chat read receipts route to the MongoDB Durable Object", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "chat-read-route-test" }) + "." +
    encode({
      iss: "https://securetoken.google.com/test-project",
      aud: "test-project",
      sub: "chat-reader",
      user_id: "chat-reader",
      iat: now,
      exp: now + 3600,
      auth_time: now
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    return new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: "chat-read-route-test", alg: "RS256", use: "sig" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  let internalRequest;
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/chat/read", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ roomId: "chat-reader-chat-sender", messageIds: ["abcdef0123456789abcdef01"] })
    }), {
      FIREBASE_PROJECT_ID: "test-project",
      MONGODB_CONNECTION: {
        idFromName(name) {
          assert.match(name, /^mongo-shard-[0-3]$/);
          return name;
        },
        get() {
          return {
            async fetch(url, options) {
              assert.equal(url, "https://internal.invalid/internal/chat/read");
              internalRequest = JSON.parse(options.body);
              return new Response(JSON.stringify({ readCount: 1 }), {
                status: 200, headers: { "content-type": "application/json" }
              });
            }
          };
        }
      }
    });
    assert.equal(response.status, 200);
    assert.equal(internalRequest.claims.sub, "chat-reader");
    assert.deepEqual(internalRequest.payload, {
      roomId: "chat-reader-chat-sender",
      messageIds: ["abcdef0123456789abcdef01"]
    });
    assert.deepEqual(await response.json(), { readCount: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("authenticated chat delivery receipts route to the MongoDB Durable Object", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "chat-delivered-route-test" }) + "." +
    encode({
      iss: "https://securetoken.google.com/test-project",
      aud: "test-project",
      sub: "chat-recipient",
      user_id: "chat-recipient",
      iat: now,
      exp: now + 3600,
      auth_time: now
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const token = unsigned + "." + signer.sign(privateKey, "base64url");
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    return new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: "chat-delivered-route-test", alg: "RS256", use: "sig" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  let internalRequest;
  try {
    const response = await worker.fetch(new Request("https://dating-app.test/api/chat/delivered", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ roomId: "chat-recipient-chat-sender", messageIds: ["abcdef0123456789abcdef01"] })
    }), {
      FIREBASE_PROJECT_ID: "test-project",
      MONGODB_CONNECTION: {
        idFromName(name) {
          assert.match(name, /^mongo-shard-[0-3]$/);
          return name;
        },
        get() {
          return {
            async fetch(url, options) {
              assert.equal(url, "https://internal.invalid/internal/chat/delivered");
              internalRequest = JSON.parse(options.body);
              return new Response(JSON.stringify({ deliveredCount: 1 }), {
                status: 200, headers: { "content-type": "application/json" }
              });
            }
          };
        }
      }
    });
    assert.equal(response.status, 200);
    assert.equal(internalRequest.claims.sub, "chat-recipient");
    assert.deepEqual(internalRequest.payload, {
      roomId: "chat-recipient-chat-sender",
      messageIds: ["abcdef0123456789abcdef01"]
    });
    assert.deepEqual(await response.json(), { deliveredCount: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("account deletion disables all authenticated Durable Object operations", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return {
        async findOne(query, options) {
          assert.deepEqual(query, { uid: "pending-user" });
          assert.deepEqual(options, { projection: { accountStatus: 1, deletionRequestedAt: 1, suspendedUntil: 1 } });
          return { accountStatus: "deletion_pending", deletionRequestedAt: new Date() };
        }
      };
    }
  });
  const response = await connection.fetch(new Request("https://internal.invalid/internal/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: { sub: "pending-user", email_verified: true } })
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "This account is unavailable." });
});

test("central account guard blocks active suspensions before internal operations", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return {
        async findOne(query, options) {
          assert.deepEqual(query, { uid: "suspended-user" });
          assert.deepEqual(options, { projection: { accountStatus: 1, deletionRequestedAt: 1, suspendedUntil: 1 } });
          return { accountStatus: "temporarily_suspended", suspendedUntil: new Date(Date.now() + 60_000) };
        }
      };
    }
  });
  const response = await connection.fetch(new Request("https://internal.invalid/internal/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: { sub: "suspended-user", email_verified: true } })
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "This account is unavailable." });
});

test("central account guard treats invalid suspension expiry as restricted", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return {
        async findOne() {
          return { accountStatus: "temporarily_suspended", suspendedUntil: "not-a-date" };
        }
      };
    }
  });
  const response = await connection.fetch(new Request("https://internal.invalid/internal/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: { sub: "invalid-suspension-user", email_verified: true } })
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "This account is unavailable." });
});

test("central account guard blocks unverified non-admin Firebase identities", async () => {
  const connection = new MongoDBConnection({}, {});
  const response = await connection.fetch(new Request("https://internal.invalid/internal/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: { sub: "unverified-user", email_verified: false } })
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Email verification is required to use this service." });
});

test("central account guard permits verified phone sign-in for an existing account", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return {
        async findOne(query) {
          assert.deepEqual(query, { uid: "phone-user" });
          return { uid: "phone-user", role: "user", accountStatus: "active" };
        }
      };
    }
  });
  connection.ping = async () => ({ ok: true });
  const response = await connection.fetch(new Request("https://internal.invalid/internal/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      claims: {
        sub: "phone-user",
        email_verified: false,
        phone_number: "+971501234567",
        firebase: { sign_in_provider: "phone" }
      }
    })
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("central account guard rejects phone sign-in without an existing account", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return { async findOne() { return null; } };
    }
  });
  const response = await connection.fetch(new Request("https://internal.invalid/internal/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      claims: {
        sub: "new-phone-user",
        email_verified: false,
        phone_number: "+971501234567",
        firebase: { sign_in_provider: "phone" }
      }
    })
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Phone sign-in is available only for existing accounts." });
});

test("Firebase profile provisioning refuses accounts queued for deletion", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return {
        async findOne(query) {
          assert.deepEqual(query, { uid: "pending-user" });
          return { uid: "pending-user", accountStatus: "deletion_pending", deletionRequestedAt: new Date() };
        }
      };
    }
  });
  const result = await connection.findOrCreateUserFromClaims({ sub: "pending-user" });
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "This account is unavailable." });
});

test("account anonymization requires Firebase and CDN cleanup and retains historical references", async () => {
  const { ObjectId } = await import("mongodb");
  const userId = new ObjectId();
  const operations = [];
  let record = {
    _id: userId,
    role: "user",
    accountStatus: "deletion_pending",
    firebaseAuthDeletionStatus: "completed",
    cdnAssetCleanupStatus: "pending"
  };
  const users = {
    async findOne(query) {
      assert.equal(String(query._id), String(userId));
      return { ...record };
    },
    async updateOne(query, update) {
      operations.push({ query, update });
      if (query.firebaseAuthDeletionStatus === "completed" &&
          query.cdnAssetCleanupStatus === "completed") {
        record = {
          ...record,
          ...update.$set,
          accountStatus: update.$set.accountStatus
        };
        return { matchedCount: 1 };
      }
      return { matchedCount: 0 };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    assert.equal(name, "users");
    return users;
  } });

  const blocked = await connection.finalizeAdminUserAnonymization("superadmin", String(userId));
  assert.equal(blocked.status, 409);
  assert.equal(operations.length, 0);

  record.cdnAssetCleanupStatus = "completed";
  const result = await connection.finalizeAdminUserAnonymization("superadmin", String(userId));
  assert.equal(result.status, 200);
  assert.equal(result.body.anonymizationStatus, "completed");
  const update = operations[0].update;
  assert.equal(update.$set.accountStatus, "deleted");
  assert.equal(update.$set.anonymizationStatus, "completed");
  assert.equal(update.$set.email, "deleted+" + String(userId) + "@account.invalid");
  assert.equal(update.$set.name, "Deleted user");
  assert.ok(update.$unset.password !== undefined);
  assert.ok(update.$unset.mobileNumber !== undefined);
  assert.ok(update.$unset.location !== undefined);
  assert.ok(update.$unset.cdnAssetCleanupDeletedKeys !== undefined);
  assert.equal(update.$set.role, "user");
  assert.equal(record._id, userId);
});

test("admin account deletion transactionally revokes access and retains financial history", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId();
  const operations = [];
  let storedDeletionRequestedAt = null;
  let storedDeletionRequestedBy = null;
  const collection = name => ({
    async findOne(query) {
      if (name === "users") {
        assert.equal(String(query._id), String(targetId));
        return {
          _id: targetId, uid: "deleting-user", role: "user",
          deletionRequestedAt: storedDeletionRequestedAt,
          deletionRequestedBy: storedDeletionRequestedBy
        };
      }
      return null;
    },
    async updateOne(query, update) {
      operations.push({ name, method: "updateOne", query, update });
      if (name === "users") {
        storedDeletionRequestedAt = update.$set.deletionRequestedAt;
        storedDeletionRequestedBy = update.$set.deletionRequestedBy;
      }
      return { matchedCount: 1 };
    },
    async updateMany(query, update) { operations.push({ name, method: "updateMany", query, update }); return { modifiedCount: 1 }; },
    async deleteOne(query) { operations.push({ name, method: "deleteOne", query }); return { deletedCount: 1 }; },
    async deleteMany(query) { operations.push({ name, method: "deleteMany", query }); return { deletedCount: 1 }; }
  });
  const db = { collection };
  const session = {
    async withTransaction(callback) { await callback(); },
    async endSession() {}
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({ startSession: () => session });
  connection.getDatabase = () => db;

  const result = await connection.deleteAdminUser("superadmin_uid", String(targetId));
  assert.equal(result.status, 202);
  assert.equal(result.body.deletionStatus, "deletion_pending");
  assert.equal(result.body.firebaseAuthDeletionStatus, "awaiting_credentials");
  assert.equal(result.body.financialAndAuditRecordsRetained, true);
  assert.ok(operations.some(op => op.name === "users" && op.method === "updateOne" &&
    op.update.$set.accountStatus === "deletion_pending" && op.update.$set.isProfileVisible === false));
  assert.ok(operations.some(op => op.name === "subscriptions" && op.method === "updateMany" &&
    op.update.$set.status === "revoked"));
  assert.ok(operations.some(op => op.name === "darkfantasyprofiles" && op.method === "deleteOne"));
  assert.ok(operations.some(op => op.name === "secretcommunitymemberships" && op.method === "deleteMany"));
  assert.ok(operations.some(op => op.name === "videoRooms" && op.method === "updateMany" &&
    op.update.$set.status === "ended"));
  assert.ok(operations.some(op => op.name === "callSessions" && op.method === "updateMany" &&
    op.update.$set.status === "cancelled"));
  assert.equal(operations.some(op => op.name === "purchases"), false);
  assert.equal(operations.some(op => op.name === "auditlogs"), false);
  assert.equal(operations.some(op => op.name === "reports"), false);
  assert.equal(operations.some(op => op.name === "supporttickets"), false);

  const originalRequestedAt = storedDeletionRequestedAt;
  operations.length = 0;
  const retry = await connection.deleteAdminUser("superadmin_uid", String(targetId));
  assert.equal(retry.status, 202);
  assert.equal(retry.body.firebaseAuthDeletionStatus, "awaiting_credentials");
  assert.equal(storedDeletionRequestedAt, originalRequestedAt);
  assert.ok(operations.some(op => op.name === "subscriptions" && op.method === "updateMany"));
  assert.ok(operations.some(op => op.name === "darkfantasyprofiles" && op.method === "deleteOne"));
  assert.ok(operations.some(op => op.name === "secretcommunitymemberships" && op.method === "deleteMany"));
});


test("Firebase identity deletion uses service-account OAuth and treats missing identities as complete", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      assert.equal(options.method, "POST");
      assert.match(String(options.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
      return new Response(JSON.stringify({ access_token: "test-firebase-access-token" }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    assert.equal(String(url), "https://identitytoolkit.googleapis.com/v1/projects/test-project/accounts:delete");
    assert.equal(options.headers.authorization, "Bearer test-firebase-access-token");
    assert.deepEqual(JSON.parse(options.body), { localId: "firebase-user-123" });
    return new Response(JSON.stringify({ error: { message: "USER_NOT_FOUND" } }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await deleteFirebaseAuthIdentity({
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "firebase-admin@test-project.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" })
    }, "firebase-user-123");
    assert.deepEqual(result, { completed: true, configured: true });
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Firebase identity deletion remains pending when admin credentials are unavailable", async () => {
  const result = await deleteFirebaseAuthIdentity({}, "firebase-user-123");
  assert.deepEqual(result, {
    completed: false,
    configured: false,
    reason: "firebase_admin_credentials_unavailable"
  });
});


test("account CDN cleanup resumes in bounded batches and finalizes only after every owned asset is confirmed", async () => {
  const { ObjectId } = await import("mongodb");
  const userId = new ObjectId();
  const ticketId = new ObjectId();
  const photoKey = "photos-deleting-user-1730000000000.webp";
  const supportKey = "support-" + String(ticketId) + "-1730000000000-123e4567-e89b-42d3-a456-426614174000.pdf";
  const operations = [];
  const completed = new Set();
  let photos = [{ url: "https://dateme.enadoctemp.workers.dev/" + photoKey, size: 123 }];
  let attachments = [{ key: supportKey, url: "https://dateme.enadoctemp.workers.dev/" + supportKey }];
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne() {
          return {
            _id: userId, uid: "deleting-user", accountStatus: "deletion_pending",
            photos, cdnAssetCleanupDeletedKeys: [...completed]
          };
        },
        async updateOne(query, update) {
          operations.push({ name, method: "updateOne", query, update });
          for (const key of update.$addToSet?.cdnAssetCleanupDeletedKeys?.$each || []) completed.add(key);
          if (update.$set?.cdnAssetCleanupStatus === "completed") photos = [];
          return { matchedCount: 1 };
        }
      };
      if (name === "supporttickets") return {
        find(query) {
          assert.equal(String(query.userId), String(userId));
          return { async toArray() { return [{ _id: ticketId }]; } };
        }
      };
      if (name === "ticketmessages") return {
        find(query) {
          assert.equal(String(query.senderId), String(userId));
          return { async toArray() { return [{ ticketId, attachments }]; } };
        },
        async updateMany(query, update) {
          operations.push({ name, method: "updateMany", query, update });
          attachments = [];
          return { modifiedCount: 1 };
        }
      };
      throw new Error("Unexpected collection " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const inventory = await connection.getAdminUserDeletionAssets("superadmin_uid", String(userId));
  assert.equal(inventory.status, 200);
  assert.deepEqual(inventory.body.photoKeys, [photoKey]);
  assert.deepEqual(inventory.body.supportKeys, [supportKey]);
  assert.deepEqual(inventory.body.completedKeys, []);
  assert.equal(inventory.body.unresolvedAssetCount, 0);

  const firstBatch = await connection.finalizeAdminUserDeletionAssets(
    "superadmin_uid", String(userId), [photoKey]
  );
  assert.equal(firstBatch.status, 202);
  assert.equal(firstBatch.body.cdnAssetCleanupStatus, "in_progress");
  assert.equal(firstBatch.body.confirmedAssetCount, 1);
  assert.equal(photos.length, 1);
  assert.equal(attachments.length, 1);

  const resumedInventory = await connection.getAdminUserDeletionAssets("superadmin_uid", String(userId));
  assert.deepEqual(resumedInventory.body.completedKeys, [photoKey]);

  const secondBatch = await connection.finalizeAdminUserDeletionAssets(
    "superadmin_uid", String(userId), [supportKey]
  );
  assert.equal(secondBatch.status, 200);
  assert.equal(secondBatch.body.cdnAssetCleanupStatus, "completed");
  assert.equal(secondBatch.body.deletedAssetCount, 2);
  assert.equal(photos.length, 0);
  assert.equal(attachments.length, 0);
  assert.ok(operations.some(op => op.name === "ticketmessages" && op.method === "updateMany" &&
    op.update.$unset.attachments === ""));
});


test("late successful WebXPay callback flags a declined purchase for refund review without granting benefits", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "3123456789abcdef01234567";
  const purchase = { _id: new ObjectId(orderId), userId: new ObjectId("abcdef0123456789abcdef04"), status: "rejected", itemId: "super-like-5" };
  let userUpdates = 0;
  const purchases = {
    async findOne(filter) { return String(filter._id) === orderId ? purchase : null; },
    async updateOne(filter, update) {
      if (purchase.status !== filter.status) return { modifiedCount: 0 };
      Object.assign(purchase, update.$set || {});
      return { modifiedCount: 1 };
    }
  };
  const subscriptions = { async findOne() { return null; } };
  const users = { async updateOne() { userUpdates += 1; return { matchedCount: 1, modifiedCount: 1 }; } };
  const db = { collection(name) { return name === "purchases" ? purchases : name === "subscriptions" ? subscriptions : users; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db, startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) });

  const result = await connection.settleWebXPay(orderId, "00", "TLATE123");

  assert.equal(result.status, 200);
  assert.equal(result.body.refundReviewRequired, true);
  assert.equal(purchase.status, "refund_required");
  assert.equal(purchase.paymentReference, "TLATE123");
  assert.equal(purchase.refundReason, "late_success_after_cancelled_checkout");
  assert.equal(userUpdates, 0);
});

test("late successful WebXPay callback flags a cancelled subscription for refund review without activating it", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "4123456789abcdef01234567";
  const subscription = { _id: new ObjectId(orderId), userId: new ObjectId("abcdef0123456789abcdef05"), status: "cancelled", plan: "monthly", cancellationReason: "checkout_start_failed" };
  let userUpdates = 0;
  const purchases = { async findOne() { return null; } };
  const subscriptions = {
    async findOne(filter) { return String(filter._id) === orderId ? subscription : null; },
    async updateOne(filter, update) {
      if (subscription.status !== filter.status) return { modifiedCount: 0 };
      Object.assign(subscription, update.$set || {});
      return { modifiedCount: 1 };
    }
  };
  const users = { async updateOne() { userUpdates += 1; return { matchedCount: 1, modifiedCount: 1 }; } };
  const db = { collection(name) { return name === "purchases" ? purchases : name === "subscriptions" ? subscriptions : users; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db, startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) });

  const result = await connection.settleWebXPay(orderId, "00", "TLATE456");

  assert.equal(result.status, 200);
  assert.equal(result.body.refundReviewRequired, true);
  assert.equal(subscription.status, "refund_required");
  assert.equal(subscription.paymentReference, "TLATE456");
  assert.equal(subscription.refundReason, "late_success_after_cancelled_checkout");
  assert.equal(userUpdates, 0);
});


test("admin refund queue includes store purchases and subscriptions for both review and completed filters", async () => {
  const connection = new MongoDBConnection({}, {});
  const queried = [];
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({
    db: () => ({
      collection(name) {
        return {
          aggregate(pipeline) {
            const status = pipeline[0].$match.status;
            queried.push({ name, status });
            const record = name === "purchases"
              ? { _id: "purchase-1", status, paidLateAt: new Date("2026-11-07T10:00:00Z") }
              : { _id: "subscription-1", status, paidLateAt: new Date("2026-11-07T11:00:00Z") };
            return { toArray: async () => [record] };
          }
        };
      }
    })
  });

  for (const status of ["refund_required", "refunded"]) {
    const result = await connection.getAdminPurchases("admin-uid", status);
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 2);
    assert.equal(result.body[0].transactionType, "subscription");
    assert.equal(result.body[1].transactionType, "store_purchase");
    assert.ok(result.body.every(record => record.status === status));
  }
  assert.deepEqual(queried.map(entry => entry.name), ["purchases", "subscriptions", "purchases", "subscriptions"]);
  assert.deepEqual(queried.map(entry => entry.status), ["refund_required", "refund_required", "refunded", "refunded"]);
});

test("only superadmins can record a completed refund and the action is audited transactionally", async () => {
  const transactionId = "507f1f77bcf86cd799439011";
  const transaction = { _id: (await import("mongodb")).ObjectId.createFromHexString(transactionId), userId: "user-123", status: "refund_required", paymentReference: "WX-PAY-123" };
  const operations = [];
  const purchaseCollection = {
    async findOne(filter) {
      assert.equal(filter.status, "refund_required");
      return transaction;
    },
    async updateOne(filter, update) {
      operations.push({ type: "update", filter, update });
      Object.assign(transaction, update.$set);
      return { modifiedCount: 1 };
    }
  };
  const auditCollection = {
    async insertOne(entry) {
      operations.push({ type: "audit", entry });
      return { insertedId: "audit-1" };
    }
  };
  const db = { collection(name) { return name === "purchases" ? purchaseCollection : auditCollection; } };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async (_uid, superadminOnly) => {
    assert.equal(superadminOnly, true);
    return { status: 200, role: "superadmin" };
  };
  connection.getClient = async () => ({
    startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} })
  });
  connection.getDatabase = () => db;

  const result = await connection.recordAdminRefund("admin-uid", transactionId, "store_purchase", "WX-REFUND-456", "Confirmed in merchant portal");

  assert.equal(result.status, 200);
  assert.equal(transaction.status, "refunded");
  assert.equal(transaction.refundReference, "WX-REFUND-456");
  assert.equal(transaction.refundProcessedBy, "admin-uid");
  assert.equal(operations[0].type, "audit");
  assert.equal(operations[0].entry.eventType, "payment_refund_recorded");
  assert.equal(operations[0].entry.paymentReference, "WX-PAY-123");
  assert.equal(operations[1].type, "update");
});

test("refund recording rejects ordinary admins and invalid merchant references", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 403, body: { message: "Forbidden" } });
  const forbidden = await connection.recordAdminRefund("admin-uid", "507f1f77bcf86cd799439011", "subscription", "WX-REFUND-789");
  assert.equal(forbidden.status, 403);

  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  const invalid = await connection.recordAdminRefund("admin-uid", "507f1f77bcf86cd799439011", "subscription", "x");
  assert.equal(invalid.status, 400);
});

test("admin purchase list rejects unknown status filters", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  const result = await connection.getAdminPurchases("admin-uid", "unrecognized");
  assert.equal(result.status, 400);
});


test("refund recording is idempotent and does not audit an already-refunded transaction", async () => {
  const transactionId = "507f1f77bcf86cd799439013";
  const operations = [];
  const db = {
    collection(name) {
      if (name === "purchases") return {
        async findOne() { return null; },
        async updateOne() { operations.push("update"); return { modifiedCount: 0 }; }
      };
      return { async insertOne() { operations.push("audit"); } };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({
    startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} })
  });
  connection.getDatabase = () => db;

  const result = await connection.recordAdminRefund("admin-uid", transactionId, "store_purchase", "WX-REFUND-ALREADY");

  assert.equal(result.status, 409);
  assert.deepEqual(operations, []);
});

test("subscription refund completion updates subscriptions and writes its transaction type to the audit log", async () => {
  const transactionId = "507f1f77bcf86cd799439014";
  const transaction = {
    _id: (await import("mongodb")).ObjectId.createFromHexString(transactionId),
    userId: "user-456",
    status: "refund_required",
    paymentReference: "WX-SUB-PAY-456"
  };
  const operations = [];
  const subscriptionCollection = {
    async findOne(filter) {
      assert.equal(filter.status, "refund_required");
      return transaction;
    },
    async updateOne(filter, update) {
      operations.push({ type: "subscription_update", filter, update });
      Object.assign(transaction, update.$set);
      return { modifiedCount: 1 };
    }
  };
  const auditCollection = {
    async insertOne(entry) {
      operations.push({ type: "audit", entry });
      return { insertedId: "audit-sub-1" };
    }
  };
  const db = {
    collection(name) {
      if (name === "subscriptions") return subscriptionCollection;
      if (name === "auditlogs") return auditCollection;
      throw new Error("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async (_uid, superadminOnly) => {
    assert.equal(superadminOnly, true);
    return { status: 200, role: "superadmin" };
  };
  connection.getClient = async () => ({
    startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} })
  });
  connection.getDatabase = () => db;

  const result = await connection.recordAdminRefund("admin-uid", transactionId, "subscription", "WX-SUB-REFUND-456");

  assert.equal(result.status, 200);
  assert.equal(transaction.status, "refunded");
  assert.equal(operations[0].type, "audit");
  assert.equal(operations[0].entry.transactionType, "subscription");
  assert.equal(operations[0].entry.paymentReference, "WX-SUB-PAY-456");
  assert.equal(operations[1].type, "subscription_update");
});


test("analytics CSV export safely quotes dates and normalizes signup counts", () => {
  const csv = buildAnalyticsCsv([
    { _id: "2026-11-07", count: 2 },
    { _id: '2026-11-08,"late"', count: "3" },
    { _id: "2026-11-09", count: "invalid" }
  ]);

  assert.equal(csv, 'date,new_signups\n"2026-11-07",2\n"2026-11-08,""late""",3\n"2026-11-09",0');
  assert.equal(buildAnalyticsCsv(null), null);
});


test("admin purchase approval accepts an omitted body while reject and refund require JSON objects", () => {
  assert.deepEqual(normalizeAdminPurchaseActionPayload("approve", null), {});
  assert.deepEqual(normalizeAdminPurchaseActionPayload("approve", undefined), {});
  assert.deepEqual(normalizeAdminPurchaseActionPayload("approve", {}), {});
  assert.equal(normalizeAdminPurchaseActionPayload("reject", null), null);
  assert.equal(normalizeAdminPurchaseActionPayload("reject", []), null);
  assert.deepEqual(normalizeAdminPurchaseActionPayload("reject", { reason: "Duplicate request" }), { reason: "Duplicate request" });
  assert.equal(normalizeAdminPurchaseActionPayload("record-refund", null), null);
  assert.deepEqual(normalizeAdminPurchaseActionPayload("record-refund", { refundReference: "WX-123" }), { refundReference: "WX-123" });
});

test("admin support ticket filters reject unknown priority and category values", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  const invalidPriority = await connection.getAdminSupportTickets("admin-1", { priority: "Critical" });
  const invalidCategory = await connection.getAdminSupportTickets("admin-1", { category: "Billing" });
  assert.equal(invalidPriority.status, 400);
  assert.equal(invalidCategory.status, 400);
  assert.match(invalidPriority.body.message, /priority/i);
  assert.match(invalidCategory.body.message, /category/i);
});

test("admin support ticket updates validate priority and category before database access", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  const invalidPriority = await connection.updateAdminSupportStatus("admin-1", "0123456789abcdef01234567", { priority: "Critical" });
  const invalidCategory = await connection.updateAdminSupportStatus("admin-1", "0123456789abcdef01234567", { category: "Billing" });
  const emptyUpdate = await connection.updateAdminSupportStatus("admin-1", "0123456789abcdef01234567", {});
  assert.equal(invalidPriority.status, 400);
  assert.equal(invalidCategory.status, 400);
  assert.equal(emptyUpdate.status, 400);
});
