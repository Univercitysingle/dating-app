import test from "node:test";
import assert from "node:assert/strict";
import { isB2Configured, getPrivateObject } from "./backblaze-storage.js";

test("Backblaze storage is disabled until all credentials and bucket settings exist", () => {
  assert.equal(isB2Configured({}), false);
  assert.equal(isB2Configured({
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_BUCKET_NAME: "private-media",
    B2_APPLICATION_KEY_ID: "key-id"
  }), false);
  assert.equal(isB2Configured({
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_BUCKET_NAME: "private-media",
    B2_APPLICATION_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "secret"
  }), true);
});

test("Backblaze endpoint validation rejects non-HTTPS and non-Backblaze endpoints", async () => {
  await assert.rejects(
    getPrivateObject({
      B2_ENDPOINT: "http://s3.us-west-004.backblazeb2.com",
      B2_BUCKET_NAME: "private-media",
      B2_APPLICATION_KEY_ID: "key-id",
      B2_APPLICATION_KEY: "secret"
    }, "photos-user-00000000-0000-0000-0000-000000000000.jpg"),
    /HTTPS Backblaze S3 endpoint/
  );
  await assert.rejects(
    getPrivateObject({
      B2_ENDPOINT: "https://example.com",
      B2_BUCKET_NAME: "private-media",
      B2_APPLICATION_KEY_ID: "key-id",
      B2_APPLICATION_KEY: "secret"
    }, "photos-user-00000000-0000-0000-0000-000000000000.jpg"),
    /HTTPS Backblaze S3 endpoint/
  );
});
