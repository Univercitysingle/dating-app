import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Realtime Database rules deny root access and client writes", async () => {
  const rules = JSON.parse(await readFile(new URL("../database.rules.json", import.meta.url), "utf8")).rules;
  assert.equal(rules[".read"], false);
  assert.equal(rules[".write"], false);
  assert.equal(rules.chats["$roomId"][".write"], false);
  assert.equal(rules.chatParticipants[".read"], false);
  assert.equal(rules.chatParticipants[".write"], false);
  assert.equal(rules.chatUserRooms[".read"], false);
  assert.equal(rules.chatUserRooms[".write"], false);
  assert.equal(rules.notifications["$recipientUid"][".write"], false);
});

test("chat reads require authenticated room membership and notifications are recipient-only", async () => {
  const rules = JSON.parse(await readFile(new URL("../database.rules.json", import.meta.url), "utf8")).rules;
  assert.match(rules.chats["$roomId"][".read"], /auth != null/);
  assert.match(rules.chats["$roomId"][".read"], /chatParticipants/);
  assert.match(rules.chats["$roomId"][".read"], /auth\.uid/);
  assert.match(rules.chats["$roomId"][".read"], /=== true/);
  assert.match(rules.notifications["$recipientUid"][".read"], /auth != null/);
  assert.match(rules.notifications["$recipientUid"][".read"], /auth\.uid === \$recipientUid/);
});
