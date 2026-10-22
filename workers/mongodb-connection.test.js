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
  assert.deepEqual(condition.$not[0].$in, ["$$regularUser.uid", "$$boostedIds"]);
  assert.deepEqual(project.$let.vars.boostedIds, { $map: { input: { $ifNull: ["$boostedUsers", []] }, as: "boostedUser", in: "$boostedUser.uid" } });
});
