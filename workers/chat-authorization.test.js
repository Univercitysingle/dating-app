import test from "node:test";
import assert from "node:assert/strict";
import { MongoDBConnection } from "./mongodb-connection.js";

test("chat delivery and read receipts constrain updates to the authenticated recipient", async () => {
  const calls = [];
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "chatmessages") return {
        async findOne() { return { senderUid: "alice", receiverUid: "bob" }; },
        async updateMany(filter, update) {
          calls.push({ filter, update });
          return { modifiedCount: 1 };
        }
      };
      if (name === "users") return { async findOne() { return { blocked: [] }; } };
      if (name === "matches") return { async findOne() { return null; } };
      assert.fail("Unexpected collection: " + name);
    }
  });

  const messageId = "abcdef0123456789abcdef01";
  const delivered = await connection.markChatDelivered("bob", {
    roomId: "alice-bob",
    messageIds: [messageId]
  });
  const read = await connection.markChatRead("bob", {
    roomId: "alice-bob",
    messageIds: [messageId]
  });

  assert.equal(delivered.status, 200);
  assert.equal(read.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].filter.receiverUid, "bob");
  assert.equal(calls[0].filter.roomId, "alice-bob");
  assert.equal(calls[0].filter.status, "sent");
  assert.equal(calls[1].filter.receiverUid, "bob");
  assert.deepEqual(calls[1].filter.status, { $in: ["sent", "delivered"] });
  assert.equal(calls[0].filter._id.$in.length, 1);
  assert.equal(calls[1].filter._id.$in.length, 1);
  assert.equal(calls[0].update.$set.status, "delivered");
  assert.ok(calls[0].update.$set.deliveredAt instanceof Date);
  assert.equal(calls[1].update.$set.status, "read");
  assert.ok(calls[1].update.$set.deliveredAt instanceof Date);
  assert.ok(calls[1].update.$set.readAt instanceof Date);
});

test("opaque chat room IDs are authorized by persisted participant membership, not UID substrings", async () => {
  const roomId = "4algfrbMzreXjpUg07ISRiJe8iI2-dTC31uC4gLbbDz1OS9uIET2I1K52";
  const conversation = { senderUid: "alice", receiverUid: "bob" };
  const calls = [];
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "chatmessages") return {
        async findOne(filter) {
          calls.push({ collection: name, filter });
          return filter.roomId === roomId ? conversation : null;
        },
        async updateMany(filter) {
          calls.push({ collection: name, filter });
          return { modifiedCount: 1 };
        }
      };
      if (name === "users") return {
        async findOne(filter) {
          calls.push({ collection: name, filter });
          return { uid: filter.uid, blocked: [] };
        }
      };
      if (name === "matches") return { async findOne() { return null; } };
      if (name === "chatTyping") return {
        async findOne(filter) { calls.push({ collection: name, filter }); return null; },
        async updateOne(filter, update, options) { calls.push({ collection: name, filter, update, options }); return { matchedCount: 1, modifiedCount: 1 }; }
      };
      assert.fail("Unexpected collection " + name);
    }
  });

  const typingRead = await connection.getTypingStatus("alice", roomId);
  const typingWrite = await connection.updateTypingStatus("alice", { roomId, isTyping: true });
  const delivered = await connection.markChatDelivered("bob", { roomId, messageIds: ["abcdef0123456789abcdef01"] });
  const read = await connection.markChatRead("bob", { roomId, messageIds: ["abcdef0123456789abcdef01"] });

  assert.equal(typingRead.status, 200);
  assert.equal(typingRead.body.isTyping, false);
  assert.equal(typingWrite.status, 200);
  assert.equal(delivered.status, 200);
  assert.equal(read.status, 200);
  assert.ok(calls.some(call => call.collection === "chatmessages" && call.filter.roomId === roomId));
  assert.ok(calls.some(call => call.collection === "chatTyping" && call.filter.roomId === roomId));
  assert.ok(calls.some(call => call.collection === "chatmessages" && call.filter.receiverUid === "bob"));
});


