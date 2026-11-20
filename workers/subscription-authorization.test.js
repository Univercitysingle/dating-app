import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { MongoDBConnection } from "./mongodb-connection.js";

function createConnection({ user, subscription }) {
  const calls = [];
  const connection = new MongoDBConnection({}, {});
  connection.getClient = async () => ({});
  connection.getDatabase = () => ({
    collection(name) {
      return {
        async findOne(filter, options) {
          calls.push({ collection: name, filter, options });
          if (name === "users") return user;
          if (name === "subscriptions") return subscription;
          throw new Error(`Unexpected collection: ${name}`);
        }
      };
    }
  });
  return { connection, calls };
}

test("subscription status is returned only to the subscription owner", async () => {
  const ownerId = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const subscriptionId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const { connection, calls } = createConnection({
    user: { _id: ownerId },
    subscription: {
      _id: subscriptionId,
      userId: ownerId,
      status: "active",
      plan: "premium",
      endDate: new Date("2027-01-01T00:00:00.000Z")
    }
  });

  const result = await connection.getSubscriptionStatus("owner-uid", subscriptionId.toHexString());

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "active");
  assert.equal(result.body.plan, "premium");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].filter, { uid: "owner-uid" });
  assert.equal(calls[1].filter._id.toHexString(), subscriptionId.toHexString());
});

test("subscription status denies another authenticated user", async () => {
  const ownerId = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const otherUserId = new ObjectId("cccccccccccccccccccccccc");
  const subscriptionId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const { connection } = createConnection({
    user: { _id: otherUserId },
    subscription: {
      _id: subscriptionId,
      userId: ownerId,
      status: "active",
      plan: "premium"
    }
  });

  const result = await connection.getSubscriptionStatus("other-uid", subscriptionId.toHexString());

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "Not authorized to view this subscription" });
});

test("subscription status rejects malformed IDs before database access", async () => {
  const connection = new MongoDBConnection({}, {});
  let databaseAccessed = false;
  connection.getClient = async () => {
    databaseAccessed = true;
    return {};
  };

  const result = await connection.getSubscriptionStatus("owner-uid", "not-an-object-id");

  assert.equal(result.status, 400);
  assert.equal(databaseAccessed, false);
});

test("subscription status does not disclose subscriptions when the caller has no user record", async () => {
  const subscriptionId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const { connection, calls } = createConnection({
    user: null,
    subscription: null
  });

  const result = await connection.getSubscriptionStatus("unknown-uid", subscriptionId.toHexString());

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: "User not found" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].collection, "users");
});


test("failed subscription checkout cancellation releases only its matching reservation", async () => {
  const userId = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const orderId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const writes = [];
  const db = {
    collection(name) {
      if (name === "users") return {
        findOne: async () => ({ _id: userId }),
        updateOne: async (filter, update) => {
          writes.push({ collection: name, filter, update });
          return { matchedCount: 1, modifiedCount: 1 };
        }
      };
      if (name === "subscriptions") return {
        findOne: async () => ({
          _id: orderId,
          userId,
          status: "pending",
          checkoutReservationId: "reservation-owned-by-this-order"
        }),
        updateOne: async (filter, update) => {
          writes.push({ collection: name, filter, update });
          return { matchedCount: 1, modifiedCount: 1 };
        }
      };
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.abandonPendingSubscription("owner-uid", orderId.toHexString());

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, status: "cancelled" });
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].filter, {
    _id: orderId,
    userId,
    status: "pending"
  });
  assert.equal(writes[0].update.$set.status, "cancelled");
  assert.equal(writes[0].update.$set.cancellationReason, "checkout_start_failed");
  assert.deepEqual(writes[1].filter, {
    _id: userId,
    "pendingSubscriptionCheckout.reservationId": "reservation-owned-by-this-order"
  });
  assert.deepEqual(writes[1].update, { $unset: { pendingSubscriptionCheckout: "" } });
});

test("subscription checkout cancellation never releases a reservation after payment status changes", async () => {
  const userId = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const orderId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  let userReservationReleased = false;
  const db = {
    collection(name) {
      if (name === "users") return {
        findOne: async () => ({ _id: userId }),
        updateOne: async () => { userReservationReleased = true; return { modifiedCount: 1 }; }
      };
      if (name === "subscriptions") {
        let lookupCount = 0;
        return {
          findOne: async () => {
            lookupCount += 1;
            return lookupCount === 1
              ? { _id: orderId, userId, status: "pending", checkoutReservationId: "reservation-id" }
              : { status: "active" };
          },
          updateOne: async () => ({ matchedCount: 1, modifiedCount: 0 })
        };
      }
      assert.fail("Unexpected collection: " + name);
    }
  };
  const connection = Object.create(MongoDBConnection.prototype);
  connection.getClient = async () => ({});
  connection.getDatabase = () => db;

  const result = await connection.abandonPendingSubscription("owner-uid", orderId.toHexString());

  assert.equal(result.status, 409);
  assert.equal(result.body.status, "active");
  assert.equal(userReservationReleased, false);
});
