import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { constants, generateKeyPairSync, privateEncrypt } from "node:crypto";
import worker, { RateLimiter, MongoDBConnection } from "./index.js";

function request(path, method = "GET") {
  return new Request("https://dating-app.test" + path, { method });
}

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

test("GET /favicon.ico returns an empty response instead of an unmigrated-route error", async () => {
  const response = await worker.fetch(request("/favicon.ico"), {});
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
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

test("MongoDB Durable Object exposes no general-purpose HTTP operation", async () => {
  const connection = new MongoDBConnection({}, {});
  const response = await connection.fetch(request("/internal/query", "POST"));
  assert.equal(response.status, 404);
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
    insertOne: async (doc) => { insertedNotification = doc; },
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
  const notifications = { insertOne: async (doc) => { insertedNotification = doc; }, deleteOne: async () => ({ deletedCount: 0 }) };
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

test("discovery returns ordered public profiles with super-like metadata", async () => {
  const current = { uid: "current", preference: "everyone", location: { coordinates: [0, 0] } };
  const candidate = { _id: "candidate-id", uid: "candidate", name: "Candidate", email: "private@example.com", password: "secret", lastLoginIp: "192.0.2.1", photos: [{ url: "photos/a.jpg" }] };
  let pipeline;
  const users = {
    findOne: async () => current,
    aggregate: (value) => { pipeline = value; return { toArray: async () => [{ uid: "candidate" }] }; },
    find: () => ({ toArray: async () => [candidate] })
  };
  const matches = { find: () => ({ project: () => ({ toArray: async () => [{ user1Uid: "candidate" }] }) }) };
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
});

test("likes query returns pending likers with privacy filtering and premium blur metadata", async () => {
  const current = { _id: "current-id", uid: "current", plan: "basic" };
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
    assert.deepEqual(query, { user2Uid: "current", status: "pending" });
    return { toArray: async () => [{ user1Uid: "liker", user2Uid: "current", status: "pending", superLike: true }] };
  }};
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: (name) => name === "users" ? users : matches }) });
  const result = await connection.getLikes("current");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].likeType, "superlike");
  assert.equal(result.body[0].isBlurred, true);
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
  const target = { _id: "target-id", uid: "target", email: "private@example.com", mobileNumber: "+971501234567", name: "Target", photos: [{ url: "photo.jpg" }] };
  const viewer = { uid: "viewer", role: "user" };
  const users = { findOne: async (query) => query.uid === "target" ? target : viewer };
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "cdn.example.com" });
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });
  const result = await connection.getUserProfile("target", "viewer");
  assert.equal(result.status, 200);
  assert.equal(result.body.id, "target-id");
  assert.equal(result.body.email, undefined);
  assert.equal(result.body.mobileNumber, undefined);
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
  const stored = { _id: "user-id", uid: "user-1", email: "user@example.com", photos: [] };
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
  const response = await connection.fetch(new Request("https://internal.invalid/internal/support-tickets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: { sub: "user-1" }, action: "POST", payload: { subject: " ", message: "help" } })
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


test("WebXPay callback verifies the signed response before asking MongoDB to settle", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const orderId = "0123456789abcdef01234567";
  const signedPayload = orderId + "|T123456|2026-10-21 12:00:00|1|00|Approved";
  const payment = Buffer.from(signedPayload, "utf8").toString("base64");
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
  assert.deepEqual(settled, { orderId, statusCode: "00", reference: "T123456" });
});

test("WebXPay callback rejects invalid signatures and does not settle an order", async () => {
  const { publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  let called = false;
  const payment = Buffer.from("0123456789abcdef01234567|T123|date|1|00|Approved").toString("base64");
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


test("bank-slip submission uses server-owned plan metadata and private object keys", async () => {
  const user = { _id: "user-object-id", uid: "user-1", plan: "basic" };
  let inserted = null;
  const subscriptions = {
    async findOne() { return null; },
    async insertOne(doc) { inserted = doc; return { insertedId: "subscription-id" }; }
  };
  const users = { async findOne() { return user; } };
  const db = { collection(name) { return name === "users" ? users : subscriptions; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const result = await connection.createBankSlipSubscription(
    "user-1", "bank-slips-user-1-12345678-1234-4234-8234-123456789abc.jpg", "image/jpeg", 2048, "premium_1m"
  );
  assert.equal(result.status, 201);
  assert.equal(inserted.plan, "premium");
  assert.equal(inserted.durationDays, 30);
  assert.equal(inserted.superLikes, 25);
  assert.equal(inserted.undos, 50);
  assert.equal(inserted.status, "pending");
  assert.equal(inserted.bankSlipContentType, "image/jpeg");
  const invalid = await connection.createBankSlipSubscription(
    "user-1", "bank-slips-user-1-12345678-1234-4234-8234-123456789abc.jpg", "image/jpeg", 2048, "premium_99y"
  );
  assert.equal(invalid.status, 400);
});

test("bank-slip admin retrieval and moderation deny non-admin users", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({
    db: () => ({ collection: () => ({ findOne: async () => ({ role: "user" }) }) })
  });
  const key = "bank-slips-user-1-12345678-1234-4234-8234-123456789abc.jpg";
  assert.equal((await connection.authorizeAdminBankSlip("ordinary-user", key)).status, 403);
  assert.equal((await connection.getPendingBankSlipSubscriptions("ordinary-user")).status, 403);
  assert.equal((await connection.moderateBankSlipSubscription("ordinary-user", "0123456789abcdef01234567", "approve")).status, 403);
});


test("bank-slip deletion is limited to the owner's pending submission", async () => {
  const { ObjectId } = await import("mongodb");
  const id = "3123456789abcdef01234567";
  const userId = new ObjectId("abcdef0123456789abcdef04");
  const key = "bank-slips-user-1-12345678-1234-4234-8234-123456789abc.jpg";
  const subscription = { _id: new ObjectId(id), userId, status: "pending", bankSlipUrl: key };
  const users = { async findOne() { return { _id: userId }; } };
  const subscriptions = {
    async findOne(filter) {
      return String(filter._id) === id && String(filter.userId) === String(userId) && filter.status === "pending" ? { bankSlipUrl: key } : null;
    },
    async updateOne(filter, update) {
      if (String(filter._id) !== id || String(filter.userId) !== String(userId) || subscription.status !== filter.status) return { modifiedCount: 0 };
      Object.assign(subscription, update.$set || {});
      for (const field of Object.keys(update.$unset || {})) delete subscription[field];
      return { modifiedCount: 1 };
    }
  };
  const db = { collection(name) { return name === "users" ? users : subscriptions; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const result = await connection.deleteOwnPendingBankSlip("user-1", id);
  assert.equal(result.status, 200);
  assert.equal(result.body.key, key);
  assert.equal(subscription.status, "cancelled");
  assert.equal(subscription.bankSlipUrl, undefined);
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
      return { async insertOne(doc) { stored.push({ ...doc, _id: new ObjectId("abcdef0123456789abcdef03") }); return { insertedId: stored[0]._id }; } };
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
  const messages = [{ roomId: "alice-bob", senderUid: "alice", receiverUid: "bob", messageContent: "Hi" }];
  const db = {
    collection(name) {
      if (name === "users") return { async findOne(filter) { return filter.uid === "alice" ? { uid: "alice", role: "user" } : null; } };
      return {
        find(query) {
          capturedQuery = query;
          return { sort() { return this; }, skip(value) { capturedSkip = value; return this; }, limit(value) { capturedLimit = value; return this; }, async toArray() { return messages; } };
        },
        async findOne() { return { _id: "message-id" }; }
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
    headers: { "content-type": "application/json" },
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
  assert.equal(claims.claims.role, "superadmin");
});