test("calls are denied after a participant blocks the other participant", async () => {
  const usersByUid = {
    alice: { uid: "alice", blocked: ["bob"] },
    bob: { uid: "bob", blocked: [] }
  };
  const db = {
    collection(name) {
      if (name === "users") return { async findOne({ uid }) { return usersByUid[uid] || null; } };
      if (name === "matches") return { async findOne() { return { status: "matched" }; } };
      if (name === "chatmessages") return {};
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  assert.equal(await connection.isCallPairUnavailable(db, "alice", "bob"), true);
});

test("calls are denied after either participant blocks the other participant", async () => {
  const usersByUid = {
    alice: { uid: "alice", blocked: [] },
    bob: { uid: "bob", blocked: ["alice"] }
  };
  const db = {
    collection(name) {
      if (name === "users") return { async findOne({ uid }) { return usersByUid[uid] || null; } };
      if (name === "matches") return { async findOne() { return { status: "matched" }; } };
      if (name === "chatmessages") return {};
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  assert.equal(await connection.isCallPairUnavailable(db, "alice", "bob"), true);
});

test("calls are denied when a persisted match has been unmatched", async () => {
  const usersByUid = {
    alice: { uid: "alice", blocked: [] },
    bob: { uid: "bob", blocked: [] }
  };
  const db = {
    collection(name) {
      if (name === "users") return { async findOne({ uid }) { return usersByUid[uid] || null; } };
      if (name === "matches") return { async findOne() { return { status: "unmatched" }; } };
      if (name === "chatmessages") return {};
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  assert.equal(await connection.isCallPairUnavailable(db, "alice", "bob"), true);
});

test("call creation rejects an unmatched pair before creating a call session", async () => {
  const usersByUid = {
    alice: { uid: "alice", blocked: [], accountStatus: "active" },
    bob: { uid: "bob", blocked: [], accountStatus: "active" }
  };
  let callSessionAccessed = false;
  const db = {
    collection(name) {
      if (name === "users") return { async findOne({ uid }) { return usersByUid[uid] || null; } };
      if (name === "matches") return { async findOne() { return { status: "unmatched" }; } };
      if (name === "chatmessages") return {};
      if (name === "callSessions") {
        callSessionAccessed = true;
        return { async findOne() { return null; }, async insertOne() { assert.fail("Must not create a call"); } };
      }
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createCall("alice", {
    roomId: "alice-bob",
    receiverUid: "bob",
    type: "audio",
    offer: { type: "offer", sdp: "valid-offer" }
  });

  assert.equal(result.status, 403);
  assert.equal(callSessionAccessed, false);
});


test("chat and calling are denied when either account is suspended or deletion-pending", async () => {
  const usersByUid = {
    alice: { uid: "alice", blocked: [], accountStatus: "active" },
    bob: { uid: "bob", blocked: [], accountStatus: "temporarily_suspended", suspendedUntil: new Date(Date.now() + 60_000) }
  };
  const db = {
    collection(name) {
      if (name === "users") return { async findOne({ uid }) { return usersByUid[uid] || null; } };
      if (name === "matches") return { async findOne() { return { status: "matched" }; } };
      if (name === "chatmessages") return {};
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  assert.equal(await connection.isCallPairUnavailable(db, "alice", "bob"), true);

  usersByUid.bob = { uid: "bob", blocked: [], accountStatus: "active", deletionRequestedAt: new Date() };
  assert.equal(await connection.isCallPairUnavailable(db, "alice", "bob"), true);
});


test("chat history is denied before message access for a suspended account", async () => {
  let messageCollectionAccessed = false;
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "users") return {
        async findOne({ uid }) {
          assert.equal(uid, "alice");
          return { uid: "alice", accountStatus: "permanently_banned" };
        }
      };
      if (name === "chatmessages") {
        messageCollectionAccessed = true;
        assert.fail("Suspended account must be rejected before reading chat messages");
      }
      assert.fail("Unexpected collection: " + name);
    }
  });

  const result = await connection.getChatHistory("alice", "alice-bob");

  assert.equal(result.status, 403);
  assert.equal(messageCollectionAccessed, false);
});
