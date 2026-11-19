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
  const url = baseUrl + path + ".json";
  const response = await fetchImpl(url, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer " + accessToken },
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
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
    ...(message.editedAt ? { editedAt: message.editedAt instanceof Date ? message.editedAt.toISOString() : message.editedAt } : {}),
    ...(message.editedByUid ? { editedByUid: message.editedByUid } : {}),
    ...(message.deletedAt ? { deletedAt: message.deletedAt instanceof Date ? message.deletedAt.toISOString() : message.deletedAt } : {}),
    ...(message.deletedByUid ? { deletedByUid: message.deletedByUid } : {})
  }, fetchImpl);
}

export async function syncChatRoomMembership(env, roomId, participantUids, active, fetchImpl = fetch) {
  if (typeof roomId !== "string" || roomId.length < 3 || roomId.length > 260 ||
      !Array.isArray(participantUids) || participantUids.length !== 2 ||
      participantUids.some(uid => typeof uid !== "string" || !uid || uid.length > 128) ||
      participantUids[0] === participantUids[1] || typeof active !== "boolean") {
    throw new Error("Invalid chat membership update");
  }
  const encodedRoomId = encodeURIComponent(roomId);
  if (active) {
    // Publish the inverse index first. The membership grant is last so a
    // partially failed index update cannot leave an unrevokable room grant.
    for (const uid of participantUids) {
      await authenticatedDatabaseRequest(
        env, "/chatUserRooms/" + encodeURIComponent(uid) + "/" + encodedRoomId,
        "PUT", true, fetchImpl
      );
    }
    await authenticatedDatabaseRequest(
      env, "/chatParticipants/" + encodedRoomId, "PUT",
      Object.fromEntries(participantUids.map(uid => [uid, true])), fetchImpl
    );
  } else {
    // Remove the actual read grant first, then clean up both inverse indexes.
    await authenticatedDatabaseRequest(
      env, "/chatParticipants/" + encodedRoomId, "DELETE", undefined, fetchImpl
    );
    for (const uid of participantUids) {
      await authenticatedDatabaseRequest(
        env, "/chatUserRooms/" + encodeURIComponent(uid) + "/" + encodedRoomId,
        "DELETE", undefined, fetchImpl
      );
    }
  }
  return true;
}

async function readAuthenticatedDatabaseValue(env, path, fetchImpl = fetch) {
  const baseUrl = getDatabaseBaseUrl(env);
  const accessToken = await getFirebaseAdminAccessToken(env, fetchImpl);
  const response = await fetchImpl(baseUrl + path + ".json", {
    method: "GET",
    headers: { authorization: "Bearer " + accessToken }
  });
  if (!response.ok) throw new Error("Firebase Realtime Database read failed");
  return response.json();
}

/**
 * Revoke every indexed chat room for a user. The inverse index is written
 * alongside chatParticipants by syncChatRoomMembership, making this bounded
 * by the user's own conversation count rather than a database-wide scan.
 * The operation is idempotent and removes stale per-user index entries too.
 */
export async function revokeAllChatMembershipsForUser(env, uid, fetchImpl = fetch, additionalRoomIds = []) {
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new Error("Invalid chat membership user");
  }
  const encodedUid = encodeURIComponent(uid);
  const roomIndex = await readAuthenticatedDatabaseValue(
    env, "/chatUserRooms/" + encodedUid, fetchImpl
  );
  if (!Array.isArray(additionalRoomIds) || additionalRoomIds.some(roomId =>
    typeof roomId !== "string" || !roomId || roomId.length > 260
  )) {
    throw new Error("Invalid additional chat room index");
  }
  const indexedRoomIds = roomIndex && typeof roomIndex === "object" && !Array.isArray(roomIndex)
    ? Object.keys(roomIndex).filter(roomId => roomIndex[roomId] === true)
    : [];
  const roomIds = [...new Set([...indexedRoomIds, ...additionalRoomIds])];
  if (!roomIds.length) return { revoked: 0 };

  let revoked = 0;
  for (const roomId of roomIds) {
    if (!roomId || roomId.length > 260) continue;
    const encodedRoomId = encodeURIComponent(roomId);
    const participants = await readAuthenticatedDatabaseValue(
      env, "/chatParticipants/" + encodedRoomId, fetchImpl
    );
    const participantUids = participants && typeof participants === "object" && !Array.isArray(participants)
      ? Object.keys(participants).filter(participantUid =>
          participants[participantUid] === true && /^[A-Za-z0-9_-]{1,128}$/.test(participantUid)
        )
      : [uid];
    await authenticatedDatabaseRequest(
      env, "/chatParticipants/" + encodedRoomId, "DELETE", undefined, fetchImpl
    );
    for (const participantUid of new Set([...participantUids, uid])) {
      await authenticatedDatabaseRequest(
        env,
        "/chatUserRooms/" + encodeURIComponent(participantUid) + "/" + encodedRoomId,
        "DELETE", undefined, fetchImpl
      );
    }
    revoked += 1;
  }
  return { revoked };
}
