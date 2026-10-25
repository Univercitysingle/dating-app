import assert from "node:assert/strict";
import test from "node:test";
import { MongoDBConnection } from "./mongodb-connection.js";

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
  assert.equal(Object.hasOwn(ordinary.body.contactDetails, "email"), false);
  assert.equal(Object.hasOwn(ordinary.body.contactDetails, "mobile"), false);
  assert.equal(ordinary.body.contactDetails.label, "private");
  assert.equal(Object.hasOwn(ordinary.body.metadata.account, "email_address"), false);
  assert.equal(ordinary.body.metadata.account.visibleLabel, "kept");
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
