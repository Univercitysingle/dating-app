import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { authenticateFirebaseRequest, verifyFirebaseIdToken, FirebaseTokenError } from "./firebase-auth.js";

const projectId = "test-project";
const now = 1_800_000_000;
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function makeToken(overrides = {}, tamperSignature = false) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }));
  const claims = b64url(JSON.stringify({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: "firebase-user-123",
    user_id: "firebase-user-123",
    iat: now - 60,
    auth_time: now - 60,
    exp: now + 3600,
    ...overrides
  }));
  const input = `${header}.${claims}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), privateKey);
  if (tamperSignature) signature[0] ^= 0xff;
  return `${input}.${b64url(signature)}`;
}

function mockFetch(keys = [jwk], status = 200) {
  return async () => new Response(JSON.stringify({ keys }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("accepts a correctly signed Firebase ID token for the configured project", async () => {
  const claims = await verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl: mockFetch() });
  assert.equal(claims.sub, "firebase-user-123");
});

test("rejects malformed tokens", async () => {
  await assert.rejects(verifyFirebaseIdToken("not-a-jwt", projectId, { now: now * 1000, fetchImpl: mockFetch() }), FirebaseTokenError);
});

test("rejects a bad signature", async () => {
  await assert.rejects(verifyFirebaseIdToken(makeToken({}, true), projectId, { now: now * 1000, fetchImpl: mockFetch() }), FirebaseTokenError);
});

for (const [label, overrides] of [
  ["wrong audience", { aud: "another-project" }],
  ["wrong issuer", { iss: "https://securetoken.google.com/another-project" }],
  ["expired token", { exp: now - 1 }],
  ["future-issued token", { iat: now + 60 }],
  ["future authentication time", { auth_time: now + 60 }],
  ["missing subject", { sub: "" }],
  ["mismatched user ID", { user_id: "someone-else" }]
]) {
  test(`rejects token with ${label}`, async () => {
    await assert.rejects(verifyFirebaseIdToken(makeToken(overrides), projectId, { now: now * 1000, fetchImpl: mockFetch() }), FirebaseTokenError);
  });
}

test("rejects when Google signing keys cannot be fetched", async () => {
  await assert.rejects(verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl: mockFetch([], 503) }), FirebaseTokenError);
});

test("rejects a key ID that is not in Google's key set", async () => {
  await assert.rejects(verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl: mockFetch([]) }), FirebaseTokenError);
});

test("request authentication requires a Bearer token", async () => {
  await assert.rejects(authenticateFirebaseRequest(new Request("https://worker.test/api/me"), projectId, { fetchImpl: mockFetch() }), FirebaseTokenError);
});

test("request authentication returns verified claims", async () => {
  const request = new Request("https://worker.test/api/me", { headers: { authorization: `Bearer ${makeToken()}` } });
  const claims = await authenticateFirebaseRequest(request, projectId, { now: now * 1000, fetchImpl: mockFetch() });
  assert.equal(claims.sub, "firebase-user-123");
});
