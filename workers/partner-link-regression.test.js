import assert from "node:assert/strict";
import test from "node:test";
import { MongoDBConnection } from "./mongodb-connection.js";

test("partner-link acceptance rechecks blocks and private opt-out boundaries", async () => {
  const { ObjectId } = await import("mongodb");
  const now = new Date();
  const adult = uid => ({
    uid,
    birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()),
    accountStatus: "active",
    relationshipPreferences: { boundaries: [] },
    blocked: []
  });
  const members = [adult("partner-a"), adult("partner-b")];
  const records = [];
  let writes = 0;
  const links = {
    createIndex: async () => "index",
    findOne: async query => query._id
      ? records.find(record => String(record._id) === String(query._id) && record.memberUids.includes(query.memberUids)) || null
      : null,
    insertOne: async document => {
      const record = { ...document, _id: new ObjectId() };
      records.push(record);
      return { insertedId: record._id };
    },
    updateOne: async () => { writes++; return { modifiedCount: 1 }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => name === "users"
    ? { findOne: async ({ uid }) => members.find(member => member.uid === uid) || null }
    : links
  });

  const invitation = await connection.managePartnerLink("partner-a", "invite", { targetUid: "partner-b" });
  assert.equal(invitation.status, 201);
  members[1].relationshipPreferences.boundaries = ["no_partner_linking"];

  const accepted = await connection.managePartnerLink("partner-b", "accept", { linkId: invitation.body.id });
  assert.equal(accepted.status, 403);
  assert.equal(records[0].status, "pending");
  assert.equal(writes, 0);
});

test("partner-link cooldown starts at revocation rather than the original invitation", async () => {
  const { ObjectId } = await import("mongodb");
  const now = new Date();
  const oldCreatedAt = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const recentRevocation = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const adult = uid => ({
    uid,
    birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()),
    accountStatus: "active",
    relationshipPreferences: { boundaries: [] },
    blocked: []
  });
  const users = [adult("partner-a"), adult("partner-b")];
  const previous = {
    _id: new ObjectId(),
    memberUids: ["partner-a", "partner-b"],
    status: "revoked",
    createdAt: oldCreatedAt,
    revokedAt: recentRevocation,
    updatedAt: recentRevocation
  };
  let inserted = false;
  const links = {
    createIndex: async () => "index",
    findOne: async query => query.memberUids?.$in ? null : previous,
    insertOne: async () => { inserted = true; return { insertedId: new ObjectId() }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => name === "users"
    ? { findOne: async ({ uid }) => users.find(user => user.uid === uid) || null }
    : links
  });

  const result = await connection.managePartnerLink("partner-a", "invite", { targetUid: "partner-b" });
  assert.equal(result.status, 429);
  assert.equal(inserted, false);
});
