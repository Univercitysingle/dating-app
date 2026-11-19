import assert from "node:assert/strict";
import test from "node:test";
import { MongoDBConnection } from "./mongodb-connection.js";
import { enforceAccountRateLimit } from "./index.js";

function makeConnection(db) {
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  return connection;
}

test("blocking a user records the block and terminates the pair's active match", async () => {
  const updates = [];
  const users = {
    async findOne(query) {
      return query.uid === "target-user" ? { _id: "target-id" } : null;
    },
    async updateOne(query, update) {
      updates.push({ query, update });
      return { matchedCount: 1 };
    }
  };
  let matchUpdate;
  const matches = {
    async updateOne(query, update) {
      matchUpdate = { query, update };
      return { matchedCount: 1 };
    }
  };
  const db = { collection(name) {
    if (name === "users") return users;
    if (name === "matches") return matches;
    if (name === "chatmessages") return { async findOne() { return { roomId: "current-user-target-user" }; } };
    assert.fail("Unexpected collection: " + name);
  } };
  const result = await makeConnection(db).updateBlockedUser("current-user", "target-user", "block");
  assert.equal(result.status, 200);
  assert.deepEqual(updates[0], {
    query: { uid: "current-user" },
    update: { $addToSet: { blocked: "target-user" } }
  });
  assert.deepEqual(matchUpdate.query, { user1Uid: "current-user", user2Uid: "target-user" });
  assert.equal(matchUpdate.update.$set.status, "unmatched");
  assert.equal(matchUpdate.update.$unset.likedBy, "");
});

test("blocking or unmatching oneself is rejected before database access", async () => {
  let accessed = false;
  const db = { collection() { accessed = true; return {}; } };
  const connection = makeConnection(db);
  assert.equal((await connection.updateBlockedUser("same-user", "same-user", "block")).status, 400);
  assert.equal((await connection.unmatchUsers("same-user", "same-user")).status, 400);
  assert.equal(accessed, false);
});

test("unmatch only changes an active match and records who initiated it", async () => {
  let captured;
  const matches = {
    async updateOne(query, update) {
      captured = { query, update };
      return { matchedCount: 1 };
    }
  };
  const db = { collection(name) {
    if (name === "matches") return matches;
    if (name === "chatmessages") return { async findOne() { return { roomId: "a-user-z-user" }; } };
    assert.fail("Unexpected collection: " + name);
  } };
  const result = await makeConnection(db).unmatchUsers("z-user", "a-user");
  assert.equal(result.status, 200);
  assert.deepEqual(captured.query, { user1Uid: "a-user", user2Uid: "z-user", status: "matched" });
  assert.equal(captured.update.$set.unmatchedBy, "z-user");
  assert.ok(captured.update.$set.unmatchedAt instanceof Date);
});

test("admin audit history includes moderation events stored with actorUid and targetUid", async () => {
  const moderationEvent = {
    _id: "audit-1",
    eventType: "moderation_action",
    actorUid: "admin-user",
    targetUid: "reported-user",
    action: "suspend_user",
    outcome: "completed",
    createdAt: new Date("2026-11-07T00:00:00.000Z")
  };
  const auditlogs = {
    aggregate() {
      return { async toArray() { return []; } };
    },
    find(query) {
      assert.deepEqual(query, { eventType: "moderation_action" });
      return {
        sort() { return this; },
        limit() { return this; },
        async toArray() { return [moderationEvent]; }
      };
    }
  };
  const users = {
    find(query) {
      assert.deepEqual(query, { uid: { $in: ["admin-user", "reported-user"] } });
      return {
        async toArray() {
          return [
            { uid: "admin-user", name: "Moderator", role: "admin" },
            { uid: "reported-user", name: "Reported Account", role: "user" }
          ];
        }
      };
    }
  };
  const db = { collection(name) {
    if (name === "auditlogs") return auditlogs;
    if (name === "users") return users;
    assert.fail("Unexpected collection: " + name);
  } };
  const connection = makeConnection(db);
  connection.requireAdmin = async () => ({ status: 200, body: { success: true } });
  const result = await connection.getAdminLogs("admin-user", "audit");
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].adminId.name, "Moderator");
  assert.equal(result.body[0].action, "suspend_user");
  assert.equal(result.body[0].targetType, "user");
  assert.equal(result.body[0].targetId, "reported-user");
  assert.equal(result.body[0].timestamp, moderationEvent.createdAt);
});

