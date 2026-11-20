import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { authenticateFirebaseRequest, verifyFirebaseIdToken, FirebaseTokenError, FirebaseKeyServiceError } from "./firebase-auth.js";

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
  ["missing subject", { sub: "" }]
]) {
  test(`rejects token with ${label}`, async () => {
    await assert.rejects(verifyFirebaseIdToken(makeToken(overrides), projectId, { now: now * 1000, fetchImpl: mockFetch() }), FirebaseTokenError);
  });
}

test("rejects when Google signing keys cannot be fetched", async () => {
  await assert.rejects(verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl: mockFetch([], 503) }), FirebaseKeyServiceError);
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

test("accepts a valid token when the optional user_id claim is absent", async () => {
  const token = makeToken();
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  delete claims.user_id;
  const changedPayload = b64url(JSON.stringify(claims));
  const input = `${header}.${changedPayload}`;
  const signed = sign("RSA-SHA256", Buffer.from(input), privateKey);
  const claimsResult = await verifyFirebaseIdToken(`${input}.${b64url(signed)}`, projectId, {
    now: now * 1000,
    fetchImpl: mockFetch()
  });
  assert.equal(claimsResult.sub, "firebase-user-123");
});


test("reuses Firebase signing keys within the provider cache lifetime", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" }
    });
  };
  const jwksCache = new Map();
  await verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl, jwksCache });
  await verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl, jwksCache });
  assert.equal(fetchCount, 1);
});

test("does not cache malformed Firebase signing key responses", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
  };
  const jwksCache = new Map();
  await assert.rejects(verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl, jwksCache }), FirebaseKeyServiceError);
  await assert.rejects(verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl, jwksCache }), FirebaseKeyServiceError);
  assert.equal(fetchCount, 2);
});


test("honours a zero-second Firebase signing-key cache lifetime", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=0" }
    });
  };
  const jwksCache = new Map();
  await verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl, jwksCache });
  await verifyFirebaseIdToken(makeToken(), projectId, { now: now * 1000, fetchImpl, jwksCache });
  assert.equal(fetchCount, 2);
});


test("rejects a Firebase user_id claim that does not match the signed subject", async () => {
  await assert.rejects(
    verifyFirebaseIdToken(makeToken({ user_id: "different-firebase-user" }), projectId, {
      now: now * 1000,
      fetchImpl: mockFetch()
    }),
    FirebaseTokenError
  );
});

test("rejects authentication timestamps later than token issuance", async () => {
  await assert.rejects(
    verifyFirebaseIdToken(makeToken({ iat: now - 120, auth_time: now - 60 }), projectId, {
      now: now * 1000,
      fetchImpl: mockFetch()
    }),
    FirebaseTokenError
  );
});

test("rejects non-numeric Firebase time claims", async () => {
  for (const overrides of [{ exp: "never" }, { iat: "now" }, { auth_time: null }]) {
    await assert.rejects(
      verifyFirebaseIdToken(makeToken(overrides), projectId, {
        now: now * 1000,
        fetchImpl: mockFetch()
      }),
      FirebaseTokenError
    );
  }
});
