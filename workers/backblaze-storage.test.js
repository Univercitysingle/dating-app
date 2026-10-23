import test from "node:test";
import assert from "node:assert/strict";
import { isB2Configured, putPrivateObject, getPrivateObject, deletePrivateObject } from "./backblaze-storage.js";

const validB2 = {
  B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  B2_BUCKET_NAME: "dateapp",
  B2_APPLICATION_KEY_ID: "test-key-id",
  B2_APPLICATION_KEY: "test-application-key"
};

test("B2 storage is enabled only when all private storage settings are present", () => {
  assert.equal(isB2Configured({}), false);
  assert.equal(isB2Configured({ ...validB2, B2_APPLICATION_KEY: "" }), false);
  assert.equal(isB2Configured(validB2), true);
});

test("B2 operations reject missing configuration before attempting network access", async () => {
  await assert.rejects(
    putPrivateObject({}, "photos-user-123.jpg", new Uint8Array([1]), "image/jpeg"),
    /Backblaze B2 storage configuration is incomplete/
  );
  await assert.rejects(
    getPrivateObject({}, "photos-user-123.jpg"),
    /Backblaze B2 storage configuration is incomplete/
  );
  await assert.rejects(
    deletePrivateObject({}, "photos-user-123.jpg"),
    /Backblaze B2 storage configuration is incomplete/
  );
});

test("B2 endpoint validation rejects non-Backblaze and non-HTTPS endpoints", async () => {
  await assert.rejects(
    putPrivateObject({ ...validB2, B2_ENDPOINT: "http://s3.us-west-004.backblazeb2.com" }, "photos-user-123.jpg", new Uint8Array([1]), "image/jpeg"),
    /B2_ENDPOINT must be an HTTPS Backblaze S3 endpoint/
  );
  await assert.rejects(
    getPrivateObject({ ...validB2, B2_ENDPOINT: "https://s3.example.com" }, "photos-user-123.jpg"),
    /B2_ENDPOINT must be an HTTPS Backblaze S3 endpoint/
  );
});
