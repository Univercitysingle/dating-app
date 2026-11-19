import assert from "node:assert/strict";
import test from "node:test";
import { MongoDBConnection, getMongoPoolSize } from "./mongodb-connection.js";
import Worker, { getMongoShardName } from "./index.js";

test("chat message edits and deletes enforce sender ownership and preserve audited soft-delete history", async () => {
  const { ObjectId } = await import("mongodb");
  const actorId = new ObjectId();
  const messageId = new ObjectId();
  const audit = [];
  let stored = {
    _id: messageId, senderUid: "chat-owner", receiverUid: "chat-peer",
    roomId: "chat-room", messageContent: "Original", timestamp: new Date()
  };
  const db = {
    collection(name) {
      if (name === "users") return { findOne: async () => ({ role: "user", _id: actorId }) };
      if (name === "chatmessages") return {
        findOne: async () => stored,
        updateOne: async (_query, update) => { stored = { ...stored, ...update.$set }; return { matchedCount: 1 }; }
      };
      if (name === "auditlogs") return { insertOne: async entry => { audit.push(entry); return { insertedId: new ObjectId() }; } };
      if (name === "matches") return { findOne: async () => null };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const edited = await connection.updateChatMessage("chat-owner", messageId.toHexString(), { messageContent: "Updated" });
  assert.equal(edited.status, 200);
  assert.equal(stored.messageContent, "Updated");
  assert.ok(stored.editedAt instanceof Date);
  assert.equal(audit[0].eventType, "chat_message_edited");
  assert.equal(audit[0].previousMessage, "Original");

  const deleted = await connection.deleteChatMessage("chat-owner", messageId.toHexString());
  assert.equal(deleted.status, 200);
  assert.equal(stored.messageContent, "This message was deleted.");
  assert.ok(stored.deletedAt instanceof Date);
  assert.equal(audit[1].eventType, "chat_message_deleted");
  assert.equal(audit[1].previousMessage, "Updated");
});

test("users cannot edit or delete chat messages after unmatching", async () => {
  const { ObjectId } = await import("mongodb");
  const messageId = new ObjectId();
  const audit = [];
  let writes = 0;
  const stored = {
    _id: messageId, senderUid: "chat-owner", receiverUid: "chat-peer",
    roomId: "chat-room", messageContent: "Original", timestamp: new Date()
  };
  const db = {
    collection(name) {
      if (name === "users") return {
        findOne: async ({ uid }) => ({ uid, role: "user", blocked: [] })
      };
      if (name === "chatmessages") return {
        findOne: async () => stored,
        updateOne: async () => { writes++; return { matchedCount: 1 }; }
      };
      if (name === "matches") return {
        findOne: async () => ({ status: "unmatched" })
      };
      if (name === "auditlogs") return {
        insertOne: async entry => { audit.push(entry); return { insertedId: new ObjectId() }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const edited = await connection.updateChatMessage("chat-owner", messageId.toHexString(), { messageContent: "Changed" });
  const deleted = await connection.deleteChatMessage("chat-owner", messageId.toHexString());

  assert.equal(edited.status, 403);
  assert.equal(deleted.status, 403);
  assert.equal(writes, 0);
  assert.equal(audit.length, 0);
});

test("admins retain audited moderation access to messages after unmatching", async () => {
  const { ObjectId } = await import("mongodb");
  const messageId = new ObjectId();
  const audit = [];
  let stored = {
    _id: messageId, senderUid: "chat-owner", receiverUid: "chat-peer",
    roomId: "chat-room", messageContent: "Original", timestamp: new Date()
  };
  const db = {
    collection(name) {
      if (name === "users") return { findOne: async () => ({ role: "admin", blocked: [] }) };
      if (name === "chatmessages") return {
        findOne: async () => stored,
        updateOne: async (_query, update) => { stored = { ...stored, ...update.$set }; return { matchedCount: 1 }; }
      };
      if (name === "matches") return { findOne: async () => ({ status: "unmatched" }) };
      if (name === "auditlogs") return {
        insertOne: async entry => { audit.push(entry); return { insertedId: new ObjectId() }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const edited = await connection.updateChatMessage("moderator", messageId.toHexString(), { messageContent: "Moderated" });
  assert.equal(edited.status, 200);
  assert.equal(stored.messageContent, "Moderated");
  assert.equal(audit[0].actorType, "admin");
});

test("chat message edits reject attempts to modify another participant's message", async () => {
  const { ObjectId } = await import("mongodb");
  const messageId = new ObjectId();
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "users") return { findOne: async () => ({ role: "user" }) };
      if (name === "chatmessages") return { findOne: async () => ({
        _id: messageId, senderUid: "another-user", messageContent: "Protected",
        timestamp: new Date(), roomId: "room"
      }) };
      if (name === "auditlogs") return { insertOne: async () => assert.fail("Unauthorized edit must not be audited as a change") };
      assert.fail("Unexpected collection: " + name);
    }
  });
  const result = await connection.updateChatMessage("requesting-user", messageId.toHexString(), { messageContent: "Tampered" });
  assert.equal(result.status, 403);
});

test("support ticket message edits and deletes are audited soft operations", async () => {
  const { ObjectId } = await import("mongodb");
  const actorId = new ObjectId();
  const ticketId = new ObjectId();
  const messageId = new ObjectId();
  const audit = [];
  let stored = {
    _id: messageId, ticketId, senderId: actorId, message: "Customer original",
    createdAt: new Date(), isFromAdmin: false
  };
  const db = {
    collection(name) {
      if (name === "users") return { findOne: async () => ({ _id: actorId }) };
      if (name === "supporttickets") return {
        findOne: async () => ({ _id: ticketId, userId: actorId }),
        updateOne: async () => ({ matchedCount: 1 })
      };
      if (name === "ticketmessages") return {
        findOne: async () => stored,
        updateOne: async (_query, update) => { stored = { ...stored, ...update.$set }; if (update.$unset) delete stored.attachments; return { matchedCount: 1 }; }
      };
      if (name === "auditlogs") return { insertOne: async entry => { audit.push(entry); return { insertedId: new ObjectId() }; } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const edited = await connection.updateSupportTicketMessage("customer-uid", ticketId.toHexString(), messageId.toHexString(), { message: "Customer updated" });
  assert.equal(edited.status, 200);
  assert.equal(stored.message, "Customer updated");
  assert.equal(audit[0].eventType, "support_ticket_message_edited");

  stored.attachments = [{ key: "private-attachment" }];
  const deleted = await connection.deleteSupportTicketMessage("customer-uid", ticketId.toHexString(), messageId.toHexString());
  assert.equal(deleted.status, 200);
  assert.equal(stored.message, "This message was deleted.");
  assert.ok(stored.deletedAt instanceof Date);
  assert.equal(stored.attachments, undefined);
  assert.equal(audit[1].eventType, "support_ticket_message_deleted");
});

test("support ticket message admin moderation requires an administrator role", async () => {
  const connection = Object.create(MongoDBConnection.prototype);
  let databaseAccessed = false;
  connection.requireAdmin = async () => ({ status: 403, body: { message: "Forbidden" } });
  connection.getClient = async () => { databaseAccessed = true; return {}; };
  const result = await connection.deleteSupportTicketMessage(
    "ordinary-user", "507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", true
  );
  assert.equal(result.status, 403);
  assert.equal(databaseAccessed, false);
});

test("discovery applies selected gender, reciprocal preferences, and looking-for filters", async () => {
  let capturedMatch;
  const users = {
    findOne: async ({ uid }) => ({
      uid,
      gender: "Male",
      preference: "Female",
      blocked: [],
      location: { coordinates: [0, 0] }
    }),
    aggregate: (pipeline) => {
      capturedMatch = pipeline[0].$match;
      return { toArray: async () => [] };
    }
  };
  const matches = { createIndex: async () => "index-created" };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      assert.fail(`Unexpected collection: ${name}`);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers("current-user", { lookingFor: "Casual (FWB)" });

  assert.equal(result.status, 200);
  assert.equal(capturedMatch.gender, "Female");
  assert.deepEqual(capturedMatch.$and, [{
    $or: [
      { preference: { $in: ["everyone", "Everyone", "Male"] } },
      { preference: { $exists: false } },
      { preference: null }
    ]
  }]);
  assert.equal(capturedMatch["lifestyle.lookingFor"], "Casual (FWB)");
});

test("Discover honours the active Show me filter over the saved profile preference", async () => {
  let capturedMatch;
  const users = {
    findOne: async ({ uid }) => ({
      uid,
      gender: "Female",
      preference: "Female",
      blocked: [],
      location: { coordinates: [0, 0] }
    }),
    aggregate: (pipeline) => {
      capturedMatch = pipeline[0].$match;
      return { toArray: async () => [] };
    }
  };
  const matches = { createIndex: async () => "index-created" };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      assert.fail(`Unexpected collection: ${name}`);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers("current-user", { preference: "Male" });

  assert.equal(result.status, 200);
  assert.equal(capturedMatch.gender, "Male");
  assert.deepEqual(capturedMatch.$and, [{
    $or: [
      { preference: { $in: ["everyone", "Everyone", "Female"] } },
      { preference: { $exists: false } },
      { preference: null }
    ]
  }]);
});

test("Discover rejects unsupported gender preference filter values", async () => {
  let databaseAccessed = false;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => {
    databaseAccessed = true;
    throw new Error("Database should not be accessed");
  };

  const result = await connection.discoverUsers("current-user", { preference: { $ne: "Female" } });

  assert.equal(result.status, 400);
  assert.equal(databaseAccessed, false);
});

test("discovery supports the Other gender preference", async () => {
  let capturedMatch;
  const users = {
    findOne: async ({ uid }) => ({
      uid,
      gender: "Other",
      preference: "Other",
      blocked: [],
      location: { coordinates: [0, 0] }
    }),
    aggregate: (pipeline) => {
      capturedMatch = pipeline[0].$match;
      return { toArray: async () => [] };
    }
  };
  const matches = { createIndex: async () => "index-created" };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      assert.fail(`Unexpected collection: ${name}`);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers("current-user", {});

  assert.equal(result.status, 200);
  assert.equal(capturedMatch.gender, "Other");
  assert.deepEqual(capturedMatch.$and[0].$or[0], {
    preference: { $in: ["everyone", "Everyone", "Other"] }
  });
});

test("discovery combines boosted and regular candidates with safe array defaults", async () => {
  let capturedPipeline;
  const users = {
    findOne: async ({ uid }) => ({ uid, blocked: ["blocked-user"], location: { coordinates: [0, 0] } }),
    aggregate: (pipeline) => {
      capturedPipeline = pipeline;
      return { toArray: async () => [] };
    }
  };
  const matches = {
    createIndex: async () => "index-created"
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      assert.fail(`Unexpected collection: ${name}`);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers("current-user", {});

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, []);
  assert.deepEqual(capturedPipeline[0].$match.uid, {
    $type: "string",
    $ne: "current-user",
    $nin: ["blocked-user"]
  });
  const project = capturedPipeline.find((stage) => stage.$project?.combinedUsers).$project.combinedUsers;
  const combined = project.$concatArrays;
  assert.deepEqual(combined[0], { $ifNull: ["$boostedUsers", []] });
  assert.deepEqual(combined[1].$slice[0], { $ifNull: ["$regularUsers", []] });
  assert.deepEqual(combined[1].$slice[1], {
    $max: [0, {
      $subtract: [100, { $size: { $ifNull: ["$boostedUsers", []] } }]
    }]
  });
  assert.doesNotMatch(JSON.stringify(project), /"\$in"/);
});

test("Discover responses expose only sanitized public profile fields", async () => {
  const candidate = {
    uid: "candidate-user",
    name: "Candidate",
    email: "private@example.com",
    email_address: "private-alias@example.com",
    mobileNumber: "+971500000000",
    phone_number: "+971500000001",
    whatsappNumber: "+971500000002",
    password: "never-return",
    lastLoginIp: "203.0.113.20",
    birthday: new Date("1995-06-01T00:00:00.000Z"),
    role: "user",
    blocked: ["someone"],
    location: { city: "Abu Dhabi", country: "UAE", coordinates: [54.37, 24.45] },
    profilePrompts: [{ question: "About me", answer: "Public answer", email: "hidden@example.com" }],
    bio: "Public biography"
  };
  const users = {
    async findOne({ uid }) {
      return uid === "current-user" ? { uid, blocked: [], preference: "everyone" } : null;
    },
    aggregate() {
      return { toArray: async () => [{ uid: "candidate-user" }] };
    },
    find() {
      return { toArray: async () => [candidate] };
    }
  };
  const matches = {
    async createIndex() { return "index-created"; },
    find() {
      return { project() { return this; }, toArray: async () => [] };
    }
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      assert.fail(`Unexpected collection: ${name}`);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers("current-user", {});

  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  const profile = result.body[0];
  for (const field of [
    "email", "email_address", "mobileNumber", "phone_number", "whatsappNumber",
    "password", "lastLoginIp", "birthday", "role", "blocked"
  ]) {
    assert.equal(Object.hasOwn(profile, field), false, field + " must not be exposed in Discover");
  }
  assert.deepEqual(profile.location, { city: "Abu Dhabi", country: "UAE" });
  assert.deepEqual(profile.profilePrompts, [{ question: "About me", answer: "Public answer" }]);
  assert.equal(profile.bio, "Public biography");
});

test("Likes responses expose only sanitized public profile fields", async () => {
  const likedUser = {
    uid: "liked-user",
    name: "Liked Profile",
    email: "private@example.com",
    email_address: "private-alias@example.com",
    mobileNumber: "+971500000000",
    phone_number: "+971500000001",
    whatsappNumber: "+971500000002",
    password: "never-return",
    lastLoginIp: "203.0.113.25",
    birthday: new Date("1995-06-01T00:00:00.000Z"),
    role: "user",
    blocked: ["someone"],
    location: { city: "Abu Dhabi", country: "UAE", coordinates: [54.37, 24.45] },
    bio: "Public biography",
    profilePrompts: [{ question: "About me", answer: "Public answer", email: "hidden@example.com" }],
    metadata: { internalFlag: true }
  };
  const users = {
    async findOne({ uid }) {
      return uid === "current-user" ? { uid, role: "user", plan: "premium" } : null;
    },
    find(query) {
      assert.deepEqual(query, { uid: { $in: ["liked-user"] } });
      return { async toArray() { return [likedUser]; } };
    }
  };
  const matches = {
    find(query) {
      assert.deepEqual(query, {
        $or: [{ user1Uid: "current-user" }, { user2Uid: "current-user" }],
        status: "pending"
      });
      return { async toArray() { return [{ user1Uid: "liked-user", user2Uid: "current-user", superLike: true }]; } };
    }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getLikes("current-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  const profile = result.body[0];
  for (const field of [
    "email", "email_address", "mobileNumber", "phone_number", "whatsappNumber",
    "password", "lastLoginIp", "birthday", "role", "blocked", "metadata"
  ]) {
    assert.equal(Object.hasOwn(profile, field), false, field + " must not be exposed in Likes");
  }
  assert.deepEqual(profile.location, { city: "Abu Dhabi", country: "UAE" });
  assert.deepEqual(profile.profilePrompts, [{ question: "About me", answer: "Public answer" }]);
  assert.equal(profile.bio, "Public biography");
  assert.equal(profile.likeType, "superlike");
  assert.equal(profile.isBlurred, false);
});

test("Basic Likes responses contain no liker identity or profile media", async () => {
  const users = {
    async findOne({ uid }) {
      return uid === "current-user" ? { uid, role: "user", plan: "basic", blocked: [] } : null;
    },
    find(query) {
      assert.deepEqual(query, { uid: { $in: ["liked-user"] } });
      return { async toArray() {
        return [{
          uid: "liked-user", name: "Private Name", bio: "Private bio",
          photos: [{ url: "photos-liked-user-secret.webp" }], blocked: []
        }];
      } };
    }
  };
  const matches = {
    find(query) {
      assert.deepEqual(query, {
        $or: [{ user1Uid: "current-user" }, { user2Uid: "current-user" }],
        status: "pending"
      });
      return { async toArray() {
        return [{
          _id: "507f1f77bcf86cd799439011",
          user1Uid: "liked-user",
          user2Uid: "current-user",
          likedBy: ["liked-user"],
          status: "pending"
        }];
      } };
    }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getLikes("current-user");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [{
    likeId: "507f1f77bcf86cd799439011",
    likeType: "like",
    isBlurred: true
  }]);
});

test("Likes finds incoming likes when a legacy match stores canonical UID ordering", async () => {
  const likedUser = {
    uid: "liked-user",
    name: "Liked Profile",
    plan: "basic",
    photos: [],
    blocked: [],
    location: { city: "Abu Dhabi" }
  };
  const users = {
    async findOne({ uid }) {
      return uid === "current-user" ? { uid, role: "user", plan: "premium", blocked: [] } : null;
    },
    find(query) {
      assert.deepEqual(query, { uid: { $in: ["liked-user"] } });
      return { async toArray() { return [likedUser]; } };
    }
  };
  const matches = {
    find(query) {
      assert.deepEqual(query, {
        $or: [{ user1Uid: "current-user" }, { user2Uid: "current-user" }],
        status: "pending"
      });
      return { async toArray() {
        return [{
          user1Uid: "current-user",
          user2Uid: "liked-user",
          likedBy: ["liked-user"],
          status: "pending",
          superLike: false
        }];
      } };
    }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getLikes("current-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].uid, "liked-user");
  assert.equal(result.body[0].likeType, "like");
  assert.equal(result.body[0].isBlurred, false);
});

test("superadmin Likes retains contact fields without exposing unrestricted profile records", async () => {
  const likedUser = {
    uid: "liked-user",
    name: "Liked Profile",
    email: "private@example.com",
    mobileNumber: "+971500000000",
    password: "never-return",
    lastLoginIp: "203.0.113.25",
    role: "user",
    birthday: new Date("1995-06-01T00:00:00.000Z"),
    blocked: ["someone"],
    internalNotes: "must not leak",
    metadata: { internalFlag: true },
    location: { city: "Abu Dhabi", country: "UAE", coordinates: [54.37, 24.45] },
    bio: "Public biography"
  };
  const users = {
    async findOne({ uid }) {
      return uid === "current-user" ? { uid, role: "superadmin", plan: "basic" } : null;
    },
    find() {
      return { async toArray() { return [likedUser]; } };
    }
  };
  const matches = {
    find() {
      return { async toArray() { return [{ user1Uid: "liked-user", user2Uid: "current-user", status: "pending" }]; } };
    }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getLikes("current-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  const profile = result.body[0];
  assert.equal(profile.email, "private@example.com");
  assert.equal(profile.mobileNumber, "+971500000000");
  for (const field of ["password", "lastLoginIp", "role", "birthday", "blocked", "internalNotes", "metadata"]) {
    assert.equal(Object.hasOwn(profile, field), false, field + " must not be exposed in Likes");
  }
  assert.deepEqual(profile.location, { city: "Abu Dhabi", country: "UAE" });
});

test("confirmed Matches responses expose only sanitized public profile fields", async () => {
  const matchedUser = {
    uid: "matched-user",
    name: "Matched Profile",
    email: "private@example.com",
    mobileNumber: "+971500000000",
    password: "never-return",
    lastLoginIp: "203.0.113.25",
    birthday: new Date("1995-06-01T00:00:00.000Z"),
    role: "user",
    blocked: ["someone"],
    internalNotes: "must not leak",
    location: { city: "Abu Dhabi", country: "UAE", coordinates: [54.37, 24.45] },
    profilePrompts: [{ question: "About me", answer: "Public answer", email: "hidden@example.com" }],
    bio: "Public biography"
  };
  const users = {
    async findOne({ uid }) {
      return uid === "current-user" ? { uid, role: "user" } : null;
    },
    find(query) {
      assert.deepEqual(query, { uid: { $in: ["matched-user"] } });
      return { async toArray() { return [matchedUser]; } };
    }
  };
  const matches = {
    find(query) {
      assert.deepEqual(query, {
        $or: [{ user1Uid: "current-user" }, { user2Uid: "current-user" }],
        status: "matched"
      });
      return { async toArray() { return [{ user1Uid: "current-user", user2Uid: "matched-user" }]; } };
    }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getConfirmedMatches("current-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  const profile = result.body[0];
  for (const field of [
    "email", "mobileNumber", "password", "lastLoginIp", "birthday",
    "role", "blocked", "internalNotes"
  ]) {
    assert.equal(Object.hasOwn(profile, field), false, field + " must not be exposed in Matches");
  }
  assert.deepEqual(profile.location, { city: "Abu Dhabi", country: "UAE" });
  assert.deepEqual(profile.profilePrompts, [{ question: "About me", answer: "Public answer" }]);
  assert.equal(profile.bio, "Public biography");
});

test("unmatched pairs cannot read history or typing presence while legacy chats remain supported", async () => {
  const roomId = "alice-bob";
  let typingAccessed = false;
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne({ uid }) {
          if (uid === "alice") return { uid, role: "user", blocked: [] };
          if (uid === "bob") return { uid, blocked: [] };
          return null;
        }
      };
      if (name === "chatmessages") return {
        async findOne() { return { senderUid: "alice", receiverUid: "bob" }; },
        find() { assert.fail("Unmatched history must not be queried"); }
      };
      if (name === "matches") return {
        async findOne(filter) {
          assert.deepEqual(filter.$or, [
            { user1Uid: "alice", user2Uid: "bob" },
            { user1Uid: "bob", user2Uid: "alice" }
          ]);
          return { status: "unmatched" };
        }
      };
      if (name === "chatTyping") return {
        async findOne() { typingAccessed = true; return null; },
        async updateOne() { typingAccessed = true; return { modifiedCount: 1 }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const history = await connection.getChatHistory("alice", roomId);
  const typingRead = await connection.getTypingStatus("alice", roomId);
  const typingWrite = await connection.updateTypingStatus("alice", { roomId, isTyping: true });

  assert.equal(history.status, 403);
  assert.equal(typingRead.status, 403);
  assert.equal(typingWrite.status, 403);
  assert.equal(typingAccessed, false, "typing presence must not be read or written after unmatch");
});

test("chat history is denied when either participant has blocked the other", async () => {
  for (const blockedBy of ["current-user", "other-user"]) {
    const users = {
      async findOne({ uid }) {
        if (uid === "current-user") return { uid, role: "user", blocked: blockedBy === uid ? ["other-user"] : [] };
        if (uid === "other-user") return { uid, blocked: blockedBy === uid ? ["current-user"] : [] };
        return null;
      }
    };
    const chatmessages = {
      async findOne() { return { senderUid: "current-user", receiverUid: "other-user" }; },
      find() { assert.fail("Blocked chat history must not be queried"); }
    };
    const db = { collection(name) { return name === "users" ? users : chatmessages; } };
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({});
    connection.getDatabase = () => db;
    const result = await connection.getChatHistory("current-user", "current-user-other-user");
    assert.equal(result.status, 403);
    assert.match(result.body.error, /unavailable/i);
  }
});


test("chat history responses expose only approved message fields", async () => {
  const message = {
    _id: { toHexString: () => "6729a0000000000000000001" },
    roomId: "current-user-other-user",
    senderUid: "current-user",
    receiverUid: "other-user",
    messageContent: "Hello",
    timestamp: new Date("2026-11-04T06:00:00.000Z"),
    status: "sent",
    clientMessageId: "6729a000-0000-4000-8000-000000000001",
    email: "private@example.com",
    mobileNumber: "+971500000000",
    internalNotes: "must not leak",
    moderationFlags: ["internal"],
    ipAddress: "203.0.113.10",
    paymentReference: "private-payment-id"
  };
  const users = {
    async findOne({ uid }) {
      if (uid === "current-user") return { uid, role: "user", blocked: [] };
      if (uid === "other-user") return { uid, blocked: [] };
      return null;
    }
  };
  const chatmessages = {
    async findOne() { return { senderUid: "current-user", receiverUid: "other-user" }; },
    find() {
      return {
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        maxTimeMS() { return this; },
        async toArray() { return [message]; }
      };
    }
  };
  const db = { collection(name) { return name === "users" ? users : chatmessages; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getChatHistory("current-user", "current-user-other-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.messages.length, 1);
  const returned = result.body.messages[0];
  assert.deepEqual(Object.keys(returned).sort(), [
    "_id", "clientMessageId", "messageContent", "receiverUid", "roomId",
    "senderUid", "status", "timestamp"
  ].sort());
  assert.equal(returned._id, "6729a0000000000000000001");
  assert.equal(returned.messageContent, "Hello");
});

test("chat history incremental cursor uses stable timestamp and ObjectId ordering", async () => {
  const cursorTimestamp = new Date("2026-11-04T06:00:00.000Z");
  const cursorId = "6729a0000000000000000001";
  let capturedQuery;
  let capturedSort;
  let capturedLimit;
  const users = {
    async findOne({ uid }) {
      if (uid === "current-user") return { uid, role: "user", blocked: [] };
      if (uid === "other-user") return { uid, blocked: [] };
      return null;
    }
  };
  const chatmessages = {
    async findOne() { return { senderUid: "current-user", receiverUid: "other-user" }; },
    find(query) {
      capturedQuery = query;
      return {
        sort(value) { capturedSort = value; return this; },
        limit(value) { capturedLimit = value; return this; },
        maxTimeMS(value) { assert.equal(value, 10000); return this; },
        async toArray() { return []; }
      };
    }
  };
  const db = { collection(name) { return name === "users" ? users : chatmessages; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.getChatHistory(
    "current-user",
    "current-user-other-user",
    100,
    0,
    { timestamp: cursorTimestamp.toISOString(), id: cursorId }
  );
  assert.equal(result.status, 200);
  assert.deepEqual(capturedSort, { timestamp: 1, _id: 1 });
  assert.equal(capturedLimit, 100);
  assert.deepEqual(capturedQuery.$and[0], {
    $or: [{ senderUid: "current-user" }, { receiverUid: "current-user" }]
  });
  const cursorFilter = capturedQuery.$and[1].$or;
  assert.equal(cursorFilter[0].timestamp.$gt.getTime(), cursorTimestamp.getTime());
  assert.equal(cursorFilter[1].timestamp.getTime(), cursorTimestamp.getTime());
  assert.equal(cursorFilter[1]._id.$gt.toString(), cursorId);
});

test("chat history older-page cursor uses stable reverse timestamp and ObjectId ordering", async () => {
  const cursorTimestamp = new Date("2026-11-04T06:00:00.000Z");
  const cursorId = "6729a0000000000000000001";
  let capturedQuery;
  let capturedSort;
  let capturedLimit;
  const users = {
    async findOne({ uid }) {
      if (uid === "current-user") return { uid, role: "user", blocked: [] };
      if (uid === "other-user") return { uid, blocked: [] };
      return null;
    }
  };
  const chatmessages = {
    async findOne() { return { senderUid: "current-user", receiverUid: "other-user" }; },
    find(query) {
      capturedQuery = query;
      return {
        sort(value) { capturedSort = value; return this; },
        limit(value) { capturedLimit = value; return this; },
        maxTimeMS(value) { assert.equal(value, 10000); return this; },
        async toArray() { return []; }
      };
    }
  };
  const db = { collection(name) { return name === "users" ? users : chatmessages; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.getChatHistory(
    "current-user",
    "current-user-other-user",
    50,
    0,
    null,
    { timestamp: cursorTimestamp.toISOString(), id: cursorId }
  );
  assert.equal(result.status, 200);
  assert.deepEqual(capturedSort, { timestamp: -1, _id: -1 });
  assert.equal(capturedLimit, 50);
  assert.deepEqual(capturedQuery.$and[0], {
    $or: [{ senderUid: "current-user" }, { receiverUid: "current-user" }]
  });
  const cursorFilter = capturedQuery.$and[1].$or;
  assert.equal(cursorFilter[0].timestamp.$lt.getTime(), cursorTimestamp.getTime());
  assert.equal(cursorFilter[1].timestamp.getTime(), cursorTimestamp.getTime());
  assert.equal(cursorFilter[1]._id.$lt.toString(), cursorId);
});

test("chat history serializes BSON ObjectIds as plain cursor strings", async () => {
  const objectId = { toHexString: () => "6729a0000000000000000001" };
  const users = {
    async findOne({ uid }) {
      if (uid === "current-user") return { uid, role: "user", blocked: [] };
      if (uid === "other-user") return { uid, blocked: [] };
      return null;
    }
  };
  const chatmessages = {
    async findOne() { return { senderUid: "current-user", receiverUid: "other-user" }; },
    find() {
      return {
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        maxTimeMS() { return this; },
        async toArray() {
          return [{ _id: objectId, roomId: "current-user-other-user", timestamp: new Date() }];
        }
      };
    }
  };
  const db = { collection(name) { return name === "users" ? users : chatmessages; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.getChatHistory("current-user", "current-user-other-user", 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.messages[0]._id, "6729a0000000000000000001");
});

test("chat history rejects malformed incremental cursors before database access", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => { assert.fail("Invalid cursors must not access MongoDB"); };
  const result = await connection.getChatHistory(
    "current-user",
    "current-user-other-user",
    50,
    0,
    { timestamp: new Date("invalid"), id: "not-an-object-id" }
  );
  assert.equal(result.status, 400);
});



test("pending WebXPay subscriptions avoid null collisions with legacy Stripe and PayHere unique indexes", async () => {
  const order = [];
  const user = { _id: "user-object-id", uid: "user-1", name: "Test User" };
  let insertedSubscription;
  const subscriptions = {
    async updateMany(filter, update) {
      order.push("expire-stale");
      assert.equal(filter.status, "pending");
      assert.equal(update.$set.cancellationReason, "payment_timeout");
      return { modifiedCount: 0 };
    },
    async findOne(filter) {
      if (filter.status === "active") order.push("check-active");
      else if (filter.status === "pending") order.push("check-pending");
      return null;
    },
    async insertOne(doc) {
      order.push("insert");
      insertedSubscription = doc;
      assert.equal(doc.status, "pending");
      return { insertedId: "subscription-id" };
    }
  };
  const users = {
    async findOne() { order.push("find-user"); return user; },
    async updateOne(filter, update) {
      order.push("reserve-checkout");
      assert.equal(filter._id, user._id);
      assert.ok(Array.isArray(filter.$or));
      assert.ok(update.$set.pendingSubscriptionCheckout.reservationId);
      user.pendingSubscriptionCheckout = update.$set.pendingSubscriptionCheckout;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const db = { collection(name) { return name === "users" ? users : subscriptions; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  connection.ensureSubscriptionIndexes = async () => { assert.fail("Request-time subscription creation must not require index permissions"); };
  const result = await connection.createPendingSubscription("user-1", "monthly");
  assert.equal(result.status, 201);
  assert.deepEqual(order, ["find-user", "expire-stale", "check-active", "check-pending", "reserve-checkout", "insert"]);
  assert.ok(insertedSubscription.checkoutReservationId);
  assert.equal(user.pendingSubscriptionCheckout.reservationId, insertedSubscription.checkoutReservationId);
  assert.match(insertedSubscription.stripeSubscriptionId, /^webxpay-pending-[0-9a-f-]{36}$/);
  assert.match(insertedSubscription.payhereSubscriptionId, /^webxpay-pending-[0-9a-f-]{36}$/);
  assert.notEqual(insertedSubscription.stripeSubscriptionId, insertedSubscription.payhereSubscriptionId);
});


test("profile photo URLs always use CDN_HOSTNAME, including legacy frontend media URLs", () => {
  const connection = new MongoDBConnection({}, {
    FRONTEND_URL: "https://dating-app-staging.pages.dev",
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/"
  });
  const key = "photos-user-1234567890123.webp";
  assert.equal(connection.getMediaUrl(key), "https://dateme.enadoctemp.workers.dev/" + key);
  assert.equal(
    connection.getMediaUrl("https://dating-app-staging.pages.dev/api/media/" + key),
    "https://dateme.enadoctemp.workers.dev/" + key
  );
  assert.equal(
    connection.getMediaUrl("https://dateme.enadoctemp.workers.dev/" + key),
    "https://dateme.enadoctemp.workers.dev/" + key
  );
});


test("public profile responses remove all contact aliases and nested contact fields", async () => {
  const storedUser = {
    uid: "target-user",
    name: "Profile Owner",
    email: "owner@example.com",
    email_address: "owner-alt@example.com",
    mobileNumber: "+971500000001",
    phone_number: "+971500000002",
    whatsappNumber: "+971500000003",
    contactDetails: { email: "nested@example.com", mobile: "+971500000004", label: "private" },
    metadata: { account: { email_address: "deep@example.com", visibleLabel: "kept" } },
    birthday: new Date("1990-04-15T00:00:00.000Z"),
    role: "user",
    blocked: ["another-user"],
    password: "must-not-leak",
    lastLoginIp: "203.0.113.10",
    location: { city: "Abu Dhabi", country: "UAE", coordinates: [54.37, 24.45] },
    lifestyle: { drinking: "never", privateNote: "must-not-leak" },
    profilePrompts: [{ question: "About me", answer: "I enjoy hiking", email: "nested-prompt@example.com", mobileNumber: "+971500000005" }],
    education: { school: "Example University", contact: { email_address: "nested-education@example.com", phone_number: "+971500000006", password_hash: "must-not-leak", last_login_ip: "203.0.113.11" }, coordinates: [54.37, 24.45] },
    bio: "Public biography"
  };
  const users = {
    async findOne(query) {
      if (query.uid === "target-user") return { ...storedUser, contactDetails: { ...storedUser.contactDetails } };
      if (query.uid === "ordinary-viewer") return { uid: query.uid, role: "user" };
      if (query.uid === "admin-viewer") return { uid: query.uid, role: "superadmin" };
      return null;
    }
  };
  const db = { collection(name) { assert.equal(name, "users"); return users; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const ordinary = await connection.getUserProfile("target-user", "ordinary-viewer");
  assert.equal(ordinary.status, 200);
  for (const field of ["email", "email_address", "mobileNumber", "phone_number", "whatsappNumber"]) {
    assert.equal(Object.hasOwn(ordinary.body, field), false, field + " must not be exposed");
  }
  assert.equal(Object.hasOwn(ordinary.body, "contactDetails"), false, "nested contact container must not be exposed");
  assert.equal(Object.hasOwn(ordinary.body, "metadata"), false, "arbitrary metadata must not be exposed");
  for (const field of ["birthday", "role", "blocked", "password", "lastLoginIp"]) {
    assert.equal(Object.hasOwn(ordinary.body, field), false, field + " must not be exposed");
  }
  assert.deepEqual(ordinary.body.location, { city: "Abu Dhabi", country: "UAE" }, "exact coordinates must not be exposed");
  assert.deepEqual(ordinary.body.lifestyle, { drinking: "never" }, "unknown nested fields must not be exposed");
  assert.deepEqual(ordinary.body.profilePrompts, [{ question: "About me", answer: "I enjoy hiking" }], "nested contact fields in public profile prompts must not be exposed");
  assert.deepEqual(ordinary.body.education, { school: "Example University", contact: {} }, "nested contact fields and exact coordinates in public fields must not be exposed");
  assert.equal(ordinary.body.bio, "Public biography");

  const owner = await connection.getUserProfile("target-user", "target-user");
  assert.equal(owner.status, 200);
  assert.equal(owner.body.email, "owner@example.com");

  const superadmin = await connection.getUserProfile("target-user", "admin-viewer");
  assert.equal(superadmin.status, 200);
  assert.equal(superadmin.body.email, "owner@example.com");
  assert.equal(superadmin.body.mobileNumber, "+971500000001");
});

test("generated photo URLs from legacy hosts are normalized to CDN_HOSTNAME", () => {
  const connection = new MongoDBConnection({}, {
    FRONTEND_URL: "https://dating-app-staging.pages.dev",
    CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/"
  });
  const key = "photos-user-1234567890123.webp";
  assert.equal(
    connection.getMediaUrl("https://legacy.example.test/photos/" + key),
    "https://dateme.enadoctemp.workers.dev/" + key
  );
});


test("subscription history expires abandoned pending WebXPay checkouts after 30 minutes", async () => {
  let expiryFilter;
  let expiryUpdate;
  const now = new Date();
  const history = [{ _id: "old-pending", plan: "weekly", status: "cancelled" }];
  const subscriptions = {
    async updateMany(filter, update) {
      expiryFilter = filter;
      expiryUpdate = update;
      return { modifiedCount: 1 };
    },
    find(filter) {
      assert.deepEqual(filter, { userId: "user-object-id" });
      return {
        sort(sortBy) {
          assert.deepEqual(sortBy, { createdAt: -1 });
          return {
            limit(limit) {
              assert.equal(limit, 10);
              return { toArray: async () => history };
            }
          };
        }
      };
    }
  };
  const users = { async findOne(filter) {
    assert.deepEqual(filter, { uid: "user-1" });
    return { _id: "user-object-id" };
  } };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "subscriptions") return subscriptions;
    assert.fail(`Unexpected collection: ${name}`);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getSubscriptionHistory("user-1");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, history);
  assert.equal(expiryFilter.userId, "user-object-id");
  assert.equal(expiryFilter.status, "pending");
  assert.ok(expiryFilter.createdAt.$lt instanceof Date);
  assert.ok(Math.abs((now.getTime() - expiryFilter.createdAt.$lt.getTime()) - 30 * 60 * 1000) < 1000);
  assert.deepEqual(expiryUpdate.$set.status, "cancelled");
  assert.equal(expiryUpdate.$set.cancellationReason, "payment_timeout");
  assert.ok(expiryUpdate.$set.updatedAt instanceof Date);
});

test("profile updates cannot bypass photo upload controls or self-assign verification badges", async () => {
  let capturedUpdate;
  const storedUser = {
    uid: "user-1",
    name: "Test User",
    isOnboardingComplete: true,
    photos: [{ url: "photos-user-1-1234567890123.jpg", order: 0 }],
    badges: { verified: false, premium: false }
  };
  const users = {
    async findOne(query) {
      assert.equal(query.uid, "user-1");
      return { ...storedUser };
    },
    async updateOne(query, update) {
      assert.deepEqual(query, { uid: "user-1" });
      capturedUpdate = update;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const db = { collection(name) { assert.equal(name, "users"); return users; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.updateCurrentUserProfile("user-1", {
    bio: "Updated bio",
    familyStatus: "Single",
    siblings: "One sibling",
    photos: [{ url: "https://attacker.example/impersonation.jpg", order: 0 }],
    badges: { verified: true, premium: true }
  });

  assert.ok(capturedUpdate, "profile update should reach the database");
  assert.equal(capturedUpdate.$set.bio, "Updated bio");
  assert.equal(capturedUpdate.$set.familyStatus, "Single");
  assert.equal(capturedUpdate.$set.siblings, "One sibling");
  assert.equal(Object.hasOwn(capturedUpdate.$set, "photos"), false, "photos must only change through the validated photo endpoints");
  assert.equal(Object.hasOwn(capturedUpdate.$set, "badges"), false, "users must not grant themselves verification or premium badges");
});



test("report creation rejects duplicate reporter-target submissions and prioritizes independent reports", async () => {
  const existingReports = [];
  const inserted = [];
  const reports = {
    async findOne(query) {
      return existingReports.find(report =>
        report.reporterUid === query.reporterUid &&
        report.reportedUserUid === query.reportedUserUid &&
        report.createdAt >= query.createdAt.$gte
      ) || null;
    },
    async insertOne(doc) {
      const stored = { ...doc, _id: { toString: () => "report-id-" + inserted.length } };
      existingReports.push(stored);
      inserted.push(stored);
      return { insertedId: stored._id };
    },
    async distinct(field, query) {
      return [...new Set(existingReports
        .filter(report => report.reportedUserUid === query.reportedUserUid &&
          report.createdAt >= query.createdAt.$gte && report.status === query.status)
        .map(report => report[field]))];
    },
    async updateOne(filter, update) {
      const report = existingReports.find(item => item._id === filter._id);
      if (report) Object.assign(report, update.$set);
      return { matchedCount: report ? 1 : 0 };
    }
  };
  const users = {
    async findOne(query) {
      return query.uid === "missing" ? null : { _id: query.uid, uid: query.uid };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) { return name === "users" ? users : reports; } });

  const first = await connection.createReport("reporter-a", {
    reportedUserUid: "target", category: "spam", reason: "Repeated spam"
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.reviewPriority, "normal");
  const duplicate = await connection.createReport("reporter-a", {
    reportedUserUid: "target", category: "spam", reason: "Another report"
  });
  assert.equal(duplicate.status, 409);
  assert.equal(inserted.length, 1);

  const independent = await connection.createReport("reporter-b", {
    reportedUserUid: "target", category: "spam", reason: "I also observed spam"
  });
  assert.equal(independent.status, 201);
  assert.equal(independent.body.distinctReporterCount24h, 2);
  assert.equal(independent.body.reviewPriority, "normal");

  const third = await connection.createReport("reporter-c", {
    reportedUserUid: "target", category: "spam", reason: "More spam"
  });
  assert.equal(third.status, 201);
  assert.equal(third.body.distinctReporterCount24h, 3);
  assert.equal(third.body.reviewPriority, "high");
});

test("underage reports receive urgent review priority without automatically suspending the account", async () => {
  let userUpdateCalls = 0;
  const reports = {
    async findOne() { return null; },
    async insertOne(doc) { return { insertedId: { toString: () => "underage-report" }, doc }; },
    async distinct() { return ["reporter"]; },
    async updateOne() { return { matchedCount: 1 }; }
  };
  const users = { async findOne(query) { return { _id: query.uid, uid: query.uid }; }, async updateOne() { userUpdateCalls++; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) { return name === "users" ? users : reports; } });
  const result = await connection.createReport("reporter", {
    reportedUserUid: "target", category: "underage_user", reason: "Appears underage"
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.reviewPriority, "urgent");
  assert.equal(userUpdateCalls, 0, "report counts must not trigger automatic account punishment");
});

test("scheduled moderation expiry restores expired temporary suspensions but never permanent bans", async () => {
  const now = new Date("2026-10-25T12:00:00.000Z");
  const expired = {
    _id: "expired-user", accountStatus: "temporarily_suspended",
    suspendedUntil: new Date("2026-10-24T12:00:00.000Z"),
    profileVisibilityBeforeSuspension: false
  };
  const legacyExpired = {
    _id: "legacy-expired-user",
    suspendedUntil: new Date("2026-10-24T12:00:00.000Z")
  };
  const permanent = {
    _id: "banned-user", accountStatus: "permanently_banned",
    suspendedUntil: new Date("9999-12-31T00:00:00.000Z")
  };
  const updates = [];
  const users = {
    find() { return { sort() { return this; }, limit() { return this; }, async toArray() { return [expired, legacyExpired, permanent]; } }; },
    async updateOne(filter, update) { updates.push({ filter, update }); return { modifiedCount: 1 }; }
  };
  const subscriptions = {
    find() { return { sort() { return this; }, limit() { return this; }, async toArray() { return []; } }; },
    async updateOne() { return { modifiedCount: 0 }; },
    async findOne() { return null; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) { return name === "users" ? users : subscriptions; } });
  const result = await connection.runScheduledExpirations(now, "moderation");
  assert.equal(result.success, true);
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].filter, {
    _id: "expired-user", accountStatus: "temporarily_suspended", suspendedUntil: { $lte: now }
  });
  assert.deepEqual(updates[1].filter, {
    _id: "legacy-expired-user", accountStatus: { $exists: false }, suspendedUntil: { $lte: now }
  });
  assert.equal(updates[0].update.$set.accountStatus, "active");
  assert.equal(updates[0].update.$set.isProfileVisible, false);
  assert.equal(updates[1].update.$set.accountStatus, "active");
  assert.equal(Object.hasOwn(updates[0].update.$unset, "suspendedUntil"), true);
});


test("permanently banned users cannot swipe even when legacy data has no expiry date", async () => {
  const users = {
    async findOne(query) {
      return query.uid === "banned"
        ? { uid: "banned", accountStatus: "permanently_banned", blocked: [] }
        : { uid: query.uid, accountStatus: "active", blocked: [] };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) { assert.equal(name, "users"); return users; } });
  const result = await connection.recordSwipe("banned", "target", "like");
  assert.equal(result.status, 403);
  assert.match(result.body.error, /suspended or banned/i);
});

test("temporarily suspended users cannot change profile fields", async () => {
  let writes = 0;
  const users = {
    async findOne() {
      return {
        uid: "suspended", accountStatus: "temporarily_suspended",
        suspendedUntil: new Date(Date.now() + 60_000), isOnboardingComplete: true
      };
    },
    async updateOne() { writes++; return { matchedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) { assert.equal(name, "users"); return users; } });
  const result = await connection.updateCurrentUserProfile("suspended", { bio: "Changed while suspended" });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});


test("unmatching ends the active match without blocking either participant", async () => {
  let capturedFilter;
  let capturedUpdate;
  const matches = {
    async updateOne(filter, update) {
      capturedFilter = filter;
      capturedUpdate = update;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "matches") return matches;
    if (name === "chatmessages") return { async findOne() { return { roomId: "a-user-z-user" }; } };
    assert.fail("Unexpected collection: " + name);
  } });
  const result = await connection.unmatchUsers("z-user", "a-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.roomId, "a-user-z-user");
  assert.deepEqual(capturedFilter, { user1Uid: "a-user", user2Uid: "z-user", status: "matched" });
  assert.equal(capturedUpdate.$set.status, "unmatched");
  assert.equal(capturedUpdate.$set.unmatchedBy, "z-user");
  assert.ok(capturedUpdate.$set.unmatchedAt instanceof Date);
  assert.deepEqual(capturedUpdate.$unset, { likedBy: "" });
});

test("unmatch rejects self-targeting and missing active matches", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "chatmessages") return { async findOne() { return null; } };
    return { async updateOne() { return { matchedCount: 0 }; } };
  } });
  assert.equal((await connection.unmatchUsers("same", "same")).status, 400);
  assert.equal((await connection.unmatchUsers("viewer", "other")).status, 404);
});

test("blocking unmatches the pair and unblocking removes only the block entry", async () => {
  const userUpdates = [];
  const matchUpdates = [];
  const users = {
    async findOne(query) { return { _id: query.uid + "-id", uid: query.uid }; },
    async updateOne(query, update) { userUpdates.push({ query, update }); return { matchedCount: 1 }; }
  };
  const matches = {
    async updateOne(query, update) { matchUpdates.push({ query, update }); return { matchedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    if (name === "chatmessages") return { async findOne() { return { roomId: "user-a-user-b" }; } };
    assert.fail("Unexpected collection: " + name);
  } });

  const blocked = await connection.updateBlockedUser("user-a", "user-b", "block");
  assert.equal(blocked.status, 200);
  assert.deepEqual(userUpdates[0], {
    query: { uid: "user-a" }, update: { $addToSet: { blocked: "user-b" } }
  });
  assert.deepEqual(matchUpdates[0].query, { user1Uid: "user-a", user2Uid: "user-b" });
  assert.equal(matchUpdates[0].update.$set.status, "unmatched");
  assert.ok(matchUpdates[0].update.$unset.likedBy !== undefined);

  const unblocked = await connection.updateBlockedUser("user-a", "user-b", "unblock");
  assert.equal(unblocked.status, 200);
  assert.deepEqual(userUpdates[1], {
    query: { uid: "user-a" }, update: { $pull: { blocked: "user-b" } }
  });
  assert.equal(matchUpdates.length, 1, "unblocking must not silently recreate an old match");
});


test("moderation uses explicit temporary and permanent account states and supports restoration", async () => {
  const ObjectId = (await import("mongodb")).ObjectId;
  async function runAction(action, extraPayload = {}) {
    let userUpdate, reportUpdate;
    const report = {
      _id: new ObjectId("0123456789abcdef01234567"),
      reporterUid: "reporter", reportedUserUid: "target", status: "pending_review"
    };
    const target = {
      _id: "target-id", uid: "target", role: "user", isProfileVisible: true
    };
    const users = {
      async findOne(query) {
        if (query.uid === "admin") return { uid: "admin", role: "superadmin" };
        if (query.uid === "target") return target;
        return null;
      },
      async updateOne(query, update) {
        assert.equal(query._id, "target-id");
        userUpdate = update;
        return { matchedCount: 1 };
      }
    };
    const reports = {
      async findOne(query) { assert.equal(String(query._id), String(report._id)); return report; },
      async updateOne(query, update) { reportUpdate = update; return { matchedCount: 1 }; }
    };
    const auditlogs = {
      async insertOne(entry) { assert.equal(entry.eventType, "moderation_action"); return { insertedId: new ObjectId("0123456789abcdef01234568") }; },
      async updateOne(query, update) { assert.equal(update.$set.outcome, "completed"); return { matchedCount: 1 }; }
    };
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({});
    connection.getDatabase = () => ({ collection(name) {
      if (name === "users") return users;
      if (name === "reports") return reports;
      if (name === "auditlogs") return auditlogs;
      if (["chatTyping", "callSessions", "videoRooms"].includes(name)) return {
        async deleteMany() { return { deletedCount: 0 }; },
        async updateMany() { return { modifiedCount: 0 }; }
      };
      assert.fail("Unexpected collection: " + name);
    } });
    const result = await connection.moderateReport("admin", String(report._id), { action, ...extraPayload });
    assert.equal(result.status, 200);
    assert.ok(userUpdate);
    assert.ok(reportUpdate);
    return { userUpdate, reportUpdate, result };
  }

  const suspended = await runAction("suspend_user", { durationDays: 2, adminNotes: "Review evidence" });
  assert.equal(suspended.userUpdate.$set.accountStatus, "temporarily_suspended");
  assert.equal(suspended.userUpdate.$set.isProfileVisible, false);
  assert.ok(suspended.userUpdate.$set.suspendedUntil instanceof Date);
  assert.equal(suspended.reportUpdate.$set.status, "resolved_user_suspended");

  const banned = await runAction("ban_user", { adminNotes: "Confirmed abuse" });
  assert.equal(banned.userUpdate.$set.accountStatus, "permanently_banned");
  assert.equal(banned.userUpdate.$set.isProfileVisible, false);
  assert.ok(banned.userUpdate.$set.bannedAt instanceof Date);
  assert.equal(banned.reportUpdate.$set.status, "resolved_user_banned");

  const restored = await runAction("restore_user", { adminNotes: "Appeal accepted" });
  assert.equal(restored.userUpdate.$set.accountStatus, "active");
  assert.equal(restored.userUpdate.$set.isProfileVisible, true);
  assert.equal(restored.reportUpdate.$set.status, "resolved_user_restored");
});


test("private gallery purchases fail closed until secure media delivery is available", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => { assert.fail("Gallery checkout must not access the database while disabled"); };
  const result = await connection.createPendingPurchase("adult-buyer", "dark-fantasy-gallery:creator-123");
  assert.equal(result.status, 503);
  assert.match(result.body.error, /private gallery purchases are temporarily unavailable/i);
});

test("all private gallery purchase SKUs fail closed until secure media delivery is available", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => { assert.fail("Disabled gallery checkout must not access the database"); };
  for (const itemId of [
    "dark-fantasy-gallery:creator-123",
    "dark-fantasy-creator-monthly",
    "dark-fantasy-unlimited-pass"
  ]) {
    const result = await connection.createPendingPurchase("adult-buyer", itemId);
    assert.equal(result.status, 503, itemId);
    assert.match(result.body.error, /private gallery purchases are temporarily unavailable/i);
  }
});

test("Dark Fantasy add-on is a separate fixed-price purchase", async () => {
  let inserted;
  const users = { async findOne({ uid }) { return uid === "adult-user" ? { _id: "user-id", uid, name: "Adult User", email: "adult@example.com", birthday: new Date("1990-01-01"), accountStatus: "active" } : null; } };
  const purchases = { async insertOne(doc) { inserted = doc; return { insertedId: "0123456789abcdef01234567" }; } };
  const db = { collection(name) { if (name === "users") return users; if (name === "purchases") return purchases; assert.fail("Unexpected collection " + name); } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.createPendingPurchase("adult-user", "dark-fantasy-monthly");
  assert.equal(result.status, 201);
  assert.equal(result.body.price, 1200);
  assert.equal(inserted.itemId, "dark-fantasy-monthly");
  assert.equal(inserted.itemName, "Dark Fantasy Add-on (30 days)");
  assert.equal(inserted.status, "pending");
});

test("Dark Fantasy access requires an eligible adult and an unexpired paid add-on", async () => {
  const future = new Date(Date.now() + 86400000);
  const db = { collection(name) {
    assert.equal(name, "users");
    return { async findOne({ uid }) {
      if (uid === "adult") return { uid, birthday: new Date("1990-01-01"), darkFantasyAccessUntil: future, accountStatus: "active" };
      if (uid === "minor") return { uid, birthday: new Date("2015-01-01"), darkFantasyAccessUntil: future, accountStatus: "active" };
      if (uid === "expired") return { uid, birthday: new Date("1990-01-01"), darkFantasyAccessUntil: new Date(Date.now() - 1000), accountStatus: "active" };
      return null;
    } };
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const adult = await connection.getDarkFantasyStatus("adult");
  assert.equal(adult.status, 200);
  assert.equal(adult.body.ageEligible, true);
  assert.equal(adult.body.hasAccess, true);
  const minor = await connection.getDarkFantasyStatus("minor");
  assert.equal(minor.body.ageEligible, false);
  assert.equal(minor.body.hasAccess, false);
  const expired = await connection.getDarkFantasyStatus("expired");
  assert.equal(expired.body.hasAccess, false);
});

test("Dark Fantasy preferences cannot be saved without explicit consent", async () => {
  const connection = new MongoDBConnection({}, {});
  const result = await connection.saveDarkFantasyProfile("adult-user", { consent: false, interests: [], boundaries: [], visibility: "private" });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /consent/i);
});

test("withdrawing Dark Fantasy consent deletes the profile and revokes all related entitlements", async () => {
  let deletedProfile = false;
  let revoked;
  let transactionEnded = false;
  const profiles = { async deleteOne(query, options) {
    assert.deepEqual(query, { uid: "adult-user" });
    assert.ok(options.session);
    deletedProfile = true;
    return { deletedCount: 1 };
  } };
  const users = { async updateOne(query, update, options) {
    assert.deepEqual(query, { uid: "adult-user" });
    assert.ok(options.session);
    revoked = update.$unset;
    return { modifiedCount: 1 };
  } };
  const db = { collection(name) {
    if (name === "darkfantasyprofiles") return profiles;
    if (name === "users") return users;
    assert.fail("Unexpected collection " + name);
  } };
  const session = {
    async withTransaction(callback) { return callback(); },
    async endSession() { transactionEnded = true; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ startSession: () => session });
  connection.getDatabase = () => db;

  const result = await connection.deleteDarkFantasyProfile("adult-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.accessRevoked, true);
  assert.equal(deletedProfile, true);
  assert.deepEqual(Object.keys(revoked).sort(), [
    "creatorGalleryAccessUntil",
    "darkFantasyAccessUntil",
    "darkFantasyGalleryAccess",
    "darkFantasyUnlimitedUntil"
  ]);
  assert.equal(transactionEnded, true);
});


test("Dark Fantasy API remains unavailable by default without feature approval flags", async () => {
  const response = await Worker.fetch(new Request("https://api.example.test/api/dark-fantasy/status"), {});
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /not currently available/i);
});


test("successful profile boost payment grants exactly 30 minutes of visibility", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "0123456789abcdef01234567";
  const userId = new ObjectId("abcdef0123456789abcdef01");
  const purchase = { _id: new ObjectId(orderId), userId, itemId: "profile-boost-1", status: "pending" };
  const purchases = {
    async findOne() { return purchase; },
    async updateOne(query, update) { Object.assign(purchase, update.$set || {}); return { modifiedCount: 1 }; }
  };
  const subscriptions = { async findOne() { assert.fail("A store purchase must not be treated as a subscription"); } };
  let userUpdate;
  const users = {
    async updateOne(query, update) { userUpdate = update; return { matchedCount: 1 }; }
  };
  const db = { collection(name) {
    if (name === "purchases") return purchases;
    if (name === "subscriptions") return subscriptions;
    if (name === "users") return users;
    assert.fail("Unexpected collection " + name);
  } };
  const session = { async withTransaction(callback) { return callback(); }, async endSession() {} };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ startSession: () => session });
  connection.getDatabase = () => db;
  const before = Date.now();
  const result = await connection.settleWebXPay(orderId, "00", "provider-reference");
  const after = Date.now();
  assert.equal(result.status, 200);
  assert.equal(purchase.status, "completed");
  assert.ok(userUpdate.$set.boostExpiresAt instanceof Date);
  assert.ok(userUpdate.$set.boostExpiresAt.getTime() >= before + 30 * 60 * 1000);
  assert.ok(userUpdate.$set.boostExpiresAt.getTime() <= after + 30 * 60 * 1000);
});

test("successful Dark Fantasy payment settlement grants a separate 30-day entitlement", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "0123456789abcdef01234567";
  const userId = new ObjectId("abcdef0123456789abcdef01");
  const existingExpiry = new Date(Date.now() + 5 * 86400000);
  let entitlementUpdate;
  const purchase = { _id: new ObjectId(orderId), userId, itemId: "dark-fantasy-monthly", status: "pending" };
  const purchases = {
    async findOne() { return purchase; },
    async updateOne(query, update) { Object.assign(purchase, update.$set || {}); return { modifiedCount: 1 }; }
  };
  const subscriptions = { async findOne() { assert.fail("A purchase must not be treated as a subscription"); } };
  const users = {
    async findOne() { return { darkFantasyAccessUntil: existingExpiry }; },
    async updateOne(query, update) { entitlementUpdate = update; return { matchedCount: 1 }; }
  };
  const db = { collection(name) {
    if (name === "purchases") return purchases;
    if (name === "subscriptions") return subscriptions;
    if (name === "users") return users;
    assert.fail("Unexpected collection " + name);
  } };
  const session = { async withTransaction(callback) { return callback(); }, async endSession() {} };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ startSession: () => session });
  connection.getDatabase = () => db;
  const result = await connection.settleWebXPay(orderId, "00", "provider-reference", {
    transactionDate: "2026-10-21 12:00:00",
    gatewayId: "1",
    gatewayComment: "Approved"
  });
  assert.equal(result.status, 200);
  assert.equal(purchase.status, "completed");
  assert.equal(purchase.paymentReference, "provider-reference");
  assert.equal(purchase.paymentGatewayId, "1");
  assert.equal(purchase.paymentGatewayComment, "Approved");
  assert.equal(purchase.gatewayTransactionDate, "2026-10-21 12:00:00");
  assert.ok(entitlementUpdate.$set.darkFantasyAccessUntil instanceof Date);
  assert.ok(entitlementUpdate.$set.darkFantasyAccessUntil.getTime() >= existingExpiry.getTime() + 29 * 86400000);
  assert.ok(entitlementUpdate.$set.darkFantasyAccessUntil.getTime() <= existingExpiry.getTime() + 31 * 86400000);
});

test("Secrets Communities fail closed without an active Dark Fantasy entitlement", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getDarkFantasyStatus = async () => ({ status: 200, body: { ageEligible: true, accountEligible: true, hasAccess: false } });
  connection.getClient = async () => ({});
  connection.getDatabase = () => { assert.fail("Database must not be accessed without entitlement"); };
  const result = await connection.secretCommunityAction("member-1", "join", { slug: "gay-men" });
  assert.equal(result.status, 402);
  assert.match(result.body.error, /active Dark Fantasy add-on/i);
});

test("Secrets Communities do not expose private posts to users without active membership", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getDarkFantasyStatus = async () => ({ status: 200, body: { ageEligible: true, accountEligible: true, hasAccess: true } });
  const membership = { findOne: async () => ({ status: "requested", role: "member" }) };
  const users = { findOne: async () => ({ uid: "member-1", accountStatus: "active" }) };
  let postReads = 0;
  const posts = { find() { postReads++; return { sort() { return this; }, limit() { return this; }, toArray: async () => [] }; } };
  const db = { collection(name) { if (name === "secretcommunitymemberships") return membership; if (name === "users") return users; if (name === "secretcommunityposts") return posts; assert.fail("Unexpected collection " + name); } };
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.secretCommunityAction("member-1", "posts", { slug: "gay-men" });
  assert.equal(result.status, 403);
  assert.equal(postReads, 0, "private post collection must not be queried before membership authorization");
});

test("Secrets Communities enforce post and comment length limits", async () => {
  const connection = new MongoDBConnection({}, {});
  connection.getDarkFantasyStatus = async () => ({ status: 200, body: { ageEligible: true, accountEligible: true, hasAccess: true } });
  const membership = { findOne: async () => ({ status: "active", role: "member" }) };
  const users = { findOne: async () => ({ uid: "member-1", accountStatus: "active" }) };
  const posts = { insertOne: async () => { assert.fail("Oversized post must not be written"); }, findOne: async () => null };
  const db = { collection(name) { if (name === "secretcommunitymemberships") return membership; if (name === "users") return users; if (name === "secretcommunityposts") return posts; assert.fail("Unexpected collection " + name); } };
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.secretCommunityAction("member-1", "create-post", { slug: "gay-men", input: { text: "x".repeat(3001) } });
  assert.equal(result.status, 400);
});


test("paid live-show ticket checkout uses the room's server-side price and records the creator split", async () => {
  const orderId = "0123456789abcdef01234567";
  let insertedPurchase;
  const room = {
    roomId: "room-1", hostUid: "creator-1", title: "Evening Live",
    mode: "broadcast", visibility: "listed", ticketPriceLkr: 1000, status: "active", mediaStatus: "ready"
  };
  const rooms = { async findOne(query) { assert.deepEqual(query, { roomId: "room-1", status: "active" }); return room; } };
  const users = { async findOne(query) {
    if (query.uid === "viewer-1") return { _id: "viewer-object-id", uid: "viewer-1", name: "Viewer" };
    return null;
  } };
  const tickets = { async findOne() { return null; } };
  const purchases = {
    async findOne() { return null; },
    async insertOne(document) { insertedPurchase = document; return { insertedId: orderId }; }
  };
  const db = { collection(name) {
    if (name === "videoRooms") return rooms;
    if (name === "users") return users;
    if (name === "videoRoomTickets") return tickets;
    if (name === "purchases") return purchases;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createPendingVideoRoomTicket("viewer-1", "room-1");

  assert.equal(result.status, 201);
  assert.equal(result.body.orderId, orderId);
  assert.equal(result.body.price, 1000);
  assert.equal(insertedPurchase.viewerUid, "viewer-1");
  assert.equal(insertedPurchase.creatorUid, "creator-1");
  assert.equal(insertedPurchase.creatorSharePercent, 70);
  assert.equal(insertedPurchase.itemPrice, "1000");
  assert.equal(insertedPurchase.status, "pending");
});

test("paid live-show ticket checkout expires an abandoned pending order after 15 minutes", async () => {
  const staleId = "stale-order";
  const insertedId = "new-order";
  let expiredUpdate;
  let insertedPurchase;
  const room = {
    roomId: "room-1", hostUid: "creator-1", title: "Evening Live",
    mode: "broadcast", visibility: "listed", ticketPriceLkr: 500, status: "active", mediaStatus: "ready"
  };
  const db = { collection(name) {
    if (name === "videoRooms") return { async findOne() { return room; } };
    if (name === "users") return { async findOne() { return { _id: "viewer-object-id", uid: "viewer-1" }; } };
    if (name === "videoRoomTickets") return { async findOne() { return null; } };
    if (name === "purchases") return {
      async findOne() { return { _id: staleId, status: "pending", createdAt: new Date(Date.now() - 16 * 60 * 1000) }; },
      async updateOne(filter, update) { expiredUpdate = { filter, update }; return { modifiedCount: 1 }; },
      async insertOne(document) { insertedPurchase = document; return { insertedId }; }
    };
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createPendingVideoRoomTicket("viewer-1", "room-1");

  assert.equal(result.status, 201);
  assert.equal(result.body.orderId, insertedId);
  assert.equal(expiredUpdate.filter._id, staleId);
  assert.equal(expiredUpdate.update.$set.status, "expired");
  assert.equal(expiredUpdate.update.$set.expirationReason, "checkout_timeout");
  assert.ok(insertedPurchase.checkoutExpiresAt instanceof Date);
});

test("paid live-show ticket checkout refuses rooms past their expiry", async () => {
  let roomUpdate;
  let inserted = false;
  const room = {
    roomId: "room-1", hostUid: "creator-1", mode: "broadcast", visibility: "listed",
    ticketPriceLkr: 500, status: "active", mediaStatus: "ready", expiresAt: new Date(Date.now() - 1000)
  };
  const db = { collection(name) {
    if (name === "videoRooms") return {
      async findOne() { return room; },
      async updateOne(filter, update) { roomUpdate = { filter, update }; return { modifiedCount: 1 }; }
    };
    if (name === "users") return { async findOne() { return { _id: "viewer-object-id", uid: "viewer-1" }; } };
    if (name === "videoRoomTickets") return { async findOne() { return null; } };
    if (name === "purchases") return { async findOne() { return null; }, async insertOne() { inserted = true; return { insertedId: "new-order" }; } };
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createPendingVideoRoomTicket("viewer-1", "room-1");

  assert.equal(result.status, 404);
  assert.match(result.body.error, /expired/i);
  assert.equal(roomUpdate.update.$set.status, "ended");
  assert.equal(inserted, false);
});

test("paid live-show ticket checkout rejects duplicate pending orders", async () => {
  const room = {
    roomId: "room-1", hostUid: "creator-1", title: "Evening Live",
    mode: "broadcast", visibility: "listed", ticketPriceLkr: 500, status: "active", mediaStatus: "ready"
  };
  const db = { collection(name) {
    if (name === "videoRooms") return { async findOne() { return room; } };
    if (name === "users") return { async findOne() { return { _id: "viewer-object-id", uid: "viewer-1" }; } };
    if (name === "videoRoomTickets") return { async findOne() { return null; } };
    if (name === "purchases") return { async findOne() { return { status: "pending" }; } };
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.createPendingVideoRoomTicket("viewer-1", "room-1");
  assert.equal(result.status, 409);
  assert.match(result.body.error, /already pending/i);
});


test("moderation writes a durable audit entry before changing account state", async () => {
  const { ObjectId } = await import("mongodb");
  const reportId = "64b000000000000000000001";
  const reportObjectId = new ObjectId(reportId);
  const auditId = new ObjectId("64b000000000000000000002");
  const order = [];
  const report = { _id: reportObjectId, reportedUserUid: "target-user", status: "open" };
  const target = { _id: "target-object-id", uid: "target-user", accountStatus: "active", isProfileVisible: true };
  let insertedAudit;
  let finalizedAudit;
  const users = {
    async findOne(query) {
      if (query.uid === "admin-user") return { uid: "admin-user", role: "admin" };
      if (query.uid === "target-user") return target;
      return null;
    },
    async updateOne(query, update) {
      order.push("user-update");
      assert.equal(query._id, target._id);
      assert.equal(update.$set.accountStatus, "temporarily_suspended");
      return { modifiedCount: 1 };
    }
  };
  const reports = {
    async findOne(query) {
      assert.equal(String(query._id), reportId);
      return report;
    },
    async updateOne(query, update) {
      order.push("report-update");
      assert.equal(query._id, reportObjectId);
      assert.equal(update.$set.status, "resolved_user_suspended");
      return { modifiedCount: 1 };
    }
  };
  const auditlogs = {
    async insertOne(doc) {
      order.push("audit-insert");
      insertedAudit = doc;
      return { insertedId: auditId };
    },
    async updateOne(query, update) {
      order.push("audit-finalize");
      finalizedAudit = { query, update };
      return { modifiedCount: 1 };
    }
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "reports") return reports;
      if (name === "auditlogs") return auditlogs;
      if (["chatTyping", "callSessions", "videoRooms"].includes(name)) return {
        async deleteMany() { return { deletedCount: 0 }; },
        async updateMany() { return { modifiedCount: 0 }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.moderateReport("admin-user", reportId, {
    action: "suspend_user",
    durationDays: 7,
    adminNotes: "Policy violation"
  });

  assert.equal(result.status, 200);
  assert.deepEqual(order, ["audit-insert", "user-update", "report-update", "audit-finalize"]);
  assert.equal(insertedAudit.eventType, "moderation_action");
  assert.equal(insertedAudit.actorUid, "admin-user");
  assert.equal(insertedAudit.targetUid, "target-user");
  assert.equal(insertedAudit.action, "suspend_user");
  assert.equal(insertedAudit.previousAccountStatus, "active");
  assert.equal(insertedAudit.previousProfileVisibility, true);
  assert.equal(insertedAudit.durationDays, 7);
  assert.equal(insertedAudit.outcome, "started");
  assert.equal(finalizedAudit.query._id, auditId);
  assert.equal(finalizedAudit.update.$set.outcome, "completed");
  assert.equal(finalizedAudit.update.$set.reportStatus, "resolved_user_suspended");
});

test("moderation fails closed when the audit entry cannot be persisted", async () => {
  const { ObjectId } = await import("mongodb");
  const reportId = "64b000000000000000000003";
  const order = [];
  const report = { _id: new ObjectId(reportId), reportedUserUid: "target-user", status: "open" };
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne(query) {
          if (query.uid === "admin-user") return { uid: "admin-user", role: "admin" };
          if (query.uid === "target-user") return { _id: "target-object-id", uid: "target-user", accountStatus: "active" };
          return null;
        },
        async updateOne() { order.push("user-update"); return { modifiedCount: 1 }; }
      };
      if (name === "reports") return { async findOne() { return report; } };
      if (name === "auditlogs") return {
        async insertOne() { order.push("audit-insert"); throw new Error("audit storage unavailable"); },
        async updateOne() { return { modifiedCount: 0 }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.moderateReport("admin-user", reportId, { action: "dismiss" });

  assert.equal(result.status, 503);
  assert.deepEqual(order, ["audit-insert"]);
});


test("concurrent subscription checkout loses safely when the per-user reservation is already claimed", async () => {
  const user = { _id: "user-object-id", uid: "user-1" };
  const subscriptions = {
    async updateMany() { return { modifiedCount: 0 }; },
    async findOne() { return null; }
  };
  const users = {
    async findOne() { return user; },
    async updateOne(filter, update) {
      assert.equal(filter._id, user._id);
      assert.ok(update.$set.pendingSubscriptionCheckout.reservationId);
      return { matchedCount: 0, modifiedCount: 0 };
    }
  };
  const db = { collection(name) { return name === "users" ? users : subscriptions; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.createPendingSubscription("user-1", "monthly");
  assert.equal(result.status, 409);
  assert.match(result.body.error, /already pending/i);
});

test("failed subscription checkout can be cancelled and releases only its own reservation", async () => {
  const { ObjectId } = await import("mongodb");
  const user = { _id: new ObjectId(), uid: "user-1" };
  const orderId = "0123456789abcdef01234567";
  const reservationId = "checkout-reservation";
  const subscription = { _id: new ObjectId(orderId), userId: user._id, status: "pending", checkoutReservationId: reservationId };
  let subscriptionUpdate;
  let userUpdate;
  const subscriptions = {
    async findOne() { return subscription; },
    async updateOne(filter, update) {
      subscriptionUpdate = { filter, update };
      subscription.status = "cancelled";
      return { modifiedCount: 1 };
    }
  };
  const users = {
    async findOne() { return user; },
    async updateOne(filter, update) {
      userUpdate = { filter, update };
      return { modifiedCount: 1 };
    }
  };
  const db = { collection(name) { return name === "users" ? users : subscriptions; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.abandonPendingSubscription("user-1", orderId);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "cancelled");
  assert.equal(subscriptionUpdate.filter.status, "pending");
  assert.equal(subscriptionUpdate.update.$set.cancellationReason, "checkout_start_failed");
  assert.equal(userUpdate.filter["pendingSubscriptionCheckout.reservationId"], reservationId);
  assert.equal(Object.hasOwn(userUpdate.update.$unset, "pendingSubscriptionCheckout"), true);
});

test("subscription checkout cancellation refuses to cancel a settled payment", async () => {
  const { ObjectId } = await import("mongodb");
  const user = { _id: new ObjectId(), uid: "user-1" };
  const subscription = { _id: new ObjectId("0123456789abcdef01234567"), userId: user._id, status: "active" };
  const db = { collection(name) {
    return name === "users"
      ? { async findOne() { return user; } }
      : { async findOne() { return subscription; }, async updateOne() { assert.fail("Settled payment must not be cancelled"); } };
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.abandonPendingSubscription("user-1", "0123456789abcdef01234567");
  assert.equal(result.status, 409);
  assert.equal(result.body.status, "active");
});

test("pending WebXPay subscription checkout blocks a second checkout and expires stale attempts", async () => {
  const user = { _id: "user-object-id", uid: "user-1" };
  const pending = { _id: "pending-order" };
  let expiredFilter;
  let expiredUpdate;
  let inserted = false;
  const subscriptions = {
    async updateMany(filter, update) { expiredFilter = filter; expiredUpdate = update; return { modifiedCount: 1 }; },
    async findOne(filter) {
      if (filter.status === "active") return null;
      if (filter.status === "pending") return pending;
      return null;
    },
    async insertOne() { inserted = true; return { insertedId: "new-order" }; }
  };
  const db = { collection(name) {
    if (name === "users") return { async findOne() { return user; } };
    if (name === "subscriptions") return subscriptions;
    assert.fail("Unexpected collection " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createPendingSubscription("user-1", "monthly");

  assert.equal(result.status, 409);
  assert.match(result.body.error, /already pending/i);
  assert.equal(inserted, false);
  assert.equal(expiredFilter.userId, user._id);
  assert.equal(expiredFilter.status, "pending");
  assert.equal(expiredUpdate.$set.cancellationReason, "payment_timeout");
});

test("profile updates accept education text from onboarding and structured legacy education", async () => {
  const storedUser = { uid: "user-education", isOnboardingComplete: false };
  let saved;
  const users = {
    async findOne(query) {
      assert.equal(query.uid, "user-education");
      return { ...storedUser };
    },
    async updateOne(query, update) {
      saved = update.$set;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection() { return users; } });
  connection.getCurrentUserProfile = async () => ({ status: 200, body: { education: saved.education } });

  const textResult = await connection.updateCurrentUserProfile("user-education", { education: "Bachelor's Degree" });
  assert.equal(textResult.status, 200);
  assert.equal(saved.education, "Bachelor's Degree");

  const structuredResult = await connection.updateCurrentUserProfile("user-education", {
    education: { school: "Example University", degree: "BSc" }
  });
  assert.equal(structuredResult.status, 200);
  assert.deepEqual(saved.education, { school: "Example University", degree: "BSc" });
});



test("call signaling keeps a rolling candidate buffer without a lifetime 429 cap", async () => {
  const callId = "0123456789abcdef01234567";
  let capturedUpdate;
  let capturedFilter;
  const activeCall = {
    _id: { toString: () => callId },
    callerUid: "caller-uid",
    receiverUid: "receiver-uid",
    status: "accepted",
    signals: Array.from({ length: 300 }, (_, index) => ({ signalId: String(index) }))
  };
  const calls = {
    async findOne() { return activeCall; },
    async updateOne(filter, update) {
      capturedFilter = filter;
      capturedUpdate = update;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => calls }) });
  const result = await connection.sendCallSignal("caller-uid", {
    callId,
    candidate: { candidate: "candidate:1 1 UDP 2122260223 192.0.2.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(String(capturedFilter._id), callId);
  assert.deepEqual(capturedFilter.$or, [{ callerUid: "caller-uid" }, { receiverUid: "caller-uid" }]);
  assert.equal(capturedUpdate.$push.signals.$slice, -300);
  assert.equal(capturedUpdate.$push.signals.$each.length, 1);
  assert.equal(capturedUpdate.$push.signals.$each[0].toUid, "receiver-uid");
});

test("call signaling rejects non-participants before writing candidates", async () => {
  const callId = "0123456789abcdef01234567";
  let writeAttempted = false;
  const calls = {
    async findOne() {
      return { _id: {}, callerUid: "caller-uid", receiverUid: "receiver-uid", status: "accepted" };
    },
    async updateOne() { writeAttempted = true; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => calls }) });
  const result = await connection.sendCallSignal("attacker-uid", {
    callId, candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 }
  });
  assert.equal(result.status, 403);
  assert.equal(writeAttempted, false);
});


test("accepted calls are ended when the other participant stops polling", async () => {
  const now = Date.now();
  const call = {
    _id: { toString: () => "call-id" },
    roomId: "caller-uid-receiver-uid",
    callerUid: "caller-uid",
    receiverUid: "receiver-uid",
    status: "accepted",
    createdAt: new Date(now - 180000),
    connectedAt: new Date(now - 180000),
    updatedAt: new Date(now - 180000),
    callerLastSeenAt: new Date(now - 120000),
    receiverLastSeenAt: new Date(now - 2000),
    signals: []
  };
  const updates = [];
  const calls = {
    async findOne() { return call; },
    async updateOne(filter, update) { updates.push({ filter, update }); return { matchedCount: 1, modifiedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => calls }) });
  const result = await connection.getCallState("receiver-uid", call.roomId);
  assert.equal(result.status, 200);
  assert.equal(result.body.call, null);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].update.$set.receiverLastSeenAt instanceof Date, true);
  assert.equal(updates[1].update.$set.status, "ended");
  assert.equal(updates[1].update.$set.endReason, "participant_timeout");
});

test("accepted calls stay active while both participants renew their heartbeats", async () => {
  const now = Date.now();
  const call = {
    _id: { toString: () => "call-id" },
    roomId: "caller-uid-receiver-uid",
    callerUid: "caller-uid",
    receiverUid: "receiver-uid",
    status: "accepted",
    createdAt: new Date(now - 20000),
    connectedAt: new Date(now - 20000),
    updatedAt: new Date(now - 20000),
    callerLastSeenAt: new Date(now - 2000),
    receiverLastSeenAt: new Date(now - 2000),
    signals: []
  };
  const updates = [];
  const calls = {
    async findOne() { return call; },
    async updateOne(filter, update) { updates.push({ filter, update }); return { matchedCount: 1, modifiedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => ({ collection: () => calls }) });
  const result = await connection.getCallState("receiver-uid", call.roomId);
  assert.equal(result.status, 200);
  assert.equal(result.body.call.status, "accepted");
  assert.equal(result.body.call.receiverLastSeenAt instanceof Date, true);
  assert.equal(updates.length, 1);
});


test("a user cannot start or receive overlapping calls in different chat rooms", async () => {
  let activeCallFilter;
  let insertAttempted = false;
  const users = {
    async findOne({ uid }) { return { uid, blocked: [], accountStatus: "active" }; }
  };
  const calls = {
    async findOne(filter) {
      activeCallFilter = filter;
      return { _id: "existing-active-call" };
    },
    async insertOne() { insertAttempted = true; throw new Error("Should not create a second call"); }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({
    db: () => ({ collection(name) { return name === "users" ? users : calls; } })
  });
  const result = await connection.createCall("caller-uid", {
    roomId: "caller-uid-new-receiver",
    receiverUid: "new-receiver",
    type: "audio",
    offer: { type: "offer", sdp: "v=0" }
  });
  assert.equal(result.status, 409);
  assert.equal(activeCallFilter.roomId, undefined);
  assert.deepEqual(activeCallFilter.$or, [
    { callerUid: "caller-uid" },
    { receiverUid: "caller-uid" }
  ]);
  assert.equal(insertAttempted, false);
});


test("an active call is ended when the participants unmatch", async () => {
  const call = {
    _id: "call-object-id",
    roomId: "alice-bob",
    callerUid: "alice",
    receiverUid: "bob",
    status: "accepted",
    createdAt: new Date(),
    connectedAt: new Date(),
    callerLastSeenAt: new Date(),
    receiverLastSeenAt: new Date(),
    signals: []
  };
  let endedUpdate = null;
  const calls = {
    async findOne(filter) {
      assert.equal(filter.roomId, "alice-bob");
      return call;
    },
    async updateOne(filter, update) {
      endedUpdate = { filter, update };
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const users = {
    async findOne({ uid }) {
      return { uid, blocked: [], accountStatus: "active" };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "callSessions") return calls;
      if (name === "users") return users;
      if (name === "matches") return { async findOne() { return { status: "unmatched" }; } };
      if (name === "chatmessages") return {};
      assert.fail("Unexpected collection: " + name);
    }
  });

  const result = await connection.getCallState("alice", "alice-bob");

  assert.equal(result.status, 200);
  assert.equal(result.body.call, null);
  assert.deepEqual(result.body.signals, []);
  assert.equal(endedUpdate.filter._id, call._id);
  assert.equal(endedUpdate.update.$set.status, "ended");
  assert.equal(endedUpdate.update.$set.endReason, "conversation_unavailable");
});

test("global incoming call lookup returns only the authenticated receiver's live ringing call", async () => {
  const now = new Date();
  const call = {
    _id: { toString: () => "0123456789abcdef01234567" },
    roomId: "caller-uid-receiver-uid",
    callerUid: "caller-uid",
    receiverUid: "receiver-uid",
    type: "video",
    status: "ringing",
    createdAt: new Date(now.getTime() - 5000),
    offer: { type: "offer", sdp: "v=0" },
    signals: [{ signalId: "private-signal" }]
  };
  const updates = [];
  let staleFilter;
  const calls = {
    async updateMany(filter, update) { staleFilter = { filter, update }; return { modifiedCount: 0 }; },
    async findOne(filter, options) {
      assert.equal(filter.receiverUid, "receiver-uid");
      assert.equal(filter.status, "ringing");
      assert.ok(filter.createdAt.$gte instanceof Date);
      assert.deepEqual(options.sort, { createdAt: -1 });
      return call;
    },
    async updateOne(filter, update) { updates.push({ filter, update }); return { matchedCount: 1, modifiedCount: 1 }; }
  };
  const users = {
    async findOne(filter, options) {
      if (options?.projection?._id === 0 && options?.projection?.name === 1) {
        assert.equal(filter.uid, "caller-uid");
        return { uid: "caller-uid", name: "Caller Name", blocked: [] };
      }
      return { uid: filter.uid, blocked: [] };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "callSessions") return calls;
    if (name === "users") return users;
    if (name === "matches") return { async findOne() { return null; } };
    if (name === "chatmessages") return {};
    assert.fail("Unexpected collection: " + name);
  } });

  const result = await connection.getIncomingCall("receiver-uid");

  assert.equal(result.status, 200);
  assert.equal(result.body.call.callerName, "Caller Name");
  assert.equal(result.body.call.offer.sdp, "v=0");
  assert.equal("signals" in result.body.call, false);
  assert.equal(staleFilter.filter.receiverUid, "receiver-uid");
  assert.equal(staleFilter.filter.status, "ringing");
  assert.equal(staleFilter.update.$set.status, "missed");
  assert.equal(staleFilter.update.$set.endReason, "no_answer");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter._id, call._id);
  assert.ok(updates[0].update.$set.receiverLastSeenAt instanceof Date);
});


test("notification preferences default every delivery channel and event category to enabled", async () => {
  let projection;
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    assert.equal(name, "users");
    return { async findOne(query, options) {
      assert.equal(query.uid, "user-defaults");
      projection = options.projection;
      return { uid: "user-defaults" };
    } };
  } });
  const result = await connection.getNotificationPreferences("user-defaults");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.channels, {
    inApp: true, desktop: true, sounds: true, callRingtone: true
  });
  assert.ok(Object.values(result.body.events).every(value => value === true));
  assert.deepEqual(projection, { notificationPreferences: 1, _id: 0 });
});

test("notification preferences persist validated partial changes without resetting other choices", async () => {
  let saved;
  const user = { _id: "user-object-id", notificationPreferences: {
    channels: { inApp: false, desktop: true, sounds: true, callRingtone: true },
    events: { newMatches: false, newLikes: true, newMessages: true }
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    assert.equal(name, "users");
    return {
      async findOne(query) { assert.equal(query.uid, "user-settings"); return user; },
      async updateOne(query, update) { assert.equal(query._id, user._id); saved = update.$set.notificationPreferences; return { modifiedCount: 1 }; }
    };
  } });
  const result = await connection.updateNotificationPreferences("user-settings", {
    channels: { callRingtone: false },
    events: { voiceCalls: false }
  });
  assert.equal(result.status, 200);
  assert.equal(saved.channels.inApp, false);
  assert.equal(saved.channels.callRingtone, false);
  assert.equal(saved.events.newMatches, false);
  assert.equal(saved.events.voiceCalls, false);
  assert.equal(saved.events.newMessages, true);
});

test("notification preferences reject unknown keys and non-boolean values", async () => {
  const connection = new MongoDBConnection({}, {});
  const unknown = await connection.updateNotificationPreferences("user-settings", {
    events: { administratorAlerts: true }
  });
  const invalid = await connection.updateNotificationPreferences("user-settings", {
    channels: { desktop: "yes" }
  });
  assert.equal(unknown.status, 400);
  assert.equal(invalid.status, 400);
});

test("support ticket messages accept only ticket-scoped URLs on the configured CDN", async () => {
  const { ObjectId } = await import("mongodb");
  const ticketId = "0123456789abcdef01234567";
  const ticketObjectId = new ObjectId(ticketId);
  const validKey = "support-" + ticketId + "-1793700000000-123e4567-e89b-42d3-a456-426614174000.pdf";
  const cdnUrl = "https://dateme.enadoctemp.workers.dev/" + validKey;
  let insertedMessage;
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne() { return { _id: new ObjectId("abcdef012345abcdef012345") }; }
      };
      if (name === "supporttickets") return {
        async findOne() { return { _id: ticketObjectId, status: "Open" }; },
        async updateOne() { return { modifiedCount: 1 }; }
      };
      if (name === "ticketmessages") return {
        async insertOne(document) {
          insertedMessage = document;
          return { insertedId: new ObjectId("fedcba987654fedcba987654") };
        }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, { CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.addSupportTicketMessage("user-1", ticketId, {
    message: "Please review these files",
    attachments: [
      { key: validKey, url: cdnUrl, name: "document.pdf", type: "application/pdf", size: 1024 },
      { key: validKey, url: "https://attacker.example/" + validKey, name: "external.pdf", type: "application/pdf", size: 1024 },
      { key: "support-" + ticketId + "-other-user-file.pdf", url: cdnUrl, name: "wrong-key.pdf", type: "application/pdf", size: 1024 },
      { key: validKey, url: cdnUrl + "?download=1", name: "query.pdf", type: "application/pdf", size: 1024 }
    ]
  });

  assert.equal(result.status, 201);
  assert.equal(insertedMessage.attachments.length, 1);
  assert.equal(insertedMessage.attachments[0].url, cdnUrl);
  assert.equal(insertedMessage.attachments[0].name, "document.pdf");
});

// Chat privacy regression coverage: blocked conversations must not reappear
// in the inbox, and a participant cannot retrieve history after either side
// blocks the other.
test("chat conversations exclude users blocked in either direction", async () => {
  const currentUser = { uid: "alice", blocked: ["blocked-by-alice"] };
  const otherUsers = {
    "blocked-by-alice": { uid: "blocked-by-alice", name: "Blocked by Alice" },
    "blocked-alice": { uid: "blocked-alice", name: "Blocked Alice", blocked: ["alice"] },
    "unmatched": { uid: "unmatched", name: "Unmatched" },
    "allowed": { uid: "allowed", name: "Allowed", email: "private@example.com", mobileNumber: "+971500000000" }
  };
  const messages = [
    { roomId: "alice-blocked-by-alice", senderUid: "alice", receiverUid: "blocked-by-alice", messageContent: "hidden" },
    { roomId: "alice-blocked-alice", senderUid: "blocked-alice", receiverUid: "alice", messageContent: "hidden" },
    { roomId: "alice-unmatched", senderUid: "alice", receiverUid: "unmatched", messageContent: "hidden after unmatch" },
    {
      _id: { toHexString: () => "6729a0000000000000000002" },
      roomId: "alice-allowed",
      senderUid: "alice",
      receiverUid: "allowed",
      messageContent: "visible",
      timestamp: new Date("2026-11-04T06:00:00.000Z"),
      status: "sent",
      clientMessageId: "6729a000-0000-4000-8000-000000000002",
      email: "private@example.com",
      ipAddress: "203.0.113.10",
      internalNotes: "must not leak",
      moderationFlags: ["internal"],
      paymentReference: "private-payment-id"
    }
  ];
  let profileBatchQueries = 0;
  const inboxIndexes = [];
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne(filter) {
          return filter.uid === "alice" ? currentUser : otherUsers[filter.uid] || null;
        },
        find(filter) {
          profileBatchQueries++;
          assert.deepEqual(filter.uid.$in, ["blocked-by-alice", "blocked-alice", "unmatched", "allowed"]);
          return { async toArray() { return Object.values(otherUsers); } };
        }
      };
      if (name === "matches") return {
        async findOne(filter) {
          const pair = filter.$or || [];
          return pair.some(item => item.user1Uid === "alice" && item.user2Uid === "unmatched" ||
            item.user1Uid === "unmatched" && item.user2Uid === "alice")
            ? { status: "unmatched" }
            : null;
        }
      };
      return {
        async createIndex(keys, options) {
          inboxIndexes.push({ keys, options });
          return options.name;
        },
        aggregate(pipeline, options) {
          assert.deepEqual(options, { maxTimeMS: 10000 });
          if (pipeline[0]?.$match?.receiverUid === "alice") {
            assert.deepEqual(pipeline, [
              { $match: { receiverUid: "alice", status: { $ne: "read" } } },
              { $group: { _id: "$roomId", unreadCount: { $sum: 1 } } }
            ]);
            return { async toArray() { return [{ _id: "alice-allowed", unreadCount: 2 }]; } };
          }
          assert.deepEqual(pipeline, [
            { $match: { $or: [{ senderUid: "alice" }, { receiverUid: "alice" }] } },
            { $sort: { timestamp: -1, _id: -1 } },
            { $group: { _id: "$roomId", lastMessage: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$lastMessage" } },
            { $sort: { timestamp: -1, _id: -1 } }
          ]);
          return { async toArray() { return messages; } };
        }
      };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const result = await connection.getChatConversations("alice");
  await connection.chatConversationIndexesPromise;
  assert.equal(result.status, 200);
  assert.deepEqual(inboxIndexes, [
    {
      keys: { senderUid: 1, timestamp: -1, _id: -1 },
      options: { name: "chat_sender_inbox_latest" }
    },
    {
      keys: { receiverUid: 1, timestamp: -1, _id: -1 },
      options: { name: "chat_receiver_inbox_latest" }
    },
    {
      keys: { receiverUid: 1, roomId: 1, status: 1 },
      options: { name: "chat_receiver_unread_room_status" }
    },
    {
      keys: { senderUid: 1, roomId: 1 },
      options: { name: "chat_sender_room_membership" }
    },
    {
      keys: { receiverUid: 1, roomId: 1 },
      options: { name: "chat_receiver_room_membership" }
    }
  ]);
  assert.equal(profileBatchQueries, 1, "counterpart profiles should be fetched in one batch");
  assert.deepEqual(result.body.map(item => item.roomId), ["alice-allowed"]);
  assert.equal(result.body[0].unreadCount, 2);
  assert.equal(result.body[0].otherUser.email, undefined);
  assert.equal(result.body[0].otherUser.mobileNumber, undefined);
  assert.deepEqual(Object.keys(result.body[0].lastMessage).sort(), [
    "_id", "clientMessageId", "messageContent", "receiverUid", "roomId",
    "senderUid", "status", "timestamp"
  ].sort());
  assert.equal(result.body[0].lastMessage._id, "6729a0000000000000000002");
});

test("chat history is denied when either participant has blocked the other", async () => {
  for (const blockedDirection of ["viewer", "other"]) {
    const db = {
      collection(name) {
        if (name === "users") return {
          async findOne(filter) {
            if (filter.uid === "alice") {
              return { uid: "alice", role: "user", blocked: blockedDirection === "viewer" ? ["bob"] : [] };
            }
            if (filter.uid === "bob") {
              return { uid: "bob", blocked: blockedDirection === "other" ? ["alice"] : [] };
            }
            return null;
          }
        };
        return {
          async findOne() { return { senderUid: "alice", receiverUid: "bob" }; },
          find() { assert.fail("blocked chat history must not be queried"); }
        };
      }
    };
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({ db: () => db });
    const result = await connection.getChatHistory("alice", "alice-bob");
    assert.equal(result.status, 403, blockedDirection);
  }
});

test("chat history returns the newest page in chronological order and supports older pages", async () => {
  const newestFirst = [
    { _id: "newest", timestamp: new Date("2026-11-03T12:00:00.000Z") },
    { _id: "middle", timestamp: new Date("2026-11-03T11:00:00.000Z") },
    { _id: "oldest", timestamp: new Date("2026-11-03T10:00:00.000Z") }
  ];
  let sortSpec;
  let skipValue;
  let limitValue;
  let maxTimeMSValue;
  let messageQuery;
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne({ uid }) {
          if (uid === "alice") return { uid, role: "user", blocked: [] };
          if (uid === "bob") return { uid, blocked: [] };
          return null;
        }
      };
      return {
        async findOne() {
          return { senderUid: "alice", receiverUid: "bob" };
        },
        find(query) {
          messageQuery = query;
          return {
            sort(value) { sortSpec = value; return this; },
            skip(value) { skipValue = value; return this; },
            limit(value) { limitValue = value; return this; },
            maxTimeMS(value) { maxTimeMSValue = value; return this; },
            async toArray() { return newestFirst.slice(skipValue, skipValue + limitValue); }
          };
        }
      };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getChatHistory("alice", "alice-bob", 2, 1);

  assert.equal(result.status, 200);
  assert.deepEqual(sortSpec, { timestamp: -1, _id: -1 });
  assert.equal(skipValue, 1);
  assert.equal(limitValue, 2);
  assert.equal(maxTimeMSValue, 10000);
  assert.deepEqual(messageQuery, {
    roomId: "alice-bob",
    $or: [{ senderUid: "alice" }, { receiverUid: "alice" }]
  });
  assert.deepEqual(result.body.messages.map(message => message._id), ["oldest", "middle"]);
});

test("delivery receipts update only messages addressed to the authenticated recipient", async () => {
  const { ObjectId } = await import("mongodb");
  const messageId = "abcdef0123456789abcdef01";
  let capturedFilter;
  const db = {
    collection(name) {
      if (name === "chatmessages") return {
        async findOne() { return { senderUid: "alice", receiverUid: "bob" }; },
        async updateMany(filter) {
          capturedFilter = filter;
          return { modifiedCount: 1 };
        }
      };
      if (name === "users") return { async findOne() { return { blocked: [] }; } };
      if (name === "matches") return { async findOne() { return null; } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const result = await connection.markChatDelivered("bob", {
    roomId: "alice-bob",
    messageIds: [messageId]
  });
  assert.equal(result.status, 200);
  assert.deepEqual(capturedFilter, {
    _id: { $in: [new ObjectId(messageId)] },
    roomId: "alice-bob",
    receiverUid: "bob",
    status: "sent"
  });
  const oversized = await connection.markChatDelivered("bob", {
    roomId: "alice-bob",
    messageIds: Array.from({ length: 101 }, () => messageId)
  });
  assert.equal(oversized.status, 400);
});

test("read receipts update only unread messages addressed to the authenticated recipient", async () => {
  const { ObjectId } = await import("mongodb");
  const messageId = "abcdef0123456789abcdef01";
  let capturedFilter;
  let capturedUpdate;
  const db = {
    collection(name) {
      if (name === "chatmessages") return {
        async findOne() { return { senderUid: "alice", receiverUid: "bob" }; },
        async updateMany(filter, update) {
          capturedFilter = filter;
          capturedUpdate = update;
          return { modifiedCount: 1 };
        }
      };
      if (name === "users") return { async findOne() { return { blocked: [] }; } };
      if (name === "matches") return { async findOne() { return null; } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const result = await connection.markChatRead("bob", {
    roomId: "alice-bob",
    messageIds: [messageId]
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.readCount, 1);
  assert.deepEqual(capturedFilter, {
    _id: { $in: [new ObjectId(messageId)] },
    roomId: "alice-bob",
    receiverUid: "bob",
    status: { $in: ["sent", "delivered"] }
  });
  assert.equal(capturedUpdate.$set.status, "read");
  assert.ok(capturedUpdate.$set.deliveredAt instanceof Date);
  assert.ok(capturedUpdate.$set.readAt instanceof Date);
  const oversized = await connection.markChatRead("bob", {
    roomId: "alice-bob",
    messageIds: Array.from({ length: 101 }, () => messageId)
  });
  assert.equal(oversized.status, 400);
});

test("delivery and read receipts are denied after unmatching or blocking", async () => {
  const { ObjectId } = await import("mongodb");
  const messageId = "abcdef0123456789abcdef01";
  let receiptWrites = 0;
  const db = {
    collection(name) {
      if (name === "chatmessages") return {
        async findOne() { return { senderUid: "alice", receiverUid: "bob" }; },
        async updateMany() { receiptWrites++; return { modifiedCount: 1 }; }
      };
      if (name === "users") return {
        async findOne({ uid }) { return uid === "alice" ? { blocked: [] } : { blocked: [] }; }
      };
      if (name === "matches") return { async findOne() { return { status: "unmatched" }; } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ db: () => db });
  const delivered = await connection.markChatDelivered("bob", { roomId: "alice-bob", messageIds: [messageId] });
  const read = await connection.markChatRead("bob", { roomId: "alice-bob", messageIds: [messageId] });
  assert.equal(delivered.status, 403);
  assert.equal(read.status, 403);
  assert.equal(receiptWrites, 0);
});

test("chat message creation persists a normalized message and returns its MongoDB ID", async () => {
  const inserted = [];
  const users = {
    async findOne(query) {
      return query.uid === "alice" ? { uid: "alice" } : { uid: "bob" };
    }
  };
  const messages = {
    async insertOne(document) {
      inserted.push(document);
      return { insertedId: { toString: () => "abcdef0123456789abcdef01" } };
    }
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "chatmessages") return messages;
      if (name === "matches") return { async findOne() { return { _id: "matched-pair", status: "matched" }; } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createChatMessage("alice", {
    roomId: "alice-bob",
    receiverUid: "bob",
    messageContent: "  Hello Bob  "
  });

  assert.equal(result.status, 201);
  assert.equal(String(result.body._id), "abcdef0123456789abcdef01");
  assert.equal(result.body.senderUid, "alice");
  assert.equal(result.body.receiverUid, "bob");
  assert.equal(result.body.roomId, "alice-bob");
  assert.equal(result.body.messageContent, "Hello Bob");
  assert.equal(result.body.status, "sent");
  assert.ok(result.body.timestamp instanceof Date);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].messageContent, "Hello Bob");
});

test("chat message retries with the same client ID return the existing persisted message", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId("abcdef0123456789abcdef01");
  const existing = {
    _id: id, roomId: "alice-bob", senderUid: "alice", receiverUid: "bob",
    messageContent: "Hello Bob", clientMessageId: "123e4567-e89b-42d3-a456-426614174000",
    status: "sent", timestamp: new Date("2026-11-03T10:00:00.000Z")
  };
  let insertCount = 0;
  const users = { async findOne({ uid }) { return { uid, blocked: [] }; } };
  const messages = {
    async createIndex(keys, options) {
      assert.deepEqual(keys, { senderUid: 1, clientMessageId: 1 });
      assert.equal(options.unique, true);
    },
    async findOne(filter) {
      return filter.senderUid === "alice" && filter.clientMessageId === existing.clientMessageId ? existing : null;
    },
    async insertOne() { insertCount++; return { insertedId: id }; }
  };
  const db = { collection(name) { return name === "users" ? users : name === "matches" ? { async findOne() { return { _id: "matched-pair", status: "matched" }; } } : messages; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const payload = {
    roomId: "alice-bob", receiverUid: "bob", messageContent: "  Hello Bob  ",
    clientMessageId: existing.clientMessageId
  };

  const firstRetry = await connection.createChatMessage("alice", payload);
  const secondRetry = await connection.createChatMessage("alice", payload);

  assert.equal(firstRetry.status, 200);
  assert.equal(secondRetry.status, 200);
  assert.equal(String(firstRetry.body._id), String(id));
  assert.equal(insertCount, 0);

  const reusedKey = await connection.createChatMessage("alice", {
    ...payload, messageContent: "Different content"
  });
  assert.equal(reusedKey.status, 409);
  assert.equal(insertCount, 0);
});

test("unmatched conversations cannot continue through legacy message fallback", async () => {
  let legacyMessageLookup = false;
  let insertCount = 0;
  const users = { async findOne({ uid }) { return { uid, blocked: [] }; } };
  const matches = { async findOne() { return { _id: "match-id", status: "unmatched" }; } };
  const messages = {
    async findOne() { legacyMessageLookup = true; return { _id: "old-message" }; },
    async insertOne() { insertCount++; return { insertedId: "new-message" }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    if (name === "chatmessages") return messages;
    assert.fail("Unexpected collection: " + name);
  } });
  const result = await connection.createChatMessage("alice", {
    roomId: "alice-bob", receiverUid: "bob", messageContent: "Can we keep talking?"
  });
  assert.equal(result.status, 403);
  assert.match(result.body.error, /conversation has ended/i);
  assert.equal(legacyMessageLookup, false);
  assert.equal(insertCount, 0);
});

test("unmatched users cannot initiate a new chat", async () => {
  let insertCount = 0;
  const users = {
    async findOne({ uid }) { return { uid, blocked: [] }; }
  };
  const matches = {
    async findOne() { return null; }
  };
  const messages = {
    async findOne() { return null; },
    async insertOne() { insertCount++; return { insertedId: "unexpected" }; }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    if (name === "chatmessages") return messages;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createChatMessage("alice", {
    roomId: "alice-bob",
    receiverUid: "bob",
    messageContent: "Hello Bob"
  });

  assert.equal(result.status, 403);
  assert.match(result.body.error, /after you match/i);
  assert.equal(insertCount, 0);
});

test("existing legacy conversations remain usable without a current match record", async () => {
  let insertCount = 0;
  const users = {
    async findOne({ uid }) { return { uid, blocked: [] }; }
  };
  const matches = {
    async findOne() { return null; }
  };
  const messages = {
    async findOne() { return { _id: "existing-message" }; },
    async insertOne() { insertCount++; return { insertedId: "new-message" }; }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    if (name === "chatmessages") return messages;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createChatMessage("alice", {
    roomId: "alice-bob",
    receiverUid: "bob",
    messageContent: "Continuing our conversation"
  });

  assert.equal(result.status, 201);
  assert.equal(insertCount, 1);
});

test("chat message creation rejects malformed client message IDs", async () => {
  const connection = new MongoDBConnection({}, {});
  const result = await connection.createChatMessage("alice", {
    roomId: "alice-bob", receiverUid: "bob", messageContent: "Hello",
    clientMessageId: "not-a-uuid"
  });
  assert.equal(result.status, 400);
});

test("chat message creation rejects invalid room identities and blocked recipients before persistence", async () => {
  let insertCount = 0;
  const users = {
    async findOne(query) {
      if (query.uid === "alice") return { uid: "alice", blocked: ["bob"] };
      if (query.uid === "bob") return { uid: "bob", blocked: [] };
      return null;
    }
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      return { async insertOne() { insertCount++; return { insertedId: "unexpected" }; } };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const invalidRoom = await connection.createChatMessage("alice", {
    roomId: "alice-charlie", receiverUid: "bob", messageContent: "Hello"
  });
  assert.equal(invalidRoom.status, 400);

  const blocked = await connection.createChatMessage("alice", {
    roomId: "alice-bob", receiverUid: "bob", messageContent: "Hello"
  });
  assert.equal(blocked.status, 403);
  assert.equal(insertCount, 0);
});



test("typing status resolves hyphenated participant IDs from persisted message identities", async () => {
  const roomId = "alice-west-01-bob-east-02";
  const message = { senderUid: "alice-west-01", receiverUid: "bob-east-02" };
  const presenceQueries = [];
  const typingUpdates = [];
  const db = {
    collection(name) {
      if (name === "chatmessages") return { async findOne(filter, options) {
        assert.equal(filter.roomId, roomId);
        assert.deepEqual(options.projection, { senderUid: 1, receiverUid: 1 });
        return message;
      } };
      if (name === "users") return { async findOne(filter) {
        return { uid: filter.uid, blocked: [] };
      } };
      if (name === "matches") return { async findOne() { return null; } };
      if (name === "chatTyping") return {
        async findOne(filter) {
          presenceQueries.push(filter);
          return { isTyping: true, updatedAt: new Date() };
        },
        async updateOne(filter, update, options) {
          typingUpdates.push({ filter, update, options });
          return { matchedCount: 1, modifiedCount: 1 };
        }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const write = await connection.updateTypingStatus("alice-west-01", { roomId, isTyping: true });
  const read = await connection.getTypingStatus("alice-west-01", roomId);

  assert.equal(write.status, 200);
  assert.equal(read.status, 200);
  assert.equal(read.body.isTyping, true);
  assert.deepEqual(typingUpdates[0].filter, { roomId, uid: "alice-west-01" });
  assert.equal(typingUpdates[0].options.upsert, true);
  assert.deepEqual(presenceQueries[0], { roomId, uid: "bob-east-02" });
});

test("typing status is denied after either participant blocks the other", async () => {
  for (const blockedUid of ["bob-east-02", "alice-west-01"]) {
    let writeCount = 0;
    const roomId = "alice-west-01-bob-east-02";
    const db = {
      collection(name) {
        if (name === "chatmessages") return {
          async findOne() { return { senderUid: "alice-west-01", receiverUid: "bob-east-02" }; }
        };
        if (name === "users") return {
          async findOne(filter) { return { uid: filter.uid, blocked: filter.uid === "alice-west-01" && blockedUid === "bob-east-02" || filter.uid === "bob-east-02" && blockedUid === "alice-west-01" ? [blockedUid] : [] }; }
        };
        if (name === "matches") return { async findOne() { return null; } };
        if (name === "chatTyping") return {
          async updateOne() { writeCount++; return { modifiedCount: 1 }; },
          async findOne() { assert.fail("Blocked typing presence must not be read"); }
        };
        assert.fail("Unexpected collection: " + name);
      }
    };
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({});
    connection.getDatabase = () => db;
    const write = await connection.updateTypingStatus("alice-west-01", { roomId, isTyping: true });
    const read = await connection.getTypingStatus("alice-west-01", roomId);
    assert.equal(write.status, 403);
    assert.equal(read.status, 403);
    assert.equal(writeCount, 0);
  }
});


test("concurrent chat send retry resolves duplicate-key race to the original message", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId("abcdef0123456789abcdef01");
  const clientMessageId = "123e4567-e89b-42d3-a456-426614174000";
  const saved = {
    _id: id, roomId: "alice-bob", senderUid: "alice", receiverUid: "bob",
    messageContent: "Hello Bob", clientMessageId, status: "sent",
    timestamp: new Date("2026-11-03T10:00:00.000Z")
  };
  let lookupCount = 0;
  let insertCount = 0;
  const users = { async findOne({ uid }) { return { uid, blocked: [] }; } };
  const messages = {
    async createIndex() { return "chat_sender_client_message_unique"; },
    async findOne() {
      lookupCount++;
      return lookupCount === 1 ? null : saved;
    },
    async insertOne() {
      insertCount++;
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }
  };
  const db = { collection(name) { return name === "users" ? users : name === "matches" ? { async findOne() { return { _id: "matched-pair", status: "matched" }; } } : messages; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createChatMessage("alice", {
    roomId: "alice-bob",
    receiverUid: "bob",
    messageContent: "Hello Bob",
    clientMessageId
  });

  assert.equal(result.status, 200);
  assert.equal(String(result.body._id), String(id));
  assert.equal(result.body.clientMessageId, clientMessageId);
  assert.equal(lookupCount, 2);
  assert.equal(insertCount, 1);
});


test("chat history returns the requested page in chronological order", async () => {
  const older = { _id: "older", timestamp: new Date("2026-11-01T10:00:00.000Z") };
  const newer = { _id: "newer", timestamp: new Date("2026-11-01T10:05:00.000Z") };
  let capturedQuery;
  let capturedSort;
  let capturedSkip;
  let capturedLimit;
  let capturedMaxTimeMS;
  const users = {
    async findOne({ uid }) {
      return uid === "alice" ? { uid, role: "user", blocked: [] } :
        uid === "bob" ? { uid, blocked: [] } : null;
    }
  };
  const cursor = {
    sort(value) { capturedSort = value; return this; },
    skip(value) { capturedSkip = value; return this; },
    limit(value) { capturedLimit = value; return this; },
    maxTimeMS(value) { capturedMaxTimeMS = value; return this; },
    async toArray() { return [newer, older]; }
  };
  const messages = {
    async findOne(query) {
      assert.deepEqual(query, {
        roomId: "alice-bob",
        $or: [{ senderUid: "alice" }, { receiverUid: "alice" }]
      });
      return { senderUid: "alice", receiverUid: "bob" };
    },
    find(query) { capturedQuery = query; return cursor; }
  };
  const db = {
    collection(name) { return name === "users" ? users : messages; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.getChatHistory("alice", "alice-bob", 25, 50);

  assert.equal(result.status, 200);
  assert.deepEqual(capturedQuery, {
    roomId: "alice-bob",
    $or: [{ senderUid: "alice" }, { receiverUid: "alice" }]
  });
  assert.deepEqual(capturedSort, { timestamp: -1, _id: -1 });
  assert.equal(capturedSkip, 50);
  assert.equal(capturedLimit, 25);
  assert.equal(capturedMaxTimeMS, 10000);
  assert.deepEqual(result.body.messages.map(message => message._id), ["older", "newer"]);
});


test("photo ordering rejects URLs that are not already owned by the current profile", async () => {
  const storedPhotos = [
    { url: "photos-current-user-1700000000000.webp", size: 1200, order: 0 },
    { url: "photos-current-user-1700000000001.webp", size: 2400, order: 1 }
  ];
  let updateCalled = false;
  const users = {
    async findOne() { return { uid: "current-user", photos: storedPhotos }; },
    async updateOne() { updateCalled = true; return { matchedCount: 1 }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  connection.getCurrentUserProfile = async () => ({ status: 200, body: {} });

  const result = await connection.updatePhotoOrder("current-user", [
    { url: "photos-current-user-1700000000000.webp" },
    { url: "photos-another-user-1700000000001.webp" }
  ]);

  assert.equal(result.status, 400);
  assert.equal(updateCalled, false);
});

test("photo ordering rejects duplicate entries", async () => {
  const users = {
    async findOne() {
      return {
        uid: "current-user",
        photos: [{ url: "photos-current-user-1700000000000.webp" }]
      };
    },
    async updateOne() {
      assert.fail("Duplicate photo order must not update the profile");
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });

  const result = await connection.updatePhotoOrder("current-user", [
    { url: "photos-current-user-1700000000000.webp" },
    { url: "photos-current-user-1700000000000.webp" }
  ]);

  assert.equal(result.status, 400);
});

test("photo ordering preserves stored metadata and derives order from the submitted sequence", async () => {
  const storedPhotos = [
    { url: "photos-current-user-1700000000000.webp", size: 1200, order: 0 },
    { url: "photos-current-user-1700000000001.webp", size: 2400, order: 1 }
  ];
  let update;
  const users = {
    async findOne() { return { uid: "current-user", photos: storedPhotos }; },
    async updateOne(filter, operation) {
      update = { filter, operation };
      return { matchedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  connection.getCurrentUserProfile = async () => ({ status: 200, body: {} });

  const result = await connection.updatePhotoOrder("current-user", [
    { url: storedPhotos[1].url, size: 999999 },
    { url: storedPhotos[0].url, size: 999999 }
  ]);

  assert.equal(result.status, 200);
  assert.deepEqual(update.filter, { uid: "current-user" });
  assert.deepEqual(update.operation.$set.photos, [
    { url: storedPhotos[1].url, order: 0, size: 2400 },
    { url: storedPhotos[0].url, order: 1, size: 1200 }
  ]);
});


test("onboarding profile updates reject photo URLs not already uploaded to the account", async () => {
  let updateCalled = false;
  const users = {
    async findOne() {
      return {
        uid: "new-user",
        isOnboardingComplete: false,
        photos: [{ url: "photos-new-user-1700000000000.webp", size: 2048, order: 0 }]
      };
    },
    async updateOne() {
      updateCalled = true;
      return { matchedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });

  const result = await connection.updateCurrentUserProfile("new-user", {
    photos: [{ url: "photos-another-user-1700000000000.webp", order: 0 }],
    isOnboardingComplete: true
  });

  assert.equal(result.status, 400);
  assert.equal(updateCalled, false);
});

test("onboarding profile updates preserve metadata for previously uploaded photos", async () => {
  const uploaded = { url: "photos-new-user-1700000000000.webp", size: 2048, order: 0 };
  let update;
  const users = {
    async findOne() {
      return { uid: "new-user", isOnboardingComplete: false, photos: [uploaded] };
    },
    async updateOne(_filter, value) {
      update = value;
      return { matchedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  connection.getCurrentUserProfile = async () => ({ status: 200, body: {} });

  const result = await connection.updateCurrentUserProfile("new-user", {
    photos: [{ url: uploaded.url, size: 999999, admin: true }],
    isOnboardingComplete: true
  });

  assert.equal(result.status, 200);
  assert.deepEqual(update.$set.photos, [{ url: uploaded.url, order: 0, size: 2048 }]);
});

test("completed profiles cannot replace photos through the generic profile update route", async () => {
  let capturedUpdate;
  const users = {
    async findOne() {
      return { uid: "existing-user", isOnboardingComplete: true, photos: [{ url: "photos-existing-user-1700000000000.webp" }] };
    },
    async updateOne(_filter, update) {
      capturedUpdate = update;
      return { matchedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  connection.getCurrentUserProfile = async () => ({ status: 200, body: {} });

  const result = await connection.updateCurrentUserProfile("existing-user", {
    photos: [{ url: "photos-existing-user-1700000000000.webp" }]
  });

  assert.equal(result.status, 200);
  assert.equal(Object.hasOwn(capturedUpdate.$set, "photos"), false);
});


test("admins cannot promote user accounts or change any account role", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let writeCount = 0;
  const users = {
    async findOne() { return { _id: targetId, role: "user" }; },
    async findOneAndUpdate() { writeCount++; return { _id: targetId, role: "admin" }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });

  for (const role of ["admin", "contributor", "superadmin", "user"]) {
    const result = await connection.updateAdminUser("admin-uid", String(targetId), { role });
    assert.equal(result.status, 403);
  }
  assert.equal(writeCount, 0);
});

test("admins cannot modify another administrative account", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let writeCount = 0;
  const users = {
    async findOne() { return { _id: targetId, role: "admin" }; },
    async findOneAndUpdate() { writeCount++; return { _id: targetId }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });

  const result = await connection.updateAdminUser("admin-uid", String(targetId), { name: "Changed" });
  assert.equal(result.status, 403);
  assert.equal(writeCount, 0);
});


test("admin profile visibility updates cannot reactivate suspended or banned accounts", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let writeCount = 0;
  const users = {
    async findOne() {
      return { _id: targetId, role: "user", accountStatus: "temporarily_suspended", suspendedUntil: new Date(Date.now() + 86400000) };
    },
    async findOneAndUpdate() { writeCount++; return { _id: targetId }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({ db: () => ({ collection: () => users }) });

  const result = await connection.updateAdminUser("admin-uid", String(targetId), { isProfileVisible: true });
  assert.equal(result.status, 403);
  assert.equal(writeCount, 0);
});


test("photo deletion marks metadata pending before CDN cleanup and retains the photo on failure", async () => {
  let capturedUpdate;
  const users = {
    async findOne() {
      return { photos: [
        { url: "photos-user-1700000000000.webp", size: 1024 },
        { url: "photos-user-1700000000001.webp", size: 2048 }
      ] };
    },
    async updateOne(_filter, update) {
      capturedUpdate = update;
      return { modifiedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });

  const result = await connection.removeUploadedPhoto("user", "photos-user-1700000000000.webp");
  assert.equal(result.status, 200);
  assert.equal(capturedUpdate.$set["photos.$.deletionPending"], true);
  assert.equal(Object.hasOwn(capturedUpdate, "$pull"), false);
  assert.equal(Object.hasOwn(capturedUpdate, "$inc"), false);
});

test("photo deletion finalization removes only pending metadata and decrements stored size", async () => {
  let capturedFilter;
  let capturedUpdate;
  const users = {
    async findOne() {
      return { photos: [
        { url: "photos-user-1700000000000.webp", size: 1024, deletionPending: true }
      ] };
    },
    async updateOne(filter, update) {
      capturedFilter = filter;
      capturedUpdate = update;
      return { modifiedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });

  const result = await connection.finalizeUploadedPhotoDeletion("user", "photos-user-1700000000000.webp");
  assert.equal(result.status, 200);
  assert.deepEqual(capturedFilter.photos, { $elemMatch: { url: "photos-user-1700000000000.webp", deletionPending: true } });
  assert.deepEqual(capturedUpdate.$pull, { photos: { url: "photos-user-1700000000000.webp", deletionPending: true } });
  assert.deepEqual(capturedUpdate.$inc, { totalPhotoSize: -1024 });
});

test("photo deletion finalization refuses to remove metadata without a pending marker", async () => {
  let writeCount = 0;
  const users = {
    async findOne() {
      return { photos: [{ url: "photos-user-1700000000000.webp", size: 1024 }] };
    },
    async updateOne() {
      writeCount++;
      return { modifiedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });

  const result = await connection.finalizeUploadedPhotoDeletion("user", "photos-user-1700000000000.webp");
  assert.equal(result.status, 404);
  assert.equal(writeCount, 0);
});


test("ordinary Worker admins cannot change paid plan, verification, password, or photos", async () => {
  const targetId = "507f1f77bcf86cd799439011";
  let updateCalls = 0;
  const users = {
    async findOne() { return { role: "user", accountStatus: "active" }; },
    async findOneAndUpdate() { updateCalls += 1; return null; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    assert.equal(name, "users");
    return users;
  } });

  for (const payload of [
    { email: "attacker-controlled@example.com" },
    { plan: "premium" },
    { isVerified: true },
    { faceVerified: true },
    { mustSetPassword: false },
    { photos: [{ url: "https://example.invalid/photo.webp" }] }
  ]) {
    const result = await connection.updateAdminUser("admin-uid", targetId, payload);
    assert.equal(result.status, 403);
  }
  assert.equal(updateCalls, 0);
});

test("ordinary Worker admin update responses do not expose contact details", async () => {
  const targetId = "507f1f77bcf86cd799439011";
  const users = {
    async findOne() { return { role: "user", accountStatus: "active" }; },
    async findOneAndUpdate() {
      return {
        _id: targetId,
        name: "Updated User",
        email: "private@example.com",
        mobileNumber: "+971500000000",
        phoneNumber: "+971500000001",
        contactNumber: "+971500000002"
      };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    assert.equal(name, "users");
    return users;
  } });

  const result = await connection.updateAdminUser("admin-uid", targetId, { name: "Updated User" });
  assert.equal(result.status, 200);
  assert.equal(result.body.name, "Updated User");
  for (const field of ["email", "mobileNumber", "phoneNumber", "contactNumber"]) {
    assert.equal(Object.hasOwn(result.body, field), false, field + " must be hidden from ordinary admins");
  }
});

test("photo verification requires explicit consent and a valid recording", async () => {
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  let databaseAccessed = false;
  connection.getClient = async () => { databaseAccessed = true; return {}; };
  const missingConsent = await connection.submitPhotoVerification("user-1", {
    videoBase64: "A".repeat(1200), mimeType: "video/webm", challenge: "smile", consent: false
  });
  assert.equal(missingConsent.status, 400);
  assert.equal(databaseAccessed, false);
  const invalidChallenge = await connection.submitPhotoVerification("user-1", {
    videoBase64: "A".repeat(1200), mimeType: "video/webm", challenge: "approve_me", consent: true
  });
  assert.equal(invalidChallenge.status, 400);
  assert.equal(databaseAccessed, false);
});

test("photo verification submission fails closed when encryption key is not configured", async () => {
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  const result = await connection.submitPhotoVerification("user-1", {
    videoBase64: "A".repeat(1200), mimeType: "video/webm", challenge: "smile", consent: true
  });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /not configured securely/i);
});

test("photo verification evidence is restricted to superadmins", async () => {
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "users");
      return { findOne: async () => ({ role: "admin" }) };
    }
  });
  const queue = await connection.listPhotoVerificationsForAdmin("admin-1");
  const evidence = await connection.getPhotoVerificationEvidenceForAdmin("admin-1", "0123456789abcdef01234567");
  const review = await connection.reviewPhotoVerification("admin-1", "0123456789abcdef01234567", { action: "approve" });
  assert.equal(queue.status, 403);
  assert.equal(evidence.status, 403);
  assert.equal(review.status, 403);
});

test("users can withdraw a pending photo verification and delete its encrypted evidence", async () => {
  let filter;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      assert.equal(name, "photoVerifications");
      return { deleteMany: async query => { filter = query; return { deletedCount: 1 }; } };
    }
  });
  const result = await connection.withdrawPhotoVerification("user-1");
  assert.equal(result.status, 200);
  assert.equal(result.body.withdrawn, true);
  assert.deepEqual(filter, { uid: "user-1", status: "pending_review" });
});


test("MongoDB connection pool size is bounded and safely configurable", () => {
  assert.equal(getMongoPoolSize(undefined), 10);
  assert.equal(getMongoPoolSize("8"), 8);
  assert.equal(getMongoPoolSize("1"), 1);
  assert.equal(getMongoPoolSize("20"), 20);
  assert.equal(getMongoPoolSize("0"), 10);
  assert.equal(getMongoPoolSize("21"), 10);
  assert.equal(getMongoPoolSize("not-a-number"), 10);
});


test("MongoDB Durable Object routing is stable and spreads authenticated users", () => {
  const makeRequest = uid => {
    const payload = Buffer.from(JSON.stringify({ sub: uid })).toString("base64url");
    return new Request("https://example.test/api/chat/conversations", {
      headers: { authorization: "Bearer header." + payload + ".signature" }
    });
  };
  const env = { MONGODB_CONNECTION_SHARDS: "4" };
  assert.equal(getMongoShardName(makeRequest("same-user"), env), getMongoShardName(makeRequest("same-user"), env));
  assert.match(getMongoShardName(makeRequest("same-user"), env), /^mongo-shard-[0-3]$/);
  const shards = new Set(Array.from({ length: 32 }, (_, index) =>
    getMongoShardName(makeRequest("load-test-user-" + index), env)
  ));
  assert.ok(shards.size > 1, "authenticated users should distribute across MongoDB connection shards");
  assert.equal(getMongoShardName(new Request("https://example.test"), env), "mongo-primary");
});


test("successful WebXPay subscription settlement clears its matching checkout reservation", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "0123456789abcdef01234567";
  const userId = new ObjectId("abcdef0123456789abcdef01");
  const reservationId = "reservation-success";
  const subscription = {
    _id: new ObjectId(orderId), userId, plan: "monthly", status: "pending",
    checkoutReservationId: reservationId
  };
  const userUpdates = [];
  const purchases = { async findOne() { return null; } };
  const subscriptions = {
    async findOne() { return subscription; },
    async updateOne(query, update) {
      Object.assign(subscription, update.$set || {});
      return { modifiedCount: 1, matchedCount: 1 };
    }
  };
  const users = {
    async updateOne(query, update) {
      userUpdates.push({ query, update });
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const db = { collection(name) {
    if (name === "purchases") return purchases;
    if (name === "subscriptions") return subscriptions;
    if (name === "users") return users;
    assert.fail("Unexpected collection " + name);
  } };
  const session = { async withTransaction(callback) { return callback(); }, async endSession() {} };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ startSession: () => session });
  connection.getDatabase = () => db;
  const result = await connection.settleWebXPay(orderId, "00", "provider-reference");
  assert.equal(result.status, 200);
  assert.equal(subscription.status, "active");
  assert.equal(userUpdates.length, 2);
  assert.equal(userUpdates[0].query._id, userId);
  assert.equal(userUpdates[0].update.$set.plan, "premium");
  assert.equal(userUpdates[1].query["pendingSubscriptionCheckout.reservationId"], reservationId);
  assert.deepEqual(userUpdates[1].update.$unset, { pendingSubscriptionCheckout: "" });
});

test("declined WebXPay subscription settlement clears its matching checkout reservation", async () => {
  const { ObjectId } = await import("mongodb");
  const orderId = "1123456789abcdef01234567";
  const userId = new ObjectId("abcdef0123456789abcdef01");
  const reservationId = "reservation-declined";
  const subscription = {
    _id: new ObjectId(orderId), userId, plan: "weekly", status: "pending",
    checkoutReservationId: reservationId
  };
  let userUpdate;
  const purchases = { async findOne() { return null; } };
  const subscriptions = {
    async findOne() { return subscription; },
    async updateOne(query, update) {
      Object.assign(subscription, update.$set || {});
      return { modifiedCount: 1, matchedCount: 1 };
    }
  };
  const users = {
    async updateOne(query, update) {
      userUpdate = { query, update };
      return { matchedCount: 1, modifiedCount: 1 };
    }
  };
  const db = { collection(name) {
    if (name === "purchases") return purchases;
    if (name === "subscriptions") return subscriptions;
    if (name === "users") return users;
    assert.fail("Unexpected collection " + name);
  } };
  const session = { async withTransaction(callback) { return callback(); }, async endSession() {} };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({ startSession: () => session });
  connection.getDatabase = () => db;
  const result = await connection.settleWebXPay(orderId, "15", "provider-reference");
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "declined");
  assert.equal(subscription.status, "cancelled");
  assert.equal(userUpdate.query["pendingSubscriptionCheckout.reservationId"], reservationId);
  assert.deepEqual(userUpdate.update.$unset, { pendingSubscriptionCheckout: "" });
});


test("admin report search supports user names without exposing email search to ordinary admins", async () => {
  let capturedUserSearch;
  let capturedReportSearch;
  const users = {
    findOne: async () => ({ uid: "admin", role: "admin" }),
    find(query) {
      if (query.$or) {
        capturedUserSearch = query;
        return { toArray: async () => [{ uid: "target" }] };
      }
      if (query.uid && Array.isArray(query.uid.$in)) {
        return { toArray: async () => [
          { uid: "target", name: "Target Member", accountStatus: "temporarily_suspended" },
          { uid: "reporter", name: "Reporter Member" }
        ] };
      }
      assert.fail("Unexpected user query");
    }
  };
  const reports = {
    find(query) {
      capturedReportSearch = query;
      return {
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        toArray: async () => [{
          _id: "report-id",
          reporterUid: "reporter",
          reportedUserUid: "target",
          status: "pending_review"
        }]
      };
    },
    countDocuments: async () => 1
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "users") return users;
      if (name === "reports") return reports;
      assert.fail("Unexpected collection: " + name);
    }
  });

  const result = await connection.getAdminReports("admin", {
    status: "pending_review",
    search: "Target Member",
    page: 1,
    limit: 10
  });

  assert.equal(result.status, 200);
  assert.deepEqual(capturedReportSearch.reportedUserUid, { $in: ["target"] });
  assert.equal(capturedUserSearch.$or[1].name.$regex, "Target Member");
  assert.equal(capturedUserSearch.$or.some(item => Object.hasOwn(item, "email")), false);
  assert.equal(result.body.reports[0].reportedUser.name, "Target Member");
  assert.equal(result.body.reports[0].reporter.name, "Reporter Member");
});


test("admin analytics counts unique active subscribers rather than subscription documents", async () => {
  const users = {
    async findOne() { return { uid: "admin", role: "admin" }; },
    async countDocuments() { return 12; },
    aggregate() { return { toArray: async () => [{ _id: "2026-11-07", count: 3 }] }; }
  };
  const subscriptions = {
    async distinct(field, query) {
      assert.equal(field, "userId");
      assert.deepEqual(query, { status: "active" });
      return ["subscriber-a", "subscriber-b"];
    }
  };
  const reports = { async distinct() { return ["reported-a"]; } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "users") return users;
      if (name === "subscriptions") return subscriptions;
      if (name === "reports") return reports;
      assert.fail("Unexpected collection: " + name);
    }
  });

  const result = await connection.getAdminAnalyticsSummary("admin", {
    startDate: "2026-11-01T00:00:00.000Z",
    endDate: "2026-11-07T23:59:59.999Z"
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.userStats, { total: 12, paid: 2, unpaid: 10 });
  assert.equal(result.body.reportedUsersCount, 1);
});


test("new support tickets receive a default priority, category, and SLA deadline", async () => {
  let insertedTicket;
  const userId = { id: "customer-id" };
  const db = {
    collection(name) {
      if (name === "users") return { findOne: async () => ({ _id: userId }) };
      if (name === "supporttickets") return {
        insertOne: async ticket => {
          insertedTicket = ticket;
          return { insertedId: { id: "ticket-id" } };
        }
      };
      if (name === "ticketmessages") return {
        insertOne: async message => ({ insertedId: { id: "message-id" } })
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.createSupportTicket("customer-uid", {
    subject: "Payment receipt missing",
    message: "Please check my purchase."
  });

  assert.equal(result.status, 201);
  assert.equal(insertedTicket.priority, "Normal");
  assert.equal(insertedTicket.category, "Other");
  assert.ok(insertedTicket.slaDueAt instanceof Date);
  assert.equal(insertedTicket.slaDueAt.getTime() - insertedTicket.createdAt.getTime(), 24 * 60 * 60 * 1000);
});

test("admin support inbox searches safely and returns total pagination metadata", async () => {
  let capturedTicketQuery;
  let capturedUserQuery;
  const matchingUserId = "507f1f77bcf86cd799439011";
  const users = {
    find(query) {
      capturedUserQuery = query;
      return { limit() { return this; }, toArray: async () => [{ _id: matchingUserId }] };
    }
  };
  const tickets = {
    find(query) {
      capturedTicketQuery = query;
      return {
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        toArray: async () => []
      };
    },
    countDocuments: async () => 23
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    if (name === "supporttickets") return tickets;
    assert.fail("Unexpected collection: " + name);
  } });

  const result = await connection.getAdminSupportTickets("admin-uid", {
    page: "2", limit: "10", status: "Open", search: "A.*"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.total, 23);
  assert.equal(result.body.totalPages, 3);
  assert.equal(result.body.currentPage, 2);
  assert.equal(capturedTicketQuery.status, "Open");
  assert.equal(capturedTicketQuery.$or[0].subject.$regex, "A\\.\\*");
  assert.deepEqual(capturedTicketQuery.$or[2].userId.$in, [matchingUserId]);
  assert.equal(capturedUserQuery.$or.some(item => Object.hasOwn(item, "email")), false);
});

test("admin support inbox applies overdue SLA filtering server-side", async () => {
  let capturedQuery;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "supporttickets") return {
      find(query) {
        capturedQuery = query;
        return { sort() { return this; }, skip() { return this; }, limit() { return this; }, toArray: async () => [] };
      },
      countDocuments: async () => 0
    };
    assert.fail("Unexpected collection: " + name);
  } });
  const result = await connection.getAdminSupportTickets("admin-uid", { sla: "overdue" });
  assert.equal(result.status, 200);
  assert.ok(capturedQuery.$and.some(clause => clause.slaDueAt?.$lt instanceof Date));
  assert.ok(capturedQuery.$and.some(clause => clause.status?.$ne === "Closed"));
  const invalid = await connection.getAdminSupportTickets("admin-uid", { sla: "unknown" });
  assert.equal(invalid.status, 400);
});

test("admin private notes are stored as internal and do not move the customer-facing status", async () => {
  const { ObjectId } = await import("mongodb");
  const ticketId = "507f1f77bcf86cd799439011";
  const adminId = new ObjectId("507f1f77bcf86cd799439012");
  const updates = [];
  let insertedMessage;
  const users = { findOne: async () => ({ _id: adminId }) };
  const tickets = {
    findOne: async () => ({ _id: new ObjectId(ticketId), status: "In Progress" }),
    updateOne: async (query, update) => { updates.push(update); return { modifiedCount: 1 }; }
  };
  const messages = {
    insertOne: async message => { insertedMessage = message; return { insertedId: new ObjectId("507f1f77bcf86cd799439013") }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    if (name === "supporttickets") return tickets;
    if (name === "ticketmessages") return messages;
    assert.fail("Unexpected collection: " + name);
  } });

  const result = await connection.addAdminSupportMessage("admin-uid", ticketId, {
    message: "Check the payment logs before replying.",
    isInternalNote: true
  });

  assert.equal(result.status, 201);
  assert.equal(insertedMessage.isInternalNote, true);
  assert.equal(insertedMessage.isFromAdmin, true);
  assert.equal(updates[0].$set.status, undefined);
  assert.ok(updates[0].$set.updatedAt instanceof Date);
});

test("admin must provide a resolution summary before closing a support ticket", async () => {
  const { ObjectId } = await import("mongodb");
  const ticketId = "507f1f77bcf86cd799439031";
  const ticketObjectId = new ObjectId(ticketId);
  const updates = [];
  const audits = [];
  const current = { _id: ticketObjectId, status: "In Progress", priority: "Normal", slaDueAt: new Date() };
  const tickets = {
    findOne: async () => current,
    findOneAndUpdate: async (query, update) => {
      updates.push(update);
      return { value: { ...current, ...update.$set } };
    }
  };
  const db = {
    collection(name) {
      if (name === "supporttickets") return tickets;
      if (name === "auditlogs") return { insertOne: async entry => { audits.push(entry); } };
      if (name === "users") return { findOne: async () => ({ _id: new ObjectId("507f1f77bcf86cd799439032") }) };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const missing = await connection.updateAdminSupportStatus("admin-uid", ticketId, { status: "Closed" });
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /resolution summary/i);
  assert.equal(updates.length, 0);

  const closed = await connection.updateAdminSupportStatus("admin-uid", ticketId, {
    status: "Closed",
    resolutionSummary: "Payment was reconciled and the missing receipt was sent."
  });
  assert.equal(closed.status, 200);
  assert.equal(updates[0].$set.status, "Closed");
  assert.equal(updates[0].$set.resolutionSummary, "Payment was reconciled and the missing receipt was sent.");
  assert.ok(updates[0].$set.resolvedAt instanceof Date);
  assert.equal(updates[0].$set.resolvedByUid, "admin-uid");
  assert.equal(audits.length, 1);
  assert.ok(audits[0].changes.some(change => change.field === "resolutionSummary"));
});

test("customer can submit one satisfaction rating only after a ticket is closed", async () => {
  const { ObjectId } = await import("mongodb");
  const ticketId = "507f1f77bcf86cd799439051";
  const ticketObjectId = new ObjectId(ticketId);
  const userId = new ObjectId("507f1f77bcf86cd799439052");
  const audits = [];
  let savedFeedback;
  const ticket = { _id: ticketObjectId, userId, status: "Closed" };
  const tickets = {
    findOne: async () => ({ ...ticket, ...(savedFeedback ? { customerFeedback: savedFeedback } : {}) }),
    updateOne: async (query, update) => {
      if (query.status === "Closed" && query.customerFeedback.$exists === false && !savedFeedback) {
        savedFeedback = update.$set.customerFeedback;
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    }
  };
  const db = {
    collection(name) {
      if (name === "users") return { findOne: async () => ({ _id: userId }) };
      if (name === "supporttickets") return tickets;
      if (name === "auditlogs") return { insertOne: async entry => { audits.push(entry); } };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const invalid = await connection.submitSupportTicketFeedback("customer-uid", ticketId, { rating: 6 });
  assert.equal(invalid.status, 400);
  const submitted = await connection.submitSupportTicketFeedback("customer-uid", ticketId, {
    rating: 5, comment: "The support team resolved this quickly."
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.customerFeedback.rating, 5);
  assert.equal(submitted.body.customerFeedback.comment, "The support team resolved this quickly.");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].eventType, "support_ticket_feedback_submitted");
  const duplicate = await connection.submitSupportTicketFeedback("customer-uid", ticketId, { rating: 4 });
  assert.equal(duplicate.status, 409);
});

test("customer reply reopens a closed support ticket and resets its SLA", async () => {
  const { ObjectId } = await import("mongodb");
  const ticketId = "507f1f77bcf86cd799439041";
  const ticketObjectId = new ObjectId(ticketId);
  const userId = new ObjectId("507f1f77bcf86cd799439042");
  const updates = [];
  const audits = [];
  const ticket = {
    _id: ticketObjectId, userId, status: "Closed", priority: "High",
    resolutionSummary: "The original issue was resolved."
  };
  const db = {
    collection(name) {
      if (name === "users") return { findOne: async () => ({ _id: userId }) };
      if (name === "supporttickets") return {
        findOne: async () => ticket,
        updateOne: async (query, update) => { updates.push(update); return { modifiedCount: 1 }; }
      };
      if (name === "ticketmessages") return {
        insertOne: async message => ({ insertedId: new ObjectId("507f1f77bcf86cd799439043") })
      };
      if (name === "auditlogs") return {
        insertOne: async entry => { audits.push(entry); }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.addSupportTicketMessage("customer-uid", ticketId, {
    message: "The issue has happened again. Please reopen this."
  });

  assert.equal(result.status, 201);
  assert.equal(updates[0].$set.status, "Open");
  assert.equal(updates[0].$set.resolutionSummary, null);
  assert.equal(updates[0].$set.resolvedAt, null);
  assert.equal(updates[0].$set.resolvedByUid, null);
  assert.ok(updates[0].$set.slaDueAt instanceof Date);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorType, "customer");
  assert.ok(audits[0].changes.some(change => change.field === "status" && change.to === "Open"));
});

test("customer ticket detail never returns private admin notes", async () => {
  const { ObjectId } = await import("mongodb");
  const ticketId = "507f1f77bcf86cd799439021";
  let messageQuery;
  const userId = new ObjectId("507f1f77bcf86cd799439022");
  const ticket = { _id: new ObjectId(ticketId), userId, status: "Waiting for Customer" };
  const users = {
    findOne: async query => query.uid ? { _id: userId } : null,
    find: () => ({ toArray: async () => [] })
  };
  const tickets = { findOne: async () => ticket };
  const messages = {
    find(query) {
      messageQuery = query;
      return { sort() { return this; }, toArray: async () => [] };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    if (name === "supporttickets") return tickets;
    if (name === "ticketmessages") return messages;
    assert.fail("Unexpected collection: " + name);
  } });

  const result = await connection.getSupportTicket("customer-uid", ticketId);
  assert.equal(result.status, 200);
  assert.deepEqual(messageQuery, { ticketId: ticket._id, isInternalNote: { $ne: true } });
});


test("admin support inbox filters assigned and unassigned tickets safely", async () => {
  let capturedQuery;
  const tickets = {
    find(query) {
      capturedQuery = query;
      return { sort() { return this; }, skip() { return this; }, limit() { return this; }, toArray: async () => [] };
    },
    countDocuments: async () => 0
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "supporttickets") return tickets;
    assert.fail("Unexpected collection: " + name);
  } });

  const assigned = await connection.getAdminSupportTickets("admin-uid", { assignment: "assigned" });
  assert.equal(assigned.status, 200);
  assert.deepEqual(capturedQuery.assignedToUid, { $exists: true, $nin: ["", null] });

  const unassigned = await connection.getAdminSupportTickets("admin-uid", { assignment: "unassigned" });
  assert.equal(unassigned.status, 200);
  assert.ok(capturedQuery.$and[0].$or.some(clause => clause.assignedToUid?.$exists === false));
  assert.ok(capturedQuery.$and[0].$or.some(clause => clause.assignedToUid === null));
  assert.ok(capturedQuery.$and[0].$or.some(clause => clause.assignedToUid === ""));

  const invalid = await connection.getAdminSupportTickets("admin-uid", { assignment: "someone-else" });
  assert.equal(invalid.status, 400);
});


test("photo verification stores only bounded, untrusted browser face assessment metadata", async () => {
  const inserted = [];
  const db = {
    collection(name) {
      if (name === "users") return {
        findOne: async () => ({ uid: "verification-user", isVerified: false, photos: ["https://cdn.example.test/photo.jpg"] })
      };
      if (name === "photoVerifications") return {
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async document => { inserted.push(document); return { insertedId: "verification-id" }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = { VERIFICATION_ENCRYPTION_KEY: "a".repeat(64) };
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.submitPhotoVerification("verification-user", {
    consent: true,
    videoBase64: Buffer.alloc(1024, 1).toString("base64"),
    mimeType: "video/webm",
    challenge: "turn_left",
    clientAssessment: {
      status: "assessed",
      framesAnalyzed: 4,
      framesWithFace: 99,
      profilePhotosCompared: 20,
      bestDistance: 0.42,
      descriptor: Array(128).fill(0.1)
    }
  });

  assert.equal(result.status, 201);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].status, "pending_review");
  assert.deepEqual(inserted[0].automatedAssessment, {
    engine: "@vladmandic/face-api",
    engineVersion: "1.7.15",
    source: "user_browser_untrusted",
    status: "client_assessed",
    framesAnalyzed: 4,
    framesWithFace: 4,
    profilePhotosCompared: 6,
    bestDistance: 0.42,
    challengeAssessment: "not_verified",
    livenessAssessment: "not_verified",
    assessedAt: inserted[0].automatedAssessment.assessedAt
  });
  assert.ok(inserted[0].automatedAssessment.assessedAt instanceof Date);
  assert.equal("descriptor" in inserted[0].automatedAssessment, false);
  assert.equal("clientAssessment" in inserted[0], false);
});

test("photo verification treats missing browser assessment as unavailable and never interprets null distance as zero", async () => {
  const inserted = [];
  const db = {
    collection(name) {
      if (name === "users") return {
        findOne: async () => ({ uid: "verification-user", isVerified: false, photos: ["https://cdn.example.test/photo.jpg"] })
      };
      if (name === "photoVerifications") return {
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async document => { inserted.push(document); return { insertedId: "verification-id" }; }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = { VERIFICATION_ENCRYPTION_KEY: "b".repeat(64) };
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.submitPhotoVerification("verification-user", {
    consent: true,
    videoBase64: Buffer.alloc(1024, 2).toString("base64"),
    mimeType: "video/webm",
    challenge: "smile",
    clientAssessment: {
      status: "assessed",
      framesAnalyzed: 5,
      framesWithFace: 2,
      profilePhotosCompared: 1,
      bestDistance: null
    }
  });

  assert.equal(result.status, 201);
  assert.equal(inserted[0].automatedAssessment.status, "unavailable");
  assert.equal(inserted[0].automatedAssessment.bestDistance, null);
  assert.equal(inserted[0].status, "pending_review");
});


test("reciprocal likes create one match and repeated likes upsert notifications instead of duplicating them", async () => {
  const usersByUid = new Map([
    ["alice", { uid: "alice", blocked: [] }],
    ["bob", { uid: "bob", blocked: [] }]
  ]);
  let match = null;
  const notificationUpserts = [];
  const notificationDeletes = [];
  const db = {
    collection(name) {
      if (name === "users") return {
        async findOne({ uid }) { return usersByUid.get(uid) || null; },
        async updateOne() { return { matchedCount: 1, modifiedCount: 1 }; }
      };
      if (name === "matches") return {
        async findOne(query) {
          if (!match) return null;
          if (query._id) return query._id === match._id ? { ...match, likedBy: [...match.likedBy] } : null;
          const pairMatches = (query.$or || []).some(clause =>
            clause.user1Uid === match.user1Uid && clause.user2Uid === match.user2Uid
          );
          return pairMatches ? { ...match, likedBy: [...match.likedBy] } : null;
        },
        async insertOne(document) {
          match = { ...document, _id: "match-1", likedBy: [...document.likedBy] };
          return { insertedId: "match-1" };
        },
        async updateOne(query, update) {
          if (update.$addToSet?.likedBy && !match.likedBy.includes(update.$addToSet.likedBy)) {
            match.likedBy.push(update.$addToSet.likedBy);
          }
          if (update.$set) Object.assign(match, update.$set);
          return { matchedCount: 1, modifiedCount: 1 };
        }
      };
      if (name === "notifications") return {
        async updateOne(query, update, options) {
          notificationUpserts.push({ query, update, options });
          return { matchedCount: 0, upsertedCount: options?.upsert ? 1 : 0 };
        },
        async deleteOne(query) {
          notificationDeletes.push(query);
          return { deletedCount: 0 };
        }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const firstLike = await connection.recordSwipe("alice", "bob", "like");
  assert.equal(firstLike.status, 200);
  assert.equal(firstLike.body.status, "pending");

  const reciprocalLike = await connection.recordSwipe("bob", "alice", "like");
  assert.equal(reciprocalLike.status, 200);
  assert.equal(reciprocalLike.body.status, "matched");
  assert.deepEqual(match.likedBy.sort(), ["alice", "bob"]);
  assert.equal(notificationUpserts.length, 3);
  assert.ok(notificationUpserts.every(item => item.options.upsert === true));
  assert.ok(notificationUpserts.some(item => item.query.type === "match" && item.query.recipientUid === "alice"));
  assert.ok(notificationUpserts.some(item => item.query.type === "match" && item.query.recipientUid === "bob"));

  const repeatedLike = await connection.recordSwipe("alice", "bob", "like");
  assert.equal(repeatedLike.status, 200);
  assert.equal(repeatedLike.body.status, "matched");
  assert.equal(notificationUpserts.length, 5);
  assert.equal(notificationUpserts.filter(item =>
    item.query.type === "match" && item.query.recipientUid === "bob" && item.query.senderUid === "alice"
  ).length, 2);
  assert.ok(notificationDeletes.length >= 2);
});


test("call lifecycle records declined calls distinctly", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId();
  const call = { _id: id, callerUid: "caller", receiverUid: "receiver", status: "ringing", createdAt: new Date() };
  const calls = {
    async findOne() { return call; },
    async updateOne(_filter, update) { Object.assign(call, update.$set); return { modifiedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    if (name === "callSessions") return calls;
    assert.fail("Unexpected collection: " + name);
  }});
  connection.isCallPairUnavailable = async () => false;
  const result = await connection.updateCall("receiver", { callId: String(id), action: "decline" });
  assert.equal(result.status, 200);
  assert.equal(result.body.call.status, "declined");
  assert.equal(result.body.call.endReason, "declined");
  assert.equal(result.body.call.endedByUid, "receiver");
  assert.ok(result.body.call.endedAt instanceof Date);
});

test("normally ended accepted calls are recorded as completed with duration", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId();
  const connectedAt = new Date(Date.now() - 6500);
  const call = { _id: id, callerUid: "caller", receiverUid: "receiver", status: "accepted", connectedAt, createdAt: connectedAt };
  const calls = {
    async findOne() { return call; },
    async updateOne(_filter, update) { Object.assign(call, update.$set); return { modifiedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    if (name === "callSessions") return calls;
    assert.fail("Unexpected collection: " + name);
  }});
  connection.isCallPairUnavailable = async () => false;
  const result = await connection.updateCall("caller", { callId: String(id), action: "end" });
  assert.equal(result.status, 200);
  assert.equal(result.body.call.status, "ended");
  assert.equal(result.body.call.endReason, "completed");
  assert.equal(result.body.call.endedByUid, "caller");
  assert.ok(result.body.call.durationSeconds >= 6);
});

test("caller cancellation before acceptance is not misreported as a completed call", async () => {
  const { ObjectId } = await import("mongodb");
  const id = new ObjectId();
  const call = { _id: id, callerUid: "caller", receiverUid: "receiver", status: "ringing", createdAt: new Date() };
  const calls = {
    async findOne() { return call; },
    async updateOne(_filter, update) { Object.assign(call, update.$set); return { modifiedCount: 1 }; }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    if (name === "callSessions") return calls;
    assert.fail("Unexpected collection: " + name);
  }});
  connection.isCallPairUnavailable = async () => false;
  const result = await connection.updateCall("caller", { callId: String(id), action: "end" });
  assert.equal(result.status, 200);
  assert.equal(result.body.call.status, "ended");
  assert.equal(result.body.call.endReason, "cancelled");
  assert.equal(result.body.call.durationSeconds, undefined);
});


test("relationship preferences require explicit consent and persist only on the owner's user record", async () => {
  const now = new Date();
  const user = { uid: "desire-owner", birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()), accountStatus: "active" };
  let saved = null;
  const db = {
    collection(name) {
      assert.equal(name, "users");
      return {
        findOne: async () => ({ ...user, relationshipPreferences: saved }),
        updateOne: async (_query, update) => { saved = update.$set.relationshipPreferences; return { matchedCount: 1 }; }
      };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const rejected = await connection.saveRelationshipPreferences("desire-owner", {
    consent: false, relationshipIntent: [], relationshipStyles: [], desires: [], curiosities: [], boundaries: []
  });
  assert.equal(rejected.status, 400);
  assert.equal(saved, null);

  const result = await connection.saveRelationshipPreferences("desire-owner", {
    consent: true,
    relationshipIntent: ["exploring", "casual_dating"],
    relationshipStyles: ["ethical_non_monogamy"],
    desires: ["roleplay", "sensory_experiences"],
    curiosities: ["new_experiences"],
    boundaries: ["no_pressure", "privacy_first"]
  });
  assert.equal(result.status, 200);
  assert.equal(saved.consent, true);
  assert.deepEqual(saved.relationshipIntent, ["exploring", "casual_dating"]);
  assert.deepEqual(saved.desires, ["roleplay", "sensory_experiences"]);
  assert.deepEqual(saved.visibility, {
    relationshipIntent: "private", relationshipStyles: "private",
    desires: "private", curiosities: "private", boundaries: "private"
  });

  const fetched = await connection.getRelationshipPreferences("desire-owner");
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.boundaries, ["no_pressure", "privacy_first"]);
});


test("Discover softly ranks only mutually public relationship intent and styles", async () => {
  const viewer = {
    uid: "viewer",
    preference: "everyone",
    blocked: [],
    relationshipPreferences: {
      consent: true,
      relationshipIntent: ["long_term"],
      relationshipStyles: ["monogamy"],
      desires: ["private_desire"],
      curiosities: ["private_curiosity"],
      boundaries: ["private_boundary"],
      visibility: { relationshipIntent: "public", relationshipStyles: "private" }
    }
  };
  const candidates = [
    {
      uid: "private-match", name: "Private Match", isProfileVisible: true,
      relationshipPreferences: {
        consent: true, relationshipIntent: ["long_term"], relationshipStyles: ["monogamy"],
        desires: ["secret"], visibility: { relationshipIntent: "private", relationshipStyles: "private" }
      }
    },
    {
      uid: "public-match", name: "Public Match", isProfileVisible: true,
      relationshipPreferences: {
        consent: true, relationshipIntent: ["long_term"], relationshipStyles: ["monogamy"],
        desires: ["secret"], curiosities: ["secret"], boundaries: ["secret"],
        visibility: { relationshipIntent: "public", relationshipStyles: "private" }
      }
    },
    {
      uid: "public-nonmatch", name: "Public Nonmatch", isProfileVisible: true,
      relationshipPreferences: {
        consent: true, relationshipIntent: ["casual"], relationshipStyles: ["monogamy"],
        visibility: { relationshipIntent: "public", relationshipStyles: "public" }
      }
    }
  ];
  const users = {
    findOne: async ({ uid }) => uid === viewer.uid ? viewer : null,
    aggregate: () => ({ toArray: async () => candidates.map(candidate => ({ uid: candidate.uid })) }),
    find: () => ({ toArray: async () => candidates })
  };
  const matches = {
    createIndex: async () => "index-created",
    find: () => ({ project() { return this; }, toArray: async () => [] })
  };
  const db = {
    collection(name) {
      if (name === "users") return users;
      if (name === "matches") return matches;
      assert.fail(`Unexpected collection: ${name}`);
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers(viewer.uid, {});

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.map(profile => profile.uid), [
    "public-match", "private-match", "public-nonmatch"
  ]);
  assert.deepEqual(result.body[0].relationshipDiscovery, {
    relationshipIntent: ["long_term"]
  });
  assert.equal(Object.hasOwn(result.body[1], "relationshipDiscovery"), false);
  assert.doesNotMatch(JSON.stringify(result.body), /private_desire|private_curiosity|private_boundary|secret/);
});

test("relationship preference visibility exposes only explicitly public intent and styles", async () => {
  const now = new Date();
  const target = {
    uid: "visibility-target", name: "Target", gender: "Female", isProfileVisible: true, blocked: [],
    relationshipPreferences: {
      consent: true,
      relationshipIntent: ["long_term"],
      relationshipStyles: ["monogamy"],
      desires: ["roleplay"],
      curiosities: ["new_experiences"],
      boundaries: ["privacy_first"],
      visibility: { relationshipIntent: "public", relationshipStyles: "private" }
    }
  };
  const viewer = { uid: "visibility-viewer", role: "user", blocked: [] };
  const db = { collection: () => ({ findOne: async ({ uid }) => uid === target.uid ? target : viewer }) };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.getUserProfile(target.uid, viewer.uid);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.relationshipDiscovery, { relationshipIntent: ["long_term"] });
  assert.equal(Object.hasOwn(result.body, "relationshipPreferences"), false);
  assert.equal(JSON.stringify(result.body).includes("roleplay"), false);
  assert.equal(JSON.stringify(result.body).includes("privacy_first"), false);
});

test("relationship preference visibility rejects attempts to publish desires, curiosities or boundaries", async () => {
  const now = new Date();
  const user = { uid: "visibility-owner", birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()), accountStatus: "active" };
  let writes = 0;
  const db = { collection: () => ({
    findOne: async () => user,
    updateOne: async () => { writes++; return { matchedCount: 1 }; }
  }) };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.saveRelationshipPreferences("visibility-owner", {
    consent: true, relationshipIntent: [], relationshipStyles: [], desires: [], curiosities: [], boundaries: [],
    visibility: { desires: "public" }
  });
  assert.equal(result.status, 400);
  assert.equal(writes, 0);
});

test("relationship preferences reject underage accounts and unknown catalogue values", async () => {
  const underageUser = { uid: "young-user", birthday: new Date(Date.now() - 17 * 365.25 * 24 * 60 * 60 * 1000), accountStatus: "active" };
  let writes = 0;
  const db = {
    collection() {
      return {
        findOne: async () => underageUser,
        updateOne: async () => { writes++; return { matchedCount: 1 }; }
      };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const payload = { consent: true, relationshipIntent: [], relationshipStyles: [], desires: ["unknown_tag"], curiosities: [], boundaries: [] };
  const invalid = await connection.saveRelationshipPreferences("young-user", payload);
  assert.equal(invalid.status, 400);
  assert.equal(writes, 0);

  const underage = await connection.getRelationshipPreferences("young-user");
  assert.equal(underage.status, 403);
  assert.equal(writes, 0);
});

test("relationship preferences are excluded from other members' public profile responses", async () => {
  const target = {
    uid: "desire-target", name: "Target", gender: "Female", isProfileVisible: true,
    relationshipPreferences: { consent: true, desires: ["roleplay"], boundaries: ["privacy_first"] },
    blocked: []
  };
  const viewer = { uid: "profile-viewer", role: "user", blocked: [] };
  const db = {
    collection(name) {
      assert.equal(name, "users");
      return { findOne: async ({ uid }) => uid === target.uid ? target : viewer };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  connection.getMediaUrl = value => value;

  const response = await connection.getUserProfile(target.uid, viewer.uid);
  assert.equal(response.status, 200);
  assert.equal(response.body.relationshipPreferences, undefined);
});

test("GPS location updates require accurate coordinates and store private GeoJSON with explicit opt-in", async () => {
  let stored;
  const user = { _id: "location-user-id", uid: "location-user", birthday: new Date("1990-01-01T00:00:00.000Z"), location: { city: "Dubai", country: "United Arab Emirates" } };
  const users = {
    findOne: async () => user,
    updateOne: async (_query, update) => { stored = update.$set; return { matchedCount: 1 }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => { assert.equal(name, "users"); return users; } });
  const result = await connection.saveUserLocation("location-user", { latitude: 25.2048, longitude: 55.2708, accuracyMeters: 35 });
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, true);
  assert.deepEqual(stored.location.coordinates, [55.2708, 25.2048]);
  assert.equal(stored.location.type, "Point");
  assert.equal(stored.location.city, "Dubai");
  assert.equal(stored.locationSharing.enabled, true);
  assert.equal(stored.locationSharing.source, "browser_geolocation");
  assert.equal("coordinates" in result.body, false);
});

test("GPS location updates reject inaccurate or out-of-range coordinates", async () => {
  let databaseAccessed = false;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => { databaseAccessed = true; return {}; };
  const inaccurate = await connection.saveUserLocation("location-user", { latitude: 25, longitude: 55, accuracyMeters: 5001 });
  const invalid = await connection.saveUserLocation("location-user", { latitude: 91, longitude: 55, accuracyMeters: 10 });
  assert.equal(inaccurate.status, 400);
  assert.equal(invalid.status, 400);
  assert.equal(databaseAccessed, false);
});

test("disabling GPS location removes coordinates while preserving approximate city metadata", async () => {
  let update;
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return {
      findOne: async () => ({ _id: "location-user-id", location: { type: "Point", coordinates: [55.27, 25.2], city: "Dubai", country: "United Arab Emirates" } }),
      updateOne: async (_query, value) => { update = value; return { matchedCount: 1 }; }
    };
  } });
  const result = await connection.deleteUserLocation("location-user");
  assert.equal(result.status, 200);
  assert.equal(update.$set.location.city, "Dubai");
  assert.equal(update.$set.location.country, "United Arab Emirates");
  assert.equal("coordinates" in update.$set.location, false);
  assert.equal(update.$set.locationSharing.enabled, false);
});

test("profile APIs hide precise GPS coordinates and location consent metadata from administrators", async () => {
  const target = {
    uid: "gps-target", name: "Target", isProfileVisible: true, blocked: [],
    location: { type: "Point", coordinates: [55.27, 25.2], city: "Dubai", country: "United Arab Emirates" },
    locationSharing: { enabled: true, updatedAt: new Date() },
    relationshipPreferences: { consent: true, desires: ["adventure"] }
  };
  const admin = { uid: "gps-admin", role: "superadmin", blocked: [] };
  const db = { collection: name => {
    assert.equal(name, "users");
    return { findOne: async query => query.uid === "gps-target" ? target : admin };
  } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  const result = await connection.getUserProfile("gps-target", "gps-admin");
  assert.equal(result.status, 200);
  assert.equal(result.body.location.city, "Dubai");
  assert.equal(result.body.location.coordinates, undefined);
  assert.equal(result.body.location.type, undefined);
  assert.equal(result.body.locationSharing, undefined);
  assert.equal(result.body.relationshipPreferences, undefined);
});

test("Discover supports coarse city and country filters without GPS", async () => {
  let capturedMatch;
  const users = {
    findOne: async ({ uid }) => ({ uid, gender: "Female", preference: "everyone", blocked: [] }),
    aggregate: pipeline => { capturedMatch = pipeline[0].$match; return { toArray: async () => [] }; }
  };
  const db = { collection(name) { if (name === "users") return users; if (name === "matches") return { createIndex: async () => "ok" }; assert.fail(`Unexpected collection: ${name}`); } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {}; connection.getClient = async () => ({}); connection.getDatabase = () => db;
  const result = await connection.discoverUsers("viewer", { city: "New York", country: "United States" });
  assert.equal(result.status, 200);
  assert.deepEqual(capturedMatch["location.city"], { $regex: "New York", $options: "i" });
  assert.deepEqual(capturedMatch["location.country"], { $regex: "United States", $options: "i" });
});

test("Discover escapes regex metacharacters in city and country filters", async () => {
  let capturedMatch;
  const users = {
    findOne: async ({ uid }) => ({ uid, gender: "Female", preference: "everyone", blocked: [] }),
    aggregate: pipeline => { capturedMatch = pipeline[0].$match; return { toArray: async () => [] }; }
  };
  const db = { collection(name) { if (name === "users") return users; if (name === "matches") return { createIndex: async () => "ok" }; assert.fail(`Unexpected collection: ${name}`); } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {}; connection.getClient = async () => ({}); connection.getDatabase = () => db;
  const result = await connection.discoverUsers("viewer", { city: "New.*York" });
  assert.equal(result.status, 200);
  assert.equal(capturedMatch["location.city"].$regex, "New\\.\\*York");
});


test("location status marks GPS data stale after 24 hours without returning coordinates", async () => {
  const users = {
    findOne: async () => ({
      uid: "stale-location-user",
      locationSharing: { enabled: true, updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), accuracyMeters: 40 },
      location: { type: "Point", coordinates: [55.27, 25.2] }
    })
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return users;
  } });
  const result = await connection.getUserLocationStatus("stale-location-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, true);
  assert.equal(result.body.stale, true);
  assert.equal(result.body.accuracyMeters, 40);
  assert.equal("coordinates" in result.body, false);
});

test("location status marks future-dated GPS data stale without returning coordinates", async () => {
  const users = {
    findOne: async () => ({
      uid: "future-location-user",
      locationSharing: { enabled: true, updatedAt: new Date(Date.now() + 60 * 60 * 1000), accuracyMeters: 35 },
      location: { type: "Point", coordinates: [55.27, 25.2] }
    })
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return users;
  } });
  const result = await connection.getUserLocationStatus("future-location-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, true);
  assert.equal(result.body.stale, true);
  assert.equal(result.body.accuracyMeters, 35);
  assert.equal("coordinates" in result.body, false);
});

test("location status does not mark revoked GPS sharing as active or stale", async () => {
  const users = {
    findOne: async () => ({
      uid: "revoked-location-user",
      locationSharing: { enabled: false, revokedAt: new Date() }
    })
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return users;
  } });
  const result = await connection.getUserLocationStatus("revoked-location-user");
  assert.equal(result.status, 200);
  assert.equal(result.body.enabled, false);
  assert.equal(result.body.stale, false);
  assert.equal("coordinates" in result.body, false);
});

test("GPS location updates reject underage users before storing coordinates", async () => {
  let writes = 0;
  const users = {
    findOne: async () => ({
      _id: "underage-location-id",
      uid: "underage-location-user",
      birthday: new Date(Date.now() - 17 * 365.25 * 24 * 60 * 60 * 1000)
    }),
    updateOne: async () => { writes++; return { matchedCount: 1 }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return users;
  } });
  const result = await connection.saveUserLocation("underage-location-user", {
    latitude: 25.2, longitude: 55.27, accuracyMeters: 30
  });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});


test("Discover rejects stale GPS coordinates before running a distance query", async () => {
  const currentUser = {
    uid: "stale-viewer", gender: "Male", preference: "everyone", blocked: [],
    location: { type: "Point", coordinates: [55.27, 25.2] },
    locationSharing: { enabled: true, updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
  };
  let aggregateCalled = false;
  const db = { collection: name => {
    assert.equal(name, "users");
    return {
      findOne: async () => currentUser,
      aggregate: async () => { aggregateCalled = true; throw new Error("must not query stale GPS"); }
    };
  } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {}; connection.getClient = async () => ({}); connection.getDatabase = () => db;
  const result = await connection.discoverUsers("stale-viewer", { maxDistance: 25 });
  assert.equal(result.status, 409);
  assert.equal(aggregateCalled, false);
});

test("Discover rejects future-dated GPS timestamps before running a distance query", async () => {
  const currentUser = {
    uid: "future-viewer", gender: "Male", preference: "everyone", blocked: [],
    location: { type: "Point", coordinates: [55.27, 25.2] },
    locationSharing: { enabled: true, updatedAt: new Date(Date.now() + 60 * 60 * 1000) }
  };
  let aggregateCalled = false;
  const db = { collection: name => {
    assert.equal(name, "users");
    return {
      findOne: async () => currentUser,
      aggregate: async () => { aggregateCalled = true; throw new Error("must not query future-dated GPS"); }
    };
  } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {}; connection.getClient = async () => ({}); connection.getDatabase = () => db;
  const result = await connection.discoverUsers("future-viewer", { maxDistance: 25 });
  assert.equal(result.status, 409);
  assert.equal(aggregateCalled, false);
});


test("Discover excludes candidates with future-dated GPS timestamps from distance results", async () => {
  let capturedPipeline;
  const currentUser = {
    uid: "location-viewer", gender: "Male", preference: "everyone", blocked: [],
    location: { type: "Point", coordinates: [55.27, 25.2] },
    locationSharing: { enabled: true, updatedAt: new Date() }
  };
  const users = {
    findOne: async () => currentUser,
    createIndex: async () => "index-created",
    aggregate: pipeline => {
      capturedPipeline = pipeline;
      return { toArray: async () => [] };
    }
  };
  const matches = { createIndex: async () => "index-created" };
  const db = { collection: name => {
    if (name === "users") return users;
    if (name === "matches") return matches;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.discoverUsers("location-viewer", { maxDistance: 25 });

  assert.equal(result.status, 200);
  const geoNear = capturedPipeline[0].$geoNear;
  assert.deepEqual(geoNear.near, { type: "Point", coordinates: [55.27, 25.2] });
  assert.equal(geoNear.maxDistance, 25 * 1000);
  assert.equal(geoNear.query["locationSharing.enabled"], true);
  const freshness = geoNear.query["locationSharing.updatedAt"];
  assert.ok(freshness.$gte instanceof Date);
  assert.ok(freshness.$lte instanceof Date);
  assert.ok(freshness.$gte.getTime() >= Date.now() - 24 * 60 * 60 * 1000 - 1000);
  assert.ok(freshness.$lte.getTime() <= Date.now());
});


test("partner links require an adult invitee's explicit acceptance and either member can revoke", async () => {
  const { ObjectId } = await import("mongodb");
  const now = new Date();
  const adult = uid => ({
    uid,
    birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()),
    accountStatus: "active",
    relationshipPreferences: { consent: true, boundaries: [] }
  });
  const members = [adult("partner-a"), adult("partner-b")];
  const records = [];
  let indexSpec;
  const links = {
    createIndex: async (spec, options) => { indexSpec = { spec, options }; return "one_active_partner_link_per_member"; },
    findOne: async query => {
      if (query._id) return records.find(record =>
        String(record._id) === String(query._id) && record.memberUids.includes(query.memberUids)
      ) || null;
      if (query.memberUids?.$in) return records.find(record =>
        record.activeKey && record.memberUids.some(uid => query.memberUids.$in.includes(uid))
      ) || null;
      return null;
    },
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => records.slice() }) }) }),
    insertOne: async document => {
      const record = { ...document, _id: new ObjectId() };
      records.push(record);
      return { insertedId: record._id };
    },
    updateOne: async (query, update) => {
      const record = records.find(item => String(item._id) === String(query._id) &&
        item.status === query.status &&
        (query.inviteeUid ? item.inviteeUid === query.inviteeUid : item.memberUids.includes(query.memberUids)));
      if (!record) return { modifiedCount: 0 };
      Object.assign(record, update.$set || {});
      for (const key of Object.keys(update.$unset || {})) delete record[key];
      return { modifiedCount: 1 };
    }
  };
  const db = {
    collection: name => {
      if (name === "partnerLinks") return links;
      if (name === "users") return { findOne: async ({ uid }) => members.find(member => member.uid === uid) || null };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const invited = await connection.managePartnerLink("partner-a", "invite", { targetUid: "partner-b" });
  assert.equal(invited.status, 201);
  assert.equal(invited.body.status, "pending");
  assert.equal(indexSpec.options.unique, true);
  assert.deepEqual(indexSpec.spec, { memberUids: 1 });

  const linkId = invited.body.id;
  const wrongActor = await connection.managePartnerLink("partner-a", "accept", { linkId });
  assert.equal(wrongActor.status, 403);

  const accepted = await connection.managePartnerLink("partner-b", "accept", { linkId });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.status, "accepted");
  assert.equal(records[0].activeKey !== undefined, true);

  const revoked = await connection.managePartnerLink("partner-a", "revoke", { linkId });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.status, "revoked");
  assert.equal(records[0].activeKey, undefined);

  const listed = await connection.managePartnerLink("partner-b", "list");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.links[0].status, "revoked");
});

test("partner links reject requests when either member has disabled partner linking", async () => {
  const now = new Date();
  const adult = uid => ({
    uid,
    birthday: new Date(now.getFullYear() - 30, now.getMonth(), now.getDate()),
    accountStatus: "active",
    relationshipPreferences: { boundaries: uid === "partner-b" ? ["no_partner_linking"] : [] }
  });
  const users = [adult("partner-a"), adult("partner-b")];
  let inserted = false;
  const links = {
    createIndex: async () => "index",
    findOne: async () => null,
    insertOne: async () => { inserted = true; return { insertedId: "unused" }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => name === "users"
    ? { findOne: async ({ uid }) => users.find(user => user.uid === uid) || null }
    : links
  });
  const result = await connection.managePartnerLink("partner-a", "invite", { targetUid: "partner-b" });
  assert.equal(result.status, 403);
  assert.equal(inserted, false);
});


test("refreshing GPS updates freshness without resetting the original consent timestamp", async () => {
  const consentAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const user = {
    _id: "location-consent-user",
    uid: "location-consent-user",
    birthday: new Date(Date.now() - 30 * 365.25 * 24 * 60 * 60 * 1000),
    location: { type: "Point", coordinates: [55.27, 25.2], city: "Dubai" },
    locationSharing: { enabled: true, source: "browser_geolocation", consentAt, updatedAt: consentAt }
  };
  let saved;
  const users = {
    findOne: async () => user,
    updateOne: async (_query, update) => { saved = update.$set; return { matchedCount: 1 }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return users;
  } });

  const result = await connection.saveUserLocation("location-consent-user", {
    latitude: 25.21, longitude: 55.28, accuracyMeters: 25
  });

  assert.equal(result.status, 200);
  assert.equal(saved.locationSharing.consentAt, consentAt);
  assert.ok(saved.locationSharing.updatedAt instanceof Date);
  assert.ok(saved.locationSharing.updatedAt.getTime() > consentAt.getTime());
  assert.deepEqual(saved.location.coordinates, [55.28, 25.21]);
});

test("withdrawing relationship discovery consent removes all saved sensitive preferences", async () => {
  let update;
  const user = {
    uid: "consent-owner",
    relationshipPreferences: {
      consent: true,
      relationshipIntent: ["long_term"],
      relationshipStyles: ["monogamy"],
      desires: ["roleplay"],
      curiosities: ["new_experiences"],
      boundaries: ["privacy_first"]
    }
  };
  const users = {
    findOne: async () => user,
    updateOne: async (_query, value) => {
      update = value;
      delete user.relationshipPreferences;
      return { matchedCount: 1 };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: name => {
    assert.equal(name, "users");
    return users;
  } });

  const result = await connection.deleteRelationshipPreferences("consent-owner");

  assert.equal(result.status, 200);
  assert.equal(result.body.consentRevoked, true);
  assert.deepEqual(update.$unset, { relationshipPreferences: "" });
  assert.ok(update.$set.updatedAt instanceof Date);
  assert.equal(Object.hasOwn(user, "relationshipPreferences"), false);
});


test("account deletion retries safely when Firebase chat access revocation fails", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId();
  const updates = [];
  const user = {
    _id: targetId, uid: "deleting-user", role: "user",
    accountStatus: "active", deletionRequestedAt: null,
    firebaseAuthDeletionStatus: null
  };
  const users = {
    findOne: async () => user,
    updateOne: async (query, update) => { updates.push(update); return { matchedCount: 1 }; }
  };
  const collection = name => ({
    distinct: async () => [],
    updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }),
    deleteOne: async () => ({ deletedCount: 0 }),
    deleteMany: async () => ({ deletedCount: 0 }),
    updateOne: async () => ({ matchedCount: 1 })
  });
  const db = { collection(name) { return name === "users" ? users : collection(name); } };
  const client = {
    startSession() {
      return {
        withTransaction: async callback => callback(),
        endSession: async () => {}
      };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {
    FIREBASE_PROJECT_ID: "test-project",
    FIREBASE_DATABASE_URL: "https://test-project-default-rtdb.firebaseio.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: "test-project",
      client_email: "firebase-admin@test-project.iam.gserviceaccount.com",
      private_key: "INVALID PRIVATE KEY"
    })
  };
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => client;
  connection.getDatabase = () => db;

  const result = await connection.deleteAdminUser("admin-uid", targetId.toHexString());

  assert.equal(result.status, 202);
  assert.equal(result.body.deletionStatus, "deletion_pending");
  assert.equal(result.body.chatAccessRevocationStatus, "retry_pending");
  assert.ok(updates.some(update => update.$set?.chatAccessRevocationStatus === "retry_pending"));
  assert.equal(user.accountStatus, "active",
    "the transaction mock does not mutate the original user; the operation is still expected to record the pending status");
});


test("admin can suspend a user with a bounded expiry and hide the profile", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let capturedUpdate;
  const users = {
    async findOne() {
      return {
        _id: targetId, uid: "suspension-target", role: "user",
        accountStatus: "active", isProfileVisible: true
      };
    },
    async findOneAndUpdate(_filter, update) {
      capturedUpdate = update;
      return { _id: targetId, uid: "suspension-target", accountStatus: "temporarily_suspended" };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  const cleanupCollection = {
    async deleteMany() { return { deletedCount: 0 }; },
    async updateMany() { return { modifiedCount: 0 }; }
  };
  const auditCollection = {
    async insertOne() { return { insertedId: "lifecycle-audit-id" }; },
    async updateOne() { return { matchedCount: 1 }; }
  };
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    if (name === "auditlogs") return auditCollection;
    return cleanupCollection;
  } });
  const until = new Date(Date.now() + 2 * 86400000).toISOString();
  const result = await connection.updateAdminUser("admin-uid", targetId.toHexString(), {
    accountStatus: "temporarily_suspended", suspendedUntil: until
  });
  assert.equal(result.status, 200);
  assert.equal(capturedUpdate.$set.accountStatus, "temporarily_suspended");
  assert.ok(capturedUpdate.$set.suspendedUntil instanceof Date);
  assert.equal(capturedUpdate.$set.isProfileVisible, false);
  assert.equal(capturedUpdate.$set.profileVisibilityBeforeSuspension, true);
});

test("admin cannot set invalid or expired account suspension dates", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let writes = 0;
  const users = {
    async findOne() { return { _id: targetId, uid: "target", role: "user", accountStatus: "active" }; },
    async findOneAndUpdate() { writes++; return { _id: targetId }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  for (const suspendedUntil of ["not-a-date", new Date(Date.now() - 1000).toISOString(),
    new Date(Date.now() + 4000 * 86400000).toISOString()]) {
    const result = await connection.updateAdminUser("admin-uid", targetId.toHexString(), {
      accountStatus: "temporarily_suspended", suspendedUntil
    });
    assert.equal(result.status, 400);
  }
  assert.equal(writes, 0);
});

test("only superadmins can restore a permanently banned account", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let writes = 0;
  const users = {
    async findOne() { return { _id: targetId, uid: "target", role: "user", accountStatus: "permanently_banned" }; },
    async findOneAndUpdate() { writes++; return { _id: targetId }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  const result = await connection.updateAdminUser("admin-uid", targetId.toHexString(), { accountStatus: "active" });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});


test("admin suspension fails closed with retry status when Firebase membership revocation fails", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  const userWrites = [];
  const users = {
    async findOne() {
      return { _id: targetId, uid: "suspension-target", role: "user", accountStatus: "active", isProfileVisible: true };
    },
    async findOneAndUpdate(_filter, update) {
      userWrites.push(update);
      return { _id: targetId, uid: "suspension-target", accountStatus: "temporarily_suspended" };
    },
    async updateOne(_filter, update) { userWrites.push(update); return { matchedCount: 1 }; }
  };
  const emptyCollection = {
    async distinct() { return []; },
    async insertOne() { return { insertedId: "lifecycle-audit-id" }; },
    async updateOne() { return { matchedCount: 1 }; },
    async deleteMany() { return { deletedCount: 0 }; },
    async updateMany() { return { modifiedCount: 0 }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {
    FIREBASE_DATABASE_URL: "https://test-project-default-rtdb.firebaseio.com",
    FIREBASE_PROJECT_ID: "test-project",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: "test-project",
      client_email: "firebase-admin@test-project.iam.gserviceaccount.com",
      private_key: "not-a-valid-private-key"
    })
  };
  connection.requireAdmin = async () => ({ status: 200, role: "admin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "users") return users;
    return emptyCollection;
  } });
  const result = await connection.updateAdminUser("admin-uid", targetId.toHexString(), {
    accountStatus: "temporarily_suspended",
    suspendedUntil: new Date(Date.now() + 86400000).toISOString()
  });
  assert.equal(result.status, 202);
  assert.equal(result.body.accountStatus, "temporarily_suspended");
  assert.equal(result.body.chatAccessRevocationStatus, "retry_pending");
  assert.ok(userWrites.some(update => update.$set?.chatAccessRevocationStatus === "retry_pending"));
});


test("superadmin can restore a temporary suspension and restore prior profile visibility", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let capturedUpdate;
  const users = {
    async findOne() {
      return {
        _id: targetId, uid: "target", role: "user",
        accountStatus: "temporarily_suspended",
        suspendedUntil: new Date(Date.now() + 86400000),
        profileVisibilityBeforeSuspension: true,
        isProfileVisible: false
      };
    },
    async findOneAndUpdate(_filter, update) {
      capturedUpdate = update;
      return { _id: targetId, uid: "target", accountStatus: "active", isProfileVisible: true };
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({});
  const auditCollection = {
    async insertOne() { return { insertedId: "restore-audit-id" }; },
    async updateOne() { return { matchedCount: 1 }; }
  };
  connection.getDatabase = () => ({ collection(name) {
    return name === "users" ? users : auditCollection;
  } });
  const result = await connection.updateAdminUser("superadmin-uid", targetId.toHexString(), {
    accountStatus: "active"
  });
  assert.equal(result.status, 200);
  assert.equal(capturedUpdate.$set.accountStatus, "active");
  assert.equal(capturedUpdate.$set.isProfileVisible, true);
  assert.equal(capturedUpdate.$unset.suspendedUntil, "");
  assert.equal(capturedUpdate.$unset.profileVisibilityBeforeSuspension, "");
});


test("admin account management cannot reactivate an account in the deletion lifecycle", async () => {
  const { ObjectId } = await import("mongodb");
  const targetId = new ObjectId("abcdef0123456789abcdef01");
  let writes = 0;
  let target = {
    _id: targetId, uid: "target", role: "user",
    accountStatus: "deletion_pending", deletionRequestedAt: new Date()
  };
  const users = {
    async findOne() { return target; },
    async findOneAndUpdate() { writes++; return { _id: targetId }; }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.env = {};
  connection.requireAdmin = async () => ({ status: 200, role: "superadmin" });
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection: () => users });
  const result = await connection.updateAdminUser("superadmin-uid", targetId.toHexString(), {
    accountStatus: "active"
  });
  assert.equal(result.status, 409);
  assert.equal(writes, 0);
});
