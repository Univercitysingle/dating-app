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
