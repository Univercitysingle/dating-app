import test from "node:test";
import assert from "node:assert/strict";
import { MongoDBConnection } from "./mongodb-connection.js";

test("simultaneous reciprocal likes create one canonical matched record", async () => {
  const storedMatches = [];
  let nextId = 0;
  let initialReads = 0;
  let releaseInitialReads;
  const bothInitialReads = new Promise(resolve => { releaseInitialReads = resolve; });
  let uniqueIndexOptions = null;

  const matches = {
    async createIndex(keys, options) {
      assert.deepEqual(keys, { pairKey: 1 });
      uniqueIndexOptions = options;
      return "unique_match_pair_key";
    },
    async findOne(filter) {
      if (filter.$or) {
        initialReads += 1;
        if (initialReads === 2) releaseInitialReads();
        await bothInitialReads;
        return storedMatches.find(match =>
          (match.user1Uid === filter.$or[0].user1Uid && match.user2Uid === filter.$or[0].user2Uid) ||
          (match.user1Uid === filter.$or[1].user1Uid && match.user2Uid === filter.$or[1].user2Uid)
        ) || null;
      }
      if (filter.pairKey) return storedMatches.find(match => match.pairKey === filter.pairKey) || null;
      if (filter._id) return storedMatches.find(match => match._id === filter._id) || null;
      return null;
    },
    async insertOne(document) {
      if (storedMatches.some(match => match.pairKey === document.pairKey)) {
        const duplicate = new Error("duplicate match pair");
        duplicate.code = 11000;
        throw duplicate;
      }
      const inserted = { ...document, _id: `match-${++nextId}` };
      storedMatches.push(inserted);
      return { insertedId: inserted._id };
    },
    async updateOne(filter, update) {
      const match = storedMatches.find(item =>
        (filter._id && item._id === filter._id) ||
        (filter.pairKey && item.pairKey === filter.pairKey)
      );
      if (!match) return { matchedCount: 0 };
      if (update.$set) Object.assign(match, update.$set);
      if (update.$addToSet) {
        for (const [key, value] of Object.entries(update.$addToSet)) {
          if (!Array.isArray(match[key])) match[key] = [];
          if (!match[key].includes(value)) match[key].push(value);
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };

  const users = {
    async findOne({ uid }) {
      return { uid, blocked: [], accountStatus: "active" };
    },
    async updateOne() {
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const notifications = {
    async updateOne() { return { matchedCount: 1, upsertedCount: 1 }; },
    async deleteOne() { return { deletedCount: 0 }; }
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      if (name === "notifications") return notifications;
      throw new Error(`Unexpected collection: ${name}`);
    }
  };

  const createConnection = () => {
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({});
    connection.getDatabase = () => db;
    return connection;
  };

  const [aliceResult, bobResult] = await Promise.all([
    createConnection().recordSwipe("alice", "bob", "like", true),
    createConnection().recordSwipe("bob", "alice", "like", true)
  ]);

  assert.equal(uniqueIndexOptions.unique, true);
  assert.equal(storedMatches.length, 1);
  assert.deepEqual([storedMatches[0].user1Uid, storedMatches[0].user2Uid], ["alice", "bob"]);
  assert.deepEqual(new Set(storedMatches[0].likedBy), new Set(["alice", "bob"]));
  assert.equal(storedMatches[0].status, "matched");
  assert.equal(aliceResult.status, 200);
  assert.equal(bobResult.status, 200);
  assert.ok([aliceResult.body.status, bobResult.body.status].includes("matched"));
});
