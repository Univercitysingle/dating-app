import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { MongoDBConnection } from "./mongodb-connection.js";

function barrier(target) {
  let count = 0;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  return async () => {
    count += 1;
    if (count === target) release();
    await ready;
  };
}

test("simultaneous identical chat sends persist once and return the same message", async () => {
  const id = new ObjectId("abcdef0123456789abcdef01");
  const clientMessageId = "123e4567-e89b-42d3-a456-426614174000";
  const initialLookupsReady = barrier(2);
  const insertsReady = barrier(2);
  let lookupCount = 0;
  let insertCount = 0;
  let persisted = null;

  const users = {
    async findOne({ uid }) {
      return { uid, blocked: [] };
    }
  };
  const messages = {
    async createIndex() {
      return "chat_sender_client_message_unique";
    },
    async findOne() {
      lookupCount += 1;
      if (lookupCount <= 2) {
        await initialLookupsReady();
        return null;
      }
      return persisted;
    },
    async insertOne(document) {
      insertCount += 1;
      const attempt = insertCount;
      await insertsReady();
      if (attempt === 1) {
        persisted = { ...document, _id: id };
        return { insertedId: id };
      }
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "chatmessages") return messages;
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const payload = {
    roomId: "alice-bob",
    receiverUid: "bob",
    messageContent: "  Hello Bob  ",
    clientMessageId
  };

  const results = await Promise.all([
    connection.createChatMessage("alice", payload),
    connection.createChatMessage("alice", payload)
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  assert.equal(String(results[0].body._id), String(id));
  assert.equal(String(results[1].body._id), String(id));
  assert.equal(results[0].body.clientMessageId, clientMessageId);
  assert.equal(results[1].body.clientMessageId, clientMessageId);
  assert.equal(results[0].body.messageContent, "Hello Bob");
  assert.equal(results[1].body.messageContent, "Hello Bob");
  assert.equal(lookupCount, 3);
  assert.equal(insertCount, 2);
  assert.ok(persisted);
});
