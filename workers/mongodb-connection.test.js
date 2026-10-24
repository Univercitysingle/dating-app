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
