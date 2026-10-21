import test from "node:test";
import assert from "node:assert/strict";
import worker, { RateLimiter } from "./index.js";

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
  assert.ok(body.missingConfiguration.includes("MONGO_API_BASE_URL"));
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
