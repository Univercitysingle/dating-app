import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { syncChatMessageStatusToRtdb, syncChatMessageToRtdb, syncChatRoomMembership, revokeAllChatMembershipsForUser } from "./firebase-rtdb.js";

let testAccountSequence = 0;

function makeEnv() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  });
  return {
    FIREBASE_PROJECT_ID: "test-project",
    FIREBASE_DATABASE_URL: "https://test-project-default-rtdb.firebaseio.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: "test-project",
      client_email: "firebase-admin-" + (++testAccountSequence) + "@test-project.iam.gserviceaccount.com",
      private_key: privateKey
    })
  };
}

function createFetchRecorder() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-admin-token", expires_in: 3600 }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response("null", { status: 200 });
  };
  return { calls, fetchImpl };
}

test("chat membership is written by the service account, not a client ID token", async () => {
  const env = makeEnv();
  const { calls, fetchImpl } = createFetchRecorder();
  await syncChatRoomMembership(env, "uid-a-uid-b", ["uid-a", "uid-b"], true, fetchImpl);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  const membershipWrite = calls.find(call => /\/chatParticipants\/uid-a-uid-b\.json$/.test(call.url));
  assert.equal(membershipWrite.init.headers.authorization, "Bearer test-admin-token");
  assert.equal(membershipWrite.init.method, "PUT");
  assert.deepEqual(JSON.parse(membershipWrite.init.body), { "uid-a": true, "uid-b": true });
  for (const uid of ["uid-a", "uid-b"]) {
    const indexWrite = calls.find(call => call.url.endsWith("/chatUserRooms/" + uid + "/uid-a-uid-b.json"));
    assert.equal(indexWrite.init.method, "PUT");
    assert.equal(JSON.parse(indexWrite.init.body), true);
  }
});

test("chat membership is revoked with an authenticated service-account DELETE", async () => {
  const env = makeEnv();
  const { calls, fetchImpl } = createFetchRecorder();
  await syncChatRoomMembership(env, "uid-a-uid-b", ["uid-a", "uid-b"], false, fetchImpl);
  assert.equal(calls.length, 4);
  const membershipDelete = calls.find(call => /\/chatParticipants\/uid-a-uid-b\.json$/.test(call.url));
  assert.equal(membershipDelete.init.method, "DELETE");
  assert.equal(membershipDelete.init.body, undefined);
  for (const uid of ["uid-a", "uid-b"]) {
    const indexDelete = calls.find(call => call.url.endsWith("/chatUserRooms/" + uid + "/uid-a-uid-b.json"));
    assert.equal(indexDelete.init.method, "DELETE");
  }
});

test("chat message sync writes only the expected public message fields", async () => {
  const env = makeEnv();
  const { calls, fetchImpl } = createFetchRecorder();
  await syncChatMessageToRtdb(env, {
    _id: "message-1", roomId: "uid-a-uid-b", senderUid: "uid-a",
    receiverUid: "uid-b", messageContent: "Hello", timestamp: new Date("2026-11-19T08:00:00.000Z"),
    password: "must-not-be-written"
  }, fetchImpl);
  const payload = JSON.parse(calls[1].init.body);
  assert.deepEqual(payload, {
    _id: "message-1", roomId: "uid-a-uid-b", senderUid: "uid-a",
    receiverUid: "uid-b", messageContent: "Hello", timestamp: "2026-11-19T08:00:00.000Z"
  });
});

test("chat message edits and soft deletions preserve mutation metadata in RTDB sync", async () => {
  const env = makeEnv();
  const { calls, fetchImpl } = createFetchRecorder();
  await syncChatMessageToRtdb(env, {
    _id: "message-mutated", roomId: "uid-a-uid-b", senderUid: "uid-a",
    receiverUid: "uid-b", messageContent: "This message was deleted.",
    timestamp: new Date("2026-11-19T08:00:00.000Z"),
    editedAt: new Date("2026-11-19T08:01:00.000Z"), editedByUid: "uid-a",
    deletedAt: new Date("2026-11-19T08:02:00.000Z"), deletedByUid: "uid-a"
  }, fetchImpl);
  const payload = JSON.parse(calls[1].init.body);
  assert.equal(payload.editedAt, "2026-11-19T08:01:00.000Z");
  assert.equal(payload.editedByUid, "uid-a");
  assert.equal(payload.deletedAt, "2026-11-19T08:02:00.000Z");
  assert.equal(payload.deletedByUid, "uid-a");
  assert.equal(payload.messageContent, "This message was deleted.");
});

test("chat receipts do not create partial RTDB records when a mirrored message is missing", async () => {
  const env = makeEnv();
  const { calls, fetchImpl } = createFetchRecorder();
  const result = await syncChatMessageStatusToRtdb(
    env, "uid-a-uid-b", ["0123456789abcdef01234567", "abcdef0123456789abcdef01"],
    "read", fetchImpl
  );
  assert.deepEqual(result, { synced: 0, skipped: 2, status: "read" });
  assert.equal(calls.filter(call => call.init.method === "GET").length, 2);
  assert.equal(calls.some(call => call.init.method === "PATCH"), false);
});

