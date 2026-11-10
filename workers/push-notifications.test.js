import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedPushEndpoint } from "./push-notifications.js";

test("push endpoints allow supported HTTPS push services only", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token"), true);
  assert.equal(isAllowedPushEndpoint("https://web.push.apple.com/abc"), true);
  assert.equal(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(isAllowedPushEndpoint("https://wns2.notify.windows.com/w/?token=abc"), true);
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/send"), false);
  assert.equal(isAllowedPushEndpoint("https://127.0.0.1/secret"), false);
  assert.equal(isAllowedPushEndpoint("https://attacker.example/push"), false);
  assert.equal(isAllowedPushEndpoint("https://user:pass@fcm.googleapis.com/send"), false);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/send"), false);
});

import Worker from "./index.js";

test("public VAPID key route exposes only the public key when configured", async () => {
  const response = await Worker.fetch(new Request("https://dating-app.test/api/push/vapid-public-key"), {
    VAPID_PUBLIC_KEY: "public-key",
    VAPID_PRIVATE_KEY: "private-key",
    VAPID_SUBJECT: "mailto:push@example.com"
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { publicKey: "public-key" });
});

test("public VAPID key route stays disabled when configuration is incomplete", async () => {
  const response = await Worker.fetch(new Request("https://dating-app.test/api/push/vapid-public-key"), {
    VAPID_PUBLIC_KEY: "public-key"
  });
  assert.equal(response.status, 503);
});
