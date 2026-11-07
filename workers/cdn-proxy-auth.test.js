import test from "node:test";
import assert from "node:assert/strict";
import { requestCdnObject } from "./index.js";

const claims = { sub: "user_123" };
const key = "photos-user_123-1762473600000.webp";
const env = {
  CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/",
  JWT_SECRET: "test-cdn-jwt-secret-that-is-at-least-32-characters",
  CDN_PROXY: {
    async fetch(request) {
      return new Response(JSON.stringify({
        method: request.method,
        pathname: new URL(request.url).pathname
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  }
};

function decodeJwtPayload(token) {
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

test("CDN service binding receives the canonical object path, signed owner token, and upload headers", async () => {
  let captured;
  const testEnv = {
    ...env,
    CDN_PROXY: {
      async fetch(request) {
        captured = request;
        return new Response("stored", { status: 200 });
      }
    }
  };
  const bytes = new Uint8Array([1, 2, 3]);
  const response = await requestCdnObject(
    testEnv,
    key,
    "PUT",
    { "Content-Type": "image/webp", Origin: "https://dating-app-staging.pages.dev" },
    bytes,
    claims
  );

  assert.equal(response.status, 200);
  assert.equal(captured.method, "PUT");
  assert.equal(new URL(captured.url).hostname, "dateme.enadoctemp.workers.dev");
  assert.equal(new URL(captured.url).pathname, "/" + key);
  assert.equal(captured.headers.get("content-type"), "image/webp");
  assert.equal(captured.headers.get("origin"), "https://dating-app-staging.pages.dev");

  const token = captured.headers.get("authorization")?.replace(/^Bearer /, "");
  assert.ok(token);
  const payload = decodeJwtPayload(token);
  assert.equal(payload.sub, claims.sub);
  assert.equal(payload.iss, "dating-app-api");
  assert.equal(payload.aud, "dateme-cdn");
  assert.equal(payload.key, key);
  assert.equal(payload.method, "PUT");
  assert.ok(payload.exp > payload.iat);
});

test("CDN service binding rejects object keys outside the authenticated user's photo namespace", async () => {
  await assert.rejects(
    requestCdnObject(env, "photos-someone-else-1762473600000.webp", "PUT", {}, new Uint8Array([1]), claims),
    /CDN object key is not an allowed application upload key/
  );
});

test("CDN service binding rejects unsupported methods and missing bindings", async () => {
  await assert.rejects(
    requestCdnObject(env, key, "GET", {}, undefined, claims),
    /CDN authorization only permits PUT and DELETE/
  );

  await assert.rejects(
    requestCdnObject({ ...env, CDN_PROXY: undefined }, key, "PUT", {}, new Uint8Array([1]), claims),
    /CDN_PROXY service binding is not configured/
  );
});
