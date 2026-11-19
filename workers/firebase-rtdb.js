import { Buffer } from "node:buffer";
import { createSign } from "node:crypto";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FIREBASE_DATABASE_SCOPE = "https://www.googleapis.com/auth/firebase.database";
const tokenCache = new Map();

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function getServiceAccount(env) {
  let account;
  try {
    account = JSON.parse(String(env.FIREBASE_SERVICE_ACCOUNT_JSON || ""));
  } catch {
    throw new Error("Firebase service account configuration is invalid");
  }
  if (
    !account ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string" ||
    !account.private_key.includes("PRIVATE KEY") ||
    (env.FIREBASE_PROJECT_ID && account.project_id !== env.FIREBASE_PROJECT_ID)
  ) {
    throw new Error("Firebase service account configuration is invalid");
  }
  return account;
}

async function getFirebaseAdminAccessToken(env, fetchImpl = fetch) {
  const account = getServiceAccount(env);
  const cacheKey = account.client_email + ":" + account.project_id;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64UrlJson({ alg: "RS256", typ: "JWT" }) + "." +
    base64UrlJson({
      iss: account.client_email,
      scope: FIREBASE_DATABASE_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600
    });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + "." + signer.sign(account.private_key, "base64url");
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error("Firebase admin token request failed");
  const payload = await response.json();
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("Firebase admin token response was invalid");
  }
  const expiresIn = Number(payload.expires_in) || 3600;
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.min(expiresIn, 3600) * 1000
  });
  return payload.access_token;
}

function getDatabaseBaseUrl(env) {
  const configured = String(env.FIREBASE_DATABASE_URL ||
    (env.FIREBASE_PROJECT_ID ? "https://" + env.FIREBASE_PROJECT_ID + "-default-rtdb.firebaseio.com" : ""));
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("Firebase Realtime Database URL is not configured");
  }
  const host = parsed.hostname.toLowerCase();
  const validHost = host === "firebaseio.com" || host.endsWith(".firebaseio.com") ||
    host === "firebasedatabase.app" || host.endsWith(".firebasedatabase.app");
  if (parsed.protocol !== "https:" || !validHost || parsed.username || parsed.password ||
      parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new Error("Firebase Realtime Database URL is invalid");
  }
  return parsed.origin;
}

async function authenticatedDatabaseRequest(env, path, method, body, fetchImpl = fetch) {
  const baseUrl = getDatabaseBaseUrl(env);
  const accessToken = await getFirebaseAdminAccessToken(env, fetchImpl);
  const url = baseUrl + path + ".json?access_token=" + encodeURIComponent(accessToken);
  const response = await fetchImpl(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) throw new Error("Firebase Realtime Database update failed");
  return true;
}

export async function syncChatMessageToRtdb(env, message, fetchImpl = fetch) {
  if (!message || typeof message.roomId !== "string" || typeof message._id !== "string" ||
      typeof message.senderUid !== "string" || typeof message.receiverUid !== "string" ||
      typeof message.messageContent !== "string") {
    throw new Error("Invalid chat message sync");
  }
  const key = encodeURIComponent(message._id);
  return authenticatedDatabaseRequest(env, "/chats/" + encodeURIComponent(message.roomId) + "/" + key, "PUT", {
    _id: message._id,
    roomId: message.roomId,
    senderUid: message.senderUid,
    receiverUid: message.receiverUid,
    messageContent: message.messageContent,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp
  }, fetchImpl);
}

export async function syncChatRoomMembership(env, roomId, participantUids, active, fetchImpl = fetch) {
  if (typeof roomId !== "string" || roomId.length < 3 || roomId.length > 260 ||
      !Array.isArray(participantUids) || participantUids.length !== 2 ||
      participantUids.some(uid => typeof uid !== "string" || !uid || uid.length > 128) ||
      participantUids[0] === participantUids[1] || typeof active !== "boolean") {
    throw new Error("Invalid chat membership update");
  }
  return authenticatedDatabaseRequest(
    env,
    "/chatParticipants/" + encodeURIComponent(roomId),
    active ? "PUT" : "DELETE",
    active ? Object.fromEntries(participantUids.map(uid => [uid, true])) : undefined,
    fetchImpl
  );
}
