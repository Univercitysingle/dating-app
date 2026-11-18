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


test("partner-link list marks invitations as incoming only for the invitee", async () => {
  const now = new Date();
  const record = {
    _id: "partner-link-record",
    memberUids: ["partner-a", "partner-b"],
    inviterUid: "partner-a",
    inviteeUid: "partner-b",
    status: "pending",
    createdAt: now,
    updatedAt: now
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection: () => ({
      createIndex: async () => "index",
      find: query => ({
        sort: () => ({
          limit: () => ({
            toArray: async () => record.memberUids.includes(query.memberUids) ? [record] : []
          })
        })
      })
    })
  });

  const incoming = await connection.managePartnerLink("partner-b", "list");
  const outgoing = await connection.managePartnerLink("partner-a", "list");
  assert.equal(incoming.status, 200);
  assert.equal(incoming.body.links[0].isIncoming, true);
  assert.equal(outgoing.status, 200);
  assert.equal(outgoing.body.links.length, 1);
  assert.equal(outgoing.body.links[0].isIncoming, false);
});

test("only the invited member can accept a pending partner link", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId();
  const record = {
    _id: id,
    memberUids: ["partner-a", "partner-b"],
    inviterUid: "partner-a",
    inviteeUid: "partner-b",
    status: "pending"
  };
  let writes = 0;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection: () => ({
      createIndex: async () => "index",
      findOne: async () => record,
      updateOne: async () => { writes++; return { modifiedCount: 1 }; }
    })
  });

  const result = await connection.managePartnerLink("partner-a", "accept", { linkId: String(id) });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});

test("either linked member can revoke an active partner link and the active reservation is released", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId();
  const record = {
    _id: id,
    memberUids: ["partner-a", "partner-b"],
    inviterUid: "partner-a",
    inviteeUid: "partner-b",
    status: "accepted",
    activeKey: JSON.stringify(["partner-a", "partner-b"])
  };
  let updateFilter;
  let updateDocument;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection: () => ({
      createIndex: async () => "index",
      findOne: async query => query.memberUids === "partner-a" ? record : null,
      updateOne: async (filter, update) => {
        updateFilter = filter;
        updateDocument = update;
        return { modifiedCount: 1 };
      }
    })
  });

  const result = await connection.managePartnerLink("partner-a", "revoke", { linkId: String(id) });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "revoked");
  assert.equal(updateFilter.memberUids, "partner-a");
  assert.equal(updateFilter.status, "accepted");
  assert.equal(updateDocument.$set.status, "revoked");
  assert.equal(updateDocument.$set.revokedByUid, "partner-a");
  assert.ok(updateDocument.$set.revokedAt instanceof Date);
  assert.deepEqual(updateDocument.$unset, { activeKey: "" });
});

test("duplicate partner-link invitations are rejected without inserting another record", async () => {
  const now = new Date();
  const adult = uid => ({
    uid,
    birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()),
    accountStatus: "active",
    relationshipPreferences: { boundaries: [] },
    blocked: []
  });
  const existing = {
    memberUids: ["partner-a", "partner-b"],
    inviterUid: "partner-b",
    inviteeUid: "partner-a",
    status: "pending",
    activeKey: JSON.stringify(["partner-a", "partner-b"])
  };
  let inserts = 0;
  const links = {
    createIndex: async () => "index",
    findOne: async query => query.activeKey?.$exists ? existing : null,
    insertOne: async () => { inserts++; return { insertedId: "unexpected" }; }
  };
  const users = [adult("partner-a"), adult("partner-b")];
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => name === "users"
    ? { findOne: async ({ uid }) => users.find(user => user.uid === uid) || null }
    : links
  });

  const result = await connection.managePartnerLink("partner-a", "invite", { targetUid: "partner-b" });
  assert.equal(result.status, 409);
  assert.equal(inserts, 0);
});

