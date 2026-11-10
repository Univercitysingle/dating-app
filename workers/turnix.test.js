import test from "node:test";
import assert from "node:assert/strict";
import { requestTurnixIceConfig, buildTurnixIceServerTiers, buildExpressTurnIceServers, buildCallIceProviderConfig } from "./index.js";

test("Turnix ICE credentials are requested server-side with the token and trusted client IP", async () => {
  const token = "test-turnix-secret-never-return";
  let captured;
  const request = new Request("https://api.example.test/api/calls/ice-config?room=room%2F42", {
    headers: { "cf-connecting-ip": "203.0.113.25" }
  });
  const result = await requestTurnixIceConfig(request, { TURNIX_API_TOKEN: token }, { sub: "user_123" }, async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      iceServers: [
        { urls: ["stun:stun.turnix.io:3478"] },
        { urls: ["turn:sg.turnix.io:3478?transport=udp", "turn:sg.turnix.io:3478?transport=tcp", "turns:sg.turnix.io:443?transport=tcp"], username: "short-lived-user", credential: "short-lived-password" }
      ],
      expiresAt: "2026-11-10T14:00:00.000Z"
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(captured.url, "https://turnix.io/api/v1/credentials/ice");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer " + token);
  assert.equal(captured.options.headers["X-TURN-CLIENT-IP"], "203.0.113.25");
  assert.deepEqual(JSON.parse(captured.options.body), {
    ttl: 3600,
    room: "room42",
    initiator_client: "user_123"
  });
  assert.equal(result.iceServers.length, 2);
  assert.equal(result.expiresAt, "2026-11-10T14:00:00.000Z");
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("Turnix provider errors retain only the HTTP status and never expose response content", async () => {
  const request = new Request("https://api.example.test/api/calls/ice-config");
  await assert.rejects(
    requestTurnixIceConfig(request, { TURNIX_API_TOKEN: "secret-value" }, { sub: "user123" }, async () =>
      new Response(JSON.stringify({ error: "quota reached", token: "do-not-forward" }), { status: 429 })
    ),
    error => {
      assert.equal(error.status, 429);
      assert.equal(error.message, "Turnix credentials request failed");
      assert.equal(error.message.includes("secret-value"), false);
      assert.equal(error.message.includes("do-not-forward"), false);
      return true;
    }
  );
});

test("Turnix ICE tiers separate direct STUN, UDP, TCP, and TLS paths", () => {
  const tiers = buildTurnixIceServerTiers([
    { urls: ["stun:stun.turnix.io:3478"] },
    { urls: ["turn:sg.turnix.io:3478?transport=udp", "turn:sg.turnix.io:3478?transport=tcp", "turns:sg.turnix.io:443?transport=tcp"], username: "u", credential: "p" }
  ]);
  assert.deepEqual(tiers.map(tier => tier.name), ["direct-stun", "turn-udp", "turn-tcp", "turn-tls"]);
  assert.equal(tiers[1].iceServers[0].urls[0], "turn:sg.turnix.io:3478?transport=udp");
  assert.equal(tiers[2].iceServers[0].urls[0], "turn:sg.turnix.io:3478?transport=tcp");
  assert.equal(tiers[3].iceServers[0].urls[0], "turns:sg.turnix.io:443?transport=tcp");
});


test("ExpressTURN is the primary relay and Turnix is exposed as ordered fallback tiers", () => {
  const env = { EXPRESSTURN_USERNAME: "express-user", EXPRESSTURN_PASSWORD: "express-password" };
  const turnix = {
    expiresAt: "2026-11-10T14:00:00.000Z",
    iceServers: [
      { urls: ["stun:stun.turnix.io:3478"] },
      { urls: ["turn:sg.turnix.io:3478?transport=udp", "turn:sg.turnix.io:3478?transport=tcp"], username: "short-user", credential: "short-password" }
    ]
  };
  const config = buildCallIceProviderConfig({ env, turnix });
  assert.deepEqual(buildExpressTurnIceServers(env)[0].urls, [
    "turn:free.expressturn.com:3478?transport=udp",
    "turn:free.expressturn.com:3478?transport=tcp"
  ]);
  assert.equal(config.iceServerTiers[0].name, "expressturn-primary");
  assert.equal(config.iceServerTiers[0].iceServers.at(-1).username, "express-user");
  assert.equal(config.iceServerTiers[1].name, "turnix-fallback-direct-stun");
  assert.ok(config.iceServerTiers.some(tier => tier.name === "turnix-fallback-turn-udp"));
  assert.ok(config.iceServerTiers.some(tier => tier.name === "turnix-fallback-turn-tcp"));
  assert.equal(config.iceServers, config.iceServerTiers[0].iceServers);
  assert.equal(config.turnConfigured, true);
});

test("ExpressTURN credentials are omitted unless both secrets are configured", () => {
  assert.deepEqual(buildExpressTurnIceServers({ EXPRESSTURN_USERNAME: "only-user" }), []);
  const config = buildCallIceProviderConfig({ env: { EXPRESSTURN_USERNAME: "only-user" } });
  assert.equal(config.iceServerTiers[0].name, "direct-stun");
  assert.equal(config.turnConfigured, false);
});

test("ExpressTURN remains usable when Turnix credential issuance fails", () => {
  const config = buildCallIceProviderConfig({
    env: { EXPRESSTURN_USERNAME: "express-user", EXPRESSTURN_PASSWORD: "express-password" }
  });
  assert.equal(config.iceServerTiers.length, 1);
  assert.equal(config.iceServerTiers[0].name, "expressturn-primary");
  assert.equal(config.turnConfigured, true);
});
