import assert from "node:assert/strict";
import test from "node:test";
import { MongoDBConnection } from "./mongodb-connection.js";
import Worker from "./index.js";

test("discovery builds a valid aggregation expression to exclude boosted users from regular results", async () => {
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
  assert.deepEqual(capturedPipeline[0].$match.uid, { $ne: "current-user", $nin: ["blocked-user"] });
  const project = capturedPipeline.find((stage) => stage.$project?.combinedUsers).$project.combinedUsers;
  const condition = project.$let.in.$concatArrays[1].$slice[0].$filter.cond;
  assert.ok(Array.isArray(condition.$not), "$not must receive an array expression in MongoDB aggregation");
  assert.deepEqual(condition.$not[0].$in, ["$$regularUser.uid", { $ifNull: ["$$boostedIds", []] }]);
  assert.deepEqual(project.$let.vars.boostedIds, { $map: { input: { $ifNull: ["$boostedUsers", []] }, as: "boostedUser", in: "$$boostedUser.uid" } });
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
  const users = { async findOne() { order.push("find-user"); return user; } };
  const db = { collection(name) { return name === "users" ? users : subscriptions; } };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;
  connection.ensureSubscriptionIndexes = async () => { assert.fail("Request-time subscription creation must not require index permissions"); };
  const result = await connection.createPendingSubscription("user-1", "monthly");
  assert.equal(result.status, 201);
  assert.deepEqual(order, ["find-user", "expire-stale", "check-active", "check-pending", "insert"]);
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
    photos: [{ url: "https://attacker.example/impersonation.jpg", order: 0 }],
    badges: { verified: true, premium: true }
  });

  assert.ok(capturedUpdate, "profile update should reach the database");
  assert.equal(capturedUpdate.$set.bio, "Updated bio");
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
      assert.equal(filter.uid, "caller-uid");
      assert.deepEqual(options.projection, { _id: 0, name: 1 });
      return { name: "Caller Name" };
    }
  };
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({ collection(name) {
    if (name === "callSessions") return calls;
    if (name === "users") return users;
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
