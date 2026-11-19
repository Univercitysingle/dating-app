import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { syncChatMessageToRtdb, syncChatRoomMembership } from "./firebase-rtdb.js";

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
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.match(calls[1].url, /\/chatParticipants\/uid-a-uid-b\.json\?access_token=test-admin-token$/);
  assert.equal(calls[1].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].init.body), { "uid-a": true, "uid-b": true });
});

test("chat membership is revoked with an authenticated service-account DELETE", async () => {
  const env = makeEnv();
  const { calls, fetchImpl } = createFetchRecorder();
  await syncChatRoomMembership(env, "uid-a-uid-b", ["uid-a", "uid-b"], false, fetchImpl);
  assert.equal(calls[1].init.method, "DELETE");
  assert.equal(calls[1].init.body, undefined);
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
