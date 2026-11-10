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