test("chat delivery and read receipts patch only existing message nodes", async () => {
  const env = makeEnv();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-admin-token", expires_in: 3600 }), { status: 200 });
    }
    if (init.method === "GET") {
      return new Response(JSON.stringify({ _id: "0123456789abcdef01234567", messageContent: "Hello" }), { status: 200 });
    }
    return new Response("null", { status: 200 });
  };
  const result = await syncChatMessageStatusToRtdb(
    env, "uid-a-uid-b", ["0123456789abcdef01234567"], "read", fetchImpl
  );
  assert.deepEqual(result, { synced: 1, skipped: 0, status: "read" });
  const patch = calls.find(call => call.init.method === "PATCH");
  assert.ok(patch);
  assert.match(patch.url, /\/chats\/uid-a-uid-b\/[a-f0-9]{24}\.json$/);
  const body = JSON.parse(patch.init.body);
  assert.equal(body.status, "read");
  assert.equal(typeof body.readAt, "string");
  assert.equal(typeof body.deliveredAt, "string");
});


test("chat receipt sync rejects invalid status and message identifiers", async () => {
  const env = makeEnv();
  const { fetchImpl } = createFetchRecorder();
  await assert.rejects(
    syncChatMessageStatusToRtdb(env, "uid-a-uid-b", ["bad-id"], "read", fetchImpl),
    /Invalid chat message status sync/
  );
  await assert.rejects(
    syncChatMessageStatusToRtdb(env, "uid-a-uid-b", ["0123456789abcdef01234567"], "sent", fetchImpl),
    /Invalid chat message status sync/
  );
});

test("invalid membership inputs and non-Firebase database URLs fail closed", async () => {
  const env = makeEnv();
  const { fetchImpl } = createFetchRecorder();
  await assert.rejects(
    syncChatRoomMembership(env, "room", ["uid-a"], true, fetchImpl),
    /Invalid chat membership update/
  );
  await assert.rejects(
    syncChatRoomMembership({ ...env, FIREBASE_DATABASE_URL: "https://attacker.example" },
      "uid-a-uid-b", ["uid-a", "uid-b"], true, fetchImpl),
    /URL is invalid/
  );
});

test("missing or mismatched service-account configuration fails closed", async () => {
  const env = makeEnv();
  const { fetchImpl } = createFetchRecorder();
  await assert.rejects(
    syncChatRoomMembership({ ...env, FIREBASE_PROJECT_ID: "other-project" },
      "uid-a-uid-b", ["uid-a", "uid-b"], true, fetchImpl),
    /configuration is invalid/
  );
});


test("account-wide chat revocation removes room access and both participant indexes", async () => {
  const env = makeEnv();
  const { calls, fetchImpl: originalFetch } = createFetchRecorder();
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith("/chatUserRooms/uid-a.json")) {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ "uid-a-uid-b": true, "uid-a-uid-c": true }), { status: 200 });
    }
    if (String(url).endsWith("/chatParticipants/uid-a-uid-b.json")) {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ "uid-a": true, "uid-b": true }), { status: 200 });
    }
    if (String(url).endsWith("/chatParticipants/uid-a-uid-c.json")) {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ "uid-a": true, "uid-c": true }), { status: 200 });
    }
    if (String(url).endsWith("/chatParticipants/legacy-room-uid-a-uid-d.json")) {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ "uid-a": true, "uid-d": true }), { status: 200 });
    }
    return originalFetch(url, init);
  };
  const result = await revokeAllChatMembershipsForUser(
    env, "uid-a", fetchImpl, ["legacy-room-uid-a-uid-d"]
  );
  assert.deepEqual(result, { revoked: 3 });
  const deletes = calls.filter(call => call.init.method === "DELETE");
  assert.equal(deletes.length, 9);
  assert.ok(deletes.some(call => call.url.endsWith("/chatParticipants/uid-a-uid-b.json")));
  assert.ok(deletes.some(call => call.url.endsWith("/chatUserRooms/uid-b/uid-a-uid-b.json")));
  assert.ok(deletes.some(call => call.url.endsWith("/chatUserRooms/uid-a/uid-a-uid-c.json")));
  assert.ok(deletes.some(call => call.url.endsWith("/chatParticipants/legacy-room-uid-a-uid-d.json")));
  assert.ok(deletes.some(call => call.url.endsWith("/chatUserRooms/uid-d/legacy-room-uid-a-uid-d.json")));
});

test("account-wide chat revocation rejects invalid identities before database access", async () => {
  const env = makeEnv();
  const { fetchImpl } = createFetchRecorder();
  await assert.rejects(revokeAllChatMembershipsForUser(env, "../uid", fetchImpl), /Invalid chat membership user/);
});
