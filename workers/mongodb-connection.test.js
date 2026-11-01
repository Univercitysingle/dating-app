import assert from "node:assert/strict";
import test from "node:test";
import { MongoDBConnection } from "./mongodb-connection.js";
import Worker from "./index.js";

test("discovery builds a valid aggregation expression to exclude boosted users from regular results", async () => {
  let capturedPipeline;
  const users = {
    findOne: async ({ uid }) => ({ uid, location: { coordinates: [0, 0] } }),
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
  const project = capturedPipeline.find((stage) => stage.$project?.combinedUsers).$project.combinedUsers;
  const condition = project.$let.in.$concatArrays[1].$slice[0].$filter.cond;
  assert.ok(Array.isArray(condition.$not), "$not must receive an array expression in MongoDB aggregation");
  assert.deepEqual(condition.$not[0].$in, ["$regularUser.uid", { $ifNull: ["$boostedIds", []] }]);
  assert.deepEqual(project.$let.vars.boostedIds, { $map: { input: { $ifNull: ["$boostedUsers", []] }, as: "boostedUser", in: "$boostedUser.uid" } });
});


test("pending WebXPay subscriptions avoid null collisions with legacy Stripe and PayHere unique indexes", async () => {
  const order = [];
  const user = { _id: "user-object-id", uid: "user-1", name: "Test User" };
  let insertedSubscription;
  const subscriptions = {
    async findOne() { order.push("check-active"); return null; },
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
  assert.deepEqual(order, ["find-user", "check-active", "insert"]);
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
    const connection = new MongoDBConnection({}, {});
    connection.getClient = async () => ({});
    connection.getDatabase = () => ({ collection(name) { return name === "users" ? users : reports; } });
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
    async updateOne(query, update) { purchase.status = update.$set.status; return { modifiedCount: 1 }; }
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
  const result = await connection.settleWebXPay(orderId, "00", "provider-reference");
  assert.equal(result.status, 200);
  assert.equal(purchase.status, "completed");
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
