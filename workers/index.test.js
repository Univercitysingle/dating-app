import test from "node:test";
import assert from "node:assert/strict";
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
  const response = await worker.fetch(request("/api/matches"), {});
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

test("MongoDB Durable Object ping fails closed without a URI", async () => {
  const connection = new MongoDBConnection({}, {});
  assert.deepEqual(await connection.ping(), { ok: false });
});

test("MongoDB Durable Object exposes no general-purpose HTTP operation", async () => {
  const connection = new MongoDBConnection({}, {});
  const response = await connection.fetch(request("/internal/query", "POST"));
  assert.equal(response.status, 404);
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

test("password-based administrator login fails closed until migrated", async () => {
  const response = await worker.fetch(new Request("https://dating-app.test/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "secret" })
  }), { FIREBASE_PROJECT_ID: "test-project" });
  assert.equal(response.status, 501);
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
