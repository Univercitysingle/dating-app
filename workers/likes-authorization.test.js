import test from "node:test";
import assert from "node:assert/strict";
import { MongoDBConnection } from "./mongodb-connection.js";

test("likes omit hidden profiles and either side of a blocked relationship", async () => {
  const uid = "viewer-uid";
  const likedUids = ["visible-uid", "hidden-uid", "viewer-blocked-uid", "target-blocked-uid"];
  const matches = likedUids.map(user1Uid => ({ user1Uid, user2Uid: uid, status: "pending" }));
  const users = [
    { uid: "visible-uid", name: "Visible profile", isProfileVisible: true },
    { uid: "hidden-uid", name: "Hidden profile", isProfileVisible: false },
    { uid: "viewer-blocked-uid", name: "Blocked by viewer", isProfileVisible: true },
    { uid: "target-blocked-uid", name: "Blocked viewer", isProfileVisible: true, blocked: [uid] }
  ];
  const calls = [];
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      if (name === "users") {
        return {
          async findOne(filter, options) {
            calls.push({ collection: name, filter, options });
            if (filter.uid === uid) {
              return { _id: "viewer-id", uid, plan: "premium", role: "user", blocked: ["viewer-blocked-uid"] };
            }
            return null;
          },
          find(filter) {
            calls.push({ collection: name, filter });
            return { async toArray() { return users; } };
          }
        };
      }
      if (name === "subscriptions") {
        return {
          async findOne() {
            return { plan: "monthly", currency: "LKR", endDate: new Date("2027-01-01T00:00:00.000Z") };
          }
        };
      }
      if (name === "matches") {
        return {
          find(filter) {
            calls.push({ collection: name, filter });
            return { async toArray() { return matches; } };
          }
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }
  });

  const result = await connection.getLikes(uid);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.map(profile => profile.uid), ["visible-uid"]);
  assert.deepEqual(calls.find(call => call.collection === "matches").filter, {
    $or: [{ user1Uid: uid }, { user2Uid: uid }],
    status: "pending"
  });
  assert.ok(calls.find(call => call.collection === "users" && call.options)?.options.projection.blocked);
});
