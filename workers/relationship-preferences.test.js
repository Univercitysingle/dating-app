import test from "node:test";
import assert from "node:assert/strict";
import { MongoDBConnection } from "./mongodb-connection.js";

function createConnection(user) {
  const updates = [];
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return {
        async findOne(filter, options) {
          assert.deepEqual(filter, { uid: "member-1" });
          assert.ok(options?.projection?.birthday);
          return user;
        },
        async updateOne(filter, update) {
          updates.push({ filter, update });
          return { matchedCount: 1, modifiedCount: 1 };
        }
      };
    }
  });
  return { connection, updates };
}

test("Desires & Discovery rejects a missing birthday without weakening age verification", async () => {
  const { connection } = createConnection({ uid: "member-1" });
  const result = await connection.getRelationshipPreferences("member-1");
  assert.equal(result.status, 403);
  assert.match(result.body.error, /adult age verification/i);
});

test("Desires & Discovery rejects an underage birthday", async () => {
  const { connection } = createConnection({ uid: "member-1", birthday: new Date("2012-01-01T00:00:00.000Z") });
  const result = await connection.getRelationshipPreferences("member-1");
  assert.equal(result.status, 403);
  assert.match(result.body.error, /18 or older/i);
});

test("Desires & Discovery returns private defaults for an eligible adult without saved consent", async () => {
  const { connection } = createConnection({ uid: "member-1", birthday: new Date("1990-01-01T00:00:00.000Z") });
  const result = await connection.getRelationshipPreferences("member-1");
  assert.equal(result.status, 200);
  assert.equal(result.body.consent, false);
  assert.deepEqual(result.body.desires, []);
  assert.equal(result.body.visibility.desires, "private");
});

test("Desires & Discovery remains unavailable to restricted accounts", async () => {
  const { connection } = createConnection({
    uid: "member-1",
    birthday: new Date("1990-01-01T00:00:00.000Z"),
    accountStatus: "permanently_banned"
  });
  const result = await connection.getRelationshipPreferences("member-1");
  assert.equal(result.status, 403);
  assert.match(result.body.error, /account is unavailable/i);
});
