import test from "node:test";
import assert from "node:assert/strict";
import { isCdnConfigured, putPrivateObject, getPrivateObject, deletePrivateObject } from "./backblaze-storage.js";

test("CDN storage is enabled only when CDN_HOSTNAME is configured", () => {
  assert.equal(isCdnConfigured({}), false);
  assert.equal(isCdnConfigured({ CDN_HOSTNAME: " " }), false);
  assert.equal(isCdnConfigured({ CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/" }), true);
});

test("storage operations route uploads, reads, and deletes through the configured CDN host URL", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", headers: init.headers });
    if ((init.method || "GET") === "GET") {
      return new Response("image-bytes", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "11" } });
    }
    return new Response(null, { status: 204 });
  };
  try {
    const env = { CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev/" };
    const key = "photos-user-00000000-0000-0000-0000-000000000000.jpg";
    await putPrivateObject(env, key, new Uint8Array([1, 2, 3]), "image/jpeg", "user", "profile-photo");
    const object = await getPrivateObject(env, key);
    assert.equal(object.ContentType, "image/jpeg");
    assert.equal(object.ContentLength, 11);
    assert.equal(await new Response(object.Body).text(), "image-bytes");
    await deletePrivateObject(env, key);
    assert.deepEqual(calls.map(call => [call.method, call.url]), [
      ["PUT", "https://dateme.enadoctemp.workers.dev/" + key],
      ["GET", "https://dateme.enadoctemp.workers.dev/" + key],
      ["DELETE", "https://dateme.enadoctemp.workers.dev/" + key]
    ]);
    assert.equal(new Headers(calls[0].headers).get("content-type"), "image/jpeg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CDN_HOSTURL and CDN_HOST_URL are accepted as upload-routing aliases", () => {
  assert.equal(isCdnConfigured({ CDN_HOSTURL: "https://dateme.enadoctemp.workers.dev/" }), true);
  assert.equal(isCdnConfigured({ CDN_HOST_URL: "https://dateme.enadoctemp.workers.dev/" }), true);
  assert.equal(isCdnConfigured({ CDN_HOST: "https://dateme.enadoctemp.workers.dev/" }), true);
});

test("storage proxy errors are surfaced to the caller", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not allowed", { status: 403 });
  try {
    await assert.rejects(
      getPrivateObject({ CDN_HOSTNAME: "https://dateme.enadoctemp.workers.dev" }, "photos-user-00000000-0000-0000-0000-000000000000.jpg"),
      /CDN storage proxy returned HTTP 403/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid CDN proxy URLs are rejected", async () => {
  await assert.rejects(
    getPrivateObject({ CDN_HOSTNAME: "http://dateme.enadoctemp.workers.dev" }, "photos-user-00000000-0000-0000-0000-000000000000.jpg"),
    /HTTPS proxy URL/
  );
});