test("account-scoped moderation limits fail closed when the limiter binding is missing", async () => {
  const response = await enforceAccountRateLimit({}, "report-user", "reporter", 3, 3600000, "Report limit reached.");
  assert.equal(response.status, 503);
});

test("account-scoped moderation limits return 429 and Retry-After when exhausted", async () => {
  const env = {
    RATE_LIMITER: {
      idFromName(name) { assert.equal(name, "block-user:reporter"); return "limiter-id"; },
      get(id) {
        assert.equal(id, "limiter-id");
        return { async fetch() {
          return new Response(JSON.stringify({ allowed: false, resetAt: Date.now() + 30000 }), { status: 200 });
        } };
      }
    }
  };
  const response = await enforceAccountRateLimit(env, "block-user", "reporter", 20, 3600000, "Block limit reached.");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.deepEqual(await response.json(), { error: "Block limit reached." });
});

test("account-scoped moderation limits fail closed when the limiter service errors", async () => {
  const env = { RATE_LIMITER: {
    idFromName() { return "limiter-id"; },
    get() { return { async fetch() { throw new Error("storage unavailable"); } }; }
  } };
  const response = await enforceAccountRateLimit(env, "unmatch-user", "reporter", 20, 3600000, "Unmatch limit reached.");
  assert.equal(response.status, 503);
});

test("regular users cannot read admin moderation audit history", async () => {
  const db = { collection() { assert.fail("Database query must not run for a non-admin"); } };
  const connection = makeConnection(db);
  connection.requireAdmin = async () => ({ status: 403, body: { message: "Forbidden" } });
  const result = await connection.getAdminLogs("ordinary-user", "audit");
  assert.equal(result.status, 403);
});


test("report moderation cannot demote admins, alter superadmins, or revive deleted accounts", async () => {
  async function attempt({ actorRole, targetRole, targetStatus, action = "ban_user" }) {
    let auditWrites = 0;
    let accountWrites = 0;
    const db = {
      collection(name) {
        if (name === "users") return {
          async findOne(query) {
            if (query.uid === "moderator") return { uid: "moderator", role: actorRole };
            if (query.uid === "reported") return {
              uid: "reported", role: targetRole, accountStatus: targetStatus,
              _id: "target-id", isProfileVisible: true
            };
            return null;
          },
          async updateOne() { accountWrites += 1; return { matchedCount: 1 }; }
        };
        if (name === "reports") return {
          async findOne() { return { _id: "0123456789abcdef01234567", reportedUserUid: "reported" }; },
          async updateOne() { return { matchedCount: 1 }; }
        };
        if (name === "auditlogs") return {
          async insertOne() { auditWrites += 1; return { insertedId: "audit-id" }; },
          async updateOne() { return { matchedCount: 1 }; }
        };
        assert.fail("Unexpected collection: " + name);
      }
    };
    const connection = makeConnection(db);
    const result = await connection.moderateReport(
      "moderator", "0123456789abcdef01234567",
      { action, ...(action === "suspend_user" ? { durationDays: 7 } : {}) }
    );
    return { result, auditWrites, accountWrites };
  }

  const adminTarget = await attempt({ actorRole: "admin", targetRole: "admin", targetStatus: "active" });
  assert.equal(adminTarget.result.status, 403);
  assert.equal(adminTarget.auditWrites, 0);
  assert.equal(adminTarget.accountWrites, 0);

  const superadminTarget = await attempt({ actorRole: "superadmin", targetRole: "superadmin", targetStatus: "active" });
  assert.equal(superadminTarget.result.status, 403);
  assert.equal(superadminTarget.auditWrites, 0);
  assert.equal(superadminTarget.accountWrites, 0);

  const deletedTarget = await attempt({ actorRole: "superadmin", targetRole: "user", targetStatus: "deleted" });
  assert.equal(deletedTarget.result.status, 409);
  assert.equal(deletedTarget.auditWrites, 0);
  assert.equal(deletedTarget.accountWrites, 0);

  const adminRestoresBan = await attempt({
    actorRole: "admin", targetRole: "user", targetStatus: "permanently_banned", action: "restore_user"
  });
  assert.equal(adminRestoresBan.result.status, 403);
  assert.equal(adminRestoresBan.auditWrites, 0);
  assert.equal(adminRestoresBan.accountWrites, 0);
});
