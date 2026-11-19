import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadRules() {
  return JSON.parse(
    await readFile(new URL("../database.rules.json", import.meta.url), "utf8")
  ).rules;
}

test("Realtime Database rules default to deny and expose only reviewed paths", async () => {
  const rules = await loadRules();
  assert.equal(rules[".read"], false);
  assert.equal(rules[".write"], false);
  assert.deepEqual(
    Object.keys(rules).sort(),
    [".read", ".write", "chats", "chatParticipants", "chatUserRooms", "notifications"].sort()
  );
});

test("chat history reads require authenticated room membership", async () => {
  const rules = await loadRules();
  const chatRules = rules.chats?.["$roomId"];
  assert.ok(chatRules);
  assert.equal(chatRules[".read"],
    "auth != null && root.child('chatParticipants').child($roomId).child(auth.uid).val() === true");
  assert.equal(chatRules[".write"], false);
});

test("chat membership indexes are inaccessible to clients", async () => {
  const rules = await loadRules();
  for (const path of ["chatParticipants", "chatUserRooms"]) {
    assert.equal(rules[path]?.[".read"], false, path + " must not be client-readable");
    assert.equal(rules[path]?.[".write"], false, path + " must not be client-writable");
  }
});

test("notifications are recipient-readable only and cannot be client-written", async () => {
  const rules = await loadRules();
  const notificationRules = rules.notifications?.["$recipientUid"];
  assert.ok(notificationRules);
  assert.equal(notificationRules[".read"], "auth != null && auth.uid === $recipientUid");
  assert.equal(notificationRules[".write"], false);
});

test("Firebase CLI configuration points to the reviewed Realtime Database rules file", async () => {
  const config = JSON.parse(
    await readFile(new URL("../firebase.json", import.meta.url), "utf8")
  );
  assert.equal(config.database?.rules, "database.rules.json");
});
