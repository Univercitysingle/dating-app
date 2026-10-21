import test from "node:test";
import assert from "node:assert/strict";
import worker, { RateLimiter, MongoDBConnection } from "./index.js";

function request(path, method = "GET") {
  return new Request("https://dating-app.test" + path, { method });
}

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
  connection.clientPromise = Promise.resolve({ db: () => ({ collection: () => users }) });
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
  connection.clientPromise = Promise.resolve({ db: () => ({ collection: () => users }) });
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
  connection.clientPromise = Promise.resolve({ db: () => ({ collection: () => users }) });
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
