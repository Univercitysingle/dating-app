import test from "node:test";
import assert from "node:assert/strict";
import { MongoDBConnection } from "./mongodb-connection.js";

test("chat delivery and read receipts constrain updates to the authenticated recipient", async () => {
  const calls = [];
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "chatmessages");
      return {
        async updateMany(filter, update) {
          calls.push({ filter, update });
          return { modifiedCount: 1 };
        }
      };
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
});

test("chat receipts reject a room that does not contain the authenticated user without database access", async () => {
  const connection = new MongoDBConnection({}, {});
  let accessed = false;
  connection.getClient = async () => {
    accessed = true;
    return {};
  };

  const delivered = await connection.markChatDelivered("mallory", {
    roomId: "alice-bob",
    messageIds: ["abcdef0123456789abcdef01"]
  });
  const read = await connection.markChatRead("mallory", {
    roomId: "alice-bob",
    messageIds: ["abcdef0123456789abcdef01"]
  });

  assert.equal(delivered.status, 400);
  assert.equal(read.status, 400);
  assert.equal(accessed, false);
});
