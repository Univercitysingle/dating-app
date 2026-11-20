export function isValidEmailAddress(value) {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at > 64) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || local.startsWith(".") || local.endsWith(".") ||
      local.includes("..") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  return domain.split(".").every(label =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  );
}

export function normalizeWebXPayReference(value) {
  if (typeof value !== "string") return null;
  const reference = value.trim();
  if (!reference || reference.length > 128 || /[\\u0000-\\u001f\\u007f]/.test(reference)) return null;
  return reference;
}

export function isValidWebXPayTransactionDate(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

const PRIVATE_CONTACT_FIELDS = new Set([
  "email", "emailaddress", "email_address", "emailid", "mail", "mobile", "mobilenumber",
  "mobile_number", "phone", "phonenumber", "phone_number", "contactnumber", "contact_number",
  "telephone", "telephonenumber", "whatsapp", "whatsappnumber", "contactemail", "contactphone"
]);

function stripPrivateContactFields(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) stripPrivateContactFields(item);
    return value;
  }
  for (const key of Object.keys(value)) {
    const normalizedKey = key.replace(/[^a-z0-9_]/gi, "").toLowerCase();
    if (PRIVATE_CONTACT_FIELDS.has(normalizedKey)) {
      delete value[key];
    } else if (value[key] && typeof value[key] === "object") {
      stripPrivateContactFields(value[key]);
    }
  }
  return value;
}

const PRIVATE_NESTED_PROFILE_FIELDS = new Set([
  "password", "passwordhash", "lastloginip", "role", "blocked", "birthday",
  "coordinates", "latitude", "longitude", "lat", "lng", "exactlocation", "location"
]);

function stripPreciseLocation(profile) {
  if (!profile || typeof profile !== "object") return profile;
  delete profile.locationSharing;
  for (const key of ["coordinates", "latitude", "longitude", "lat", "lng", "exactLocation", "accuracyMeters"]) {
    delete profile[key];
  }
  if (profile.location && typeof profile.location === "object" && !Array.isArray(profile.location)) {
    for (const key of ["coordinates", "type", "latitude", "longitude", "lat", "lng", "exactLocation", "accuracyMeters"]) {
      delete profile.location[key];
    }
    if (Object.keys(profile.location).length === 0) delete profile.location;
  }
  return profile;
}

function copyPublicValue(value) {
  if (Array.isArray(value)) return value.map(copyPublicValue);
  if (!value || typeof value !== "object") return value;
  const safe = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (PRIVATE_CONTACT_FIELDS.has(normalizedKey) || PRIVATE_NESTED_PROFILE_FIELDS.has(normalizedKey)) continue;
    safe[key] = copyPublicValue(nestedValue);
  }
  return safe;
}

// Public profile responses use an allowlist, not a denylist. This prevents new
// account, authentication, billing, moderation, or contact fields from leaking
// when the user document schema grows. Exact GPS coordinates and full birthday
// are never returned to other users.
function sanitizePublicProfile(profile) {
  const allowed = [
    "uid", "id", "name", "age", "gender", "sexualOrientation", "bio", "photos",
    "interests", "profilePrompts", "personalityType", "socialMediaLinks", "education",
    "relationshipGoals", "familyStatus", "siblings", "religion", "politicalLeaning",
    "lookingFor", "pets", "lifestyle", "badges", "isVerified", "isOnboardingComplete",
    "superLikedByCurrentUser", "relationshipDiscovery"
  ];
  const safe = {};
  for (const key of allowed) {
    if (profile[key] !== undefined) safe[key] = copyPublicValue(profile[key]);
  }
  if (profile.plan === "premium" || profile.plan === "basic") safe.plan = profile.plan;
  if (profile.lastActiveAt instanceof Date || typeof profile.lastActiveAt === "string") {
    safe.lastActiveAt = profile.lastActiveAt;
  }
  if (profile.location && typeof profile.location === "object" && !Array.isArray(profile.location)) {
    const location = {};
    for (const key of ["city", "region", "state", "country", "countryCode", "cityName"]) {
      if (typeof profile.location[key] === "string" && profile.location[key].length <= 100) {
        location[key] = profile.location[key];
      }
    }
    if (Object.keys(location).length) safe.location = location;
  } else if (typeof profile.location === "string" && profile.location.length <= 100) {
    safe.location = profile.location;
  }
  if (profile.lifestyle && typeof profile.lifestyle === "object" && !Array.isArray(profile.lifestyle)) {
    const lifestyle = {};
    for (const key of ["drinking", "smoking", "exercise", "diet", "lookingFor", "pets", "religion", "politicalLeaning"]) {
      if (profile.lifestyle[key] !== undefined) lifestyle[key] = profile.lifestyle[key];
    }
    if (Object.keys(lifestyle).length) safe.lifestyle = lifestyle;
  }
  if (profile.badges && typeof profile.badges === "object" && !Array.isArray(profile.badges)) {
    const badges = {};
    for (const key of ["verified", "premium", "early_adopter"]) {
      if (profile.badges[key] !== undefined) badges[key] = profile.badges[key];
    }
    if (Object.keys(badges).length) safe.badges = badges;
  }
  if (Array.isArray(profile.photos)) {
    safe.photos = profile.photos.map((photo) => {
      if (typeof photo === "string") return photo;
      if (!photo || typeof photo !== "object") return null;
      const safePhoto = {};
      for (const key of ["url", "isPrimary", "isMain", "order", "alt"]) {
        if (photo[key] !== undefined) safePhoto[key] = photo[key];
      }
      return safePhoto;
    }).filter(Boolean);
  }
  if (profile.socialMediaLinks && typeof profile.socialMediaLinks === "object" && !Array.isArray(profile.socialMediaLinks)) {
    const links = {};
    for (const key of ["instagram", "spotify", "tiktok"]) {
      if (typeof profile.socialMediaLinks[key] === "string") links[key] = profile.socialMediaLinks[key];
    }
    if (Object.keys(links).length) safe.socialMediaLinks = links;
  }
  return safe;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function revokeFirebaseChatMemberships(env, uid, db) {
  const configured = Boolean(env?.FIREBASE_SERVICE_ACCOUNT_JSON && env?.FIREBASE_DATABASE_URL);
  if (!configured && env?.ENABLE_FIREBASE_REALTIME_SYNC !== "true") {
    return { configured: false, revoked: 0 };
  }
  // Merge the RTDB inverse index with MongoDB's authoritative conversation
  // inventory. This also catches rooms created before chatUserRooms existed.
  let legacyRoomIds = [];
  if (db && typeof db.collection === "function") {
    legacyRoomIds = await db.collection("chatmessages").distinct("roomId", {
      $or: [{ senderUid: uid }, { receiverUid: uid }]
    });
    legacyRoomIds = legacyRoomIds.filter(roomId =>
      typeof roomId === "string" && roomId.length >= 3 && roomId.length <= 260
    );
  }
  const { revokeAllChatMembershipsForUser } = await import("./firebase-rtdb.js");
  const result = await revokeAllChatMembershipsForUser(env, uid, fetch, legacyRoomIds);
  return { configured: true, revoked: result.revoked };
}

function isAccountRestricted(user, now = new Date()) {
  if (!user) return true;
  if (user.deletionRequestedAt || user.accountStatus === "deletion_pending" || user.accountStatus === "deleted") return true;
  if (user.accountStatus === "permanently_banned") return true;
  if (user.accountStatus === "temporarily_suspended") {
    if (!user.suspendedUntil) return true;
    const suspendedUntil = new Date(user.suspendedUntil);
    return !Number.isFinite(suspendedUntil.getTime()) || suspendedUntil > now;
  }
  // Backward compatibility for accounts suspended before accountStatus existed.
  if (user.suspendedUntil) {
    const suspendedUntil = new Date(user.suspendedUntil);
    return !Number.isFinite(suspendedUntil.getTime()) || suspendedUntil > now;
  }
  return false;
}

export async function deleteFirebaseAuthIdentity(env, uid) {
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    return { completed: false, configured: false, reason: "invalid_firebase_uid" };
  }
  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  let serviceAccount = null;
  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (env.FIREBASE_CREDENTIALS_BASE64) {
      const { Buffer } = await import("node:buffer");
      serviceAccount = JSON.parse(Buffer.from(env.FIREBASE_CREDENTIALS_BASE64, "base64").toString("utf8"));
    } else if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
      serviceAccount = {
        client_email: env.FIREBASE_CLIENT_EMAIL,
        private_key: String(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n")
      };
    }
  } catch {
    return { completed: false, configured: true, reason: "firebase_credentials_invalid" };
  }
  if (!projectId || !serviceAccount ||
      typeof serviceAccount.client_email !== "string" ||
      typeof serviceAccount.private_key !== "string" ||
      !serviceAccount.private_key.includes("PRIVATE KEY")) {
    return { completed: false, configured: false, reason: "firebase_admin_credentials_unavailable" };
  }

  try {
    const { Buffer } = await import("node:buffer");
    const { createSign } = await import("node:crypto");
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    const header = encode({ alg: "RS256", typ: "JWT" });
    const claims = encode({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/identitytoolkit",
      iat: now,
      exp: now + 3600
    });
    const unsigned = header + "." + claims;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + "." + signer.sign(serviceAccount.private_key, "base64url");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });
    if (!tokenResponse.ok) return { completed: false, configured: true, reason: "firebase_oauth_token_failed" };
    const tokenBody = await tokenResponse.json().catch(() => null);
    if (!tokenBody || typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
      return { completed: false, configured: true, reason: "firebase_oauth_token_invalid" };
    }

    const deleteResponse = await fetch(
      "https://identitytoolkit.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/accounts:delete",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenBody.access_token,
          "content-type": "application/json"
        },
        body: JSON.stringify({ localId: uid })
      }
    );
    if (deleteResponse.ok) return { completed: true, configured: true };
    const errorBody = await deleteResponse.json().catch(() => null);
    const errorCode = String(errorBody?.error?.message || "");
    if (/USER_NOT_FOUND/i.test(errorCode)) return { completed: true, configured: true };
    return { completed: false, configured: true, reason: "firebase_identity_delete_failed" };
  } catch {
    return { completed: false, configured: true, reason: "firebase_identity_delete_unavailable" };
  }
}

function withTimeout(promise, timeoutMs, operation) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

export function getMongoPoolSize(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 10;
}

export class MongoDBConnection {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clientPromise = null;
    this.discoveryMatchIndexesPromise = null;
    this.subscriptionIndexMigrationPromise = null;
    this.chatMessageIdIndexPromise = null;
    this.chatConversationIndexesPromise = null;
  }

  async getClient() {
    if (!this.env.MONGODB_URI) {
      throw new Error("MongoDB configuration is missing");
    }

    if (!this.clientPromise) {
      this.clientPromise = import("mongodb").then(({ MongoClient }) => {
        const client = new MongoClient(this.env.MONGODB_URI, {
          // Atlas connections must always use TLS, including when an operator
          // supplies a standard mongodb:// URI instead of an SRV URI.
          tls: true,
          // The Durable Object is shared by all API users. A single socket
          // serialized MongoDB operations and became a throughput bottleneck.
          // Keep the pool bounded so Atlas connection usage remains predictable.
          maxPoolSize: getMongoPoolSize(this.env.MONGODB_MAX_POOL_SIZE),
          minPoolSize: 0,
          waitQueueTimeoutMS: 5000,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
          maxIdleTimeMS: 20000
        });
        return client.connect().then(() => client);
      }).catch((error) => {
        this.clientPromise = null;
        throw error;
      });
    }

    return this.clientPromise;
  }

  getMediaUrl(path) {
    let clean = String(path || "").trim();
    const frontend = String(this.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
    const configured = String(this.env.CDN_HOSTNAME || "").trim();
    let frontendHost = "";
    let cdnHost = "";
    try { if (frontend) frontendHost = new URL(frontend).host; } catch {}
    try { if (configured) cdnHost = new URL(/^https:\/\//i.test(configured) ? configured : "https://" + configured).host; } catch {}

    if (/^https?:\/\//i.test(clean)) {
      try {
        const parsed = new URL(clean);
        // Normalize generated photo keys from the configured CDN, staging frontend,
        // or legacy hosts to the single configured CDN_HOSTNAME. Never preserve a
        // legacy hostname for a known generated photo key.
        const generatedPhotoPath = /(?:^|\/)photos-[A-Za-z0-9_-]{1,128}-(?:[0-9a-f-]{36}|[0-9]{10,16})\.(?:jpg|jpeg|png|gif|webp)$/i.test(parsed.pathname);
        if (parsed.host === frontendHost || (cdnHost && parsed.host === cdnHost) || generatedPhotoPath) {
          clean = parsed.pathname;
        } else {
          return clean;
        }
      } catch {
        return clean;
      }
    }

    clean = clean.replace(/^\/+/, "");
    clean = clean.replace(/^(?:api\/media|media)\//i, "");
    // The legacy CDN stored generated photo keys at the bucket root even when
    // application URLs included /photos/ or /media/ prefixes.
    const basename = clean.split("/").pop() || "";
    const isGeneratedPhotoKey = /^photos-[A-Za-z0-9_-]{1,128}-(?:[0-9a-f-]{36}|[0-9]{10,16})\.(?:jpg|jpeg|png|gif|webp)$/i.test(basename);
    if (isGeneratedPhotoKey) clean = basename;
    const encoded = clean.split("/").map(part => encodeURIComponent(part)).join("/");
    if (configured) {
      try {
        const base = new URL(/^https:\/\//i.test(configured) ? configured : "https://" + configured);
        if (base.protocol === "https:" && !base.username && !base.password && !base.search && !base.hash) {
          let basePath = base.pathname;
          while (basePath.endsWith("/")) basePath = basePath.slice(0, -1);
          base.pathname = basePath + "/" + encoded;
          return base.toString();
        }
      } catch {
        // Fall through to the Worker media route if the CDN value is invalid.
      }
    }
    return clean;
  }

  getDatabase(client) {
    // Honor the explicit environment database when set; otherwise preserve the URI default.
    return client.db(this.env.MONGODB_DATABASE || undefined);
  }

  async ensureSubscriptionIndexes(db) {
    if (!this.subscriptionIndexMigrationPromise) {
      const subscriptions = db.collection("subscriptions");
      this.subscriptionIndexMigrationPromise = (async () => {
        // Lightweight unit-test collection doubles do not implement index APIs.
        // Production MongoDB collections expose both methods.
        if (typeof subscriptions.dropIndex !== "function" || typeof subscriptions.createIndex !== "function") {
          return;
        }
        // Legacy unique indexes treat missing/null Stripe IDs as the same value,
        // blocking non-Stripe pending subscriptions. Enforce uniqueness only for
        // actual string Stripe subscription IDs.
        try {
          await subscriptions.dropIndex("stripeSubscriptionId_1");
        } catch (error) {
          if (!error || ![26, 27].includes(error.code)) throw error;
        }
        await subscriptions.createIndex(
          { stripeSubscriptionId: 1 },
          {
            name: "stripeSubscriptionId_1",
            unique: true,
            partialFilterExpression: { stripeSubscriptionId: { $type: "string" } }
          }
        );
        console.info("MongoDB subscription index migration completed", {
          phase: "ensure-subscription-index",
          index: "stripeSubscriptionId_1",
          policy: "unique-string-values-only"
        });
      })().catch((error) => {
        this.subscriptionIndexMigrationPromise = null;
        console.error("MongoDB subscription index migration failed", {
          phase: "ensure-subscription-index",
          name: error && typeof error.name === "string" ? error.name : "Error",
          code: error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : undefined,
          codeName: error && typeof error.codeName === "string" ? error.codeName : undefined,
          message: error && typeof error.message === "string" ? error.message.slice(0, 240) : undefined
        });
        throw error;
      });
    }
    return this.subscriptionIndexMigrationPromise;
  }

  async runScheduledExpirations(now = new Date(), scope = "all") {
    if (!["all", "trials", "subscriptions", "moderation"].includes(scope)) throw new Error("Invalid expiration scope");
    const db = this.getDatabase(await this.getClient());
    const subscriptions = db.collection("subscriptions");
    const users = db.collection("users");
    let expiredSubscriptions = 0;
    let expiredTrialsCount = 0;
    let downgradedUsers = 0;

    // Bounded batches keep each Cron invocation within Worker execution limits.
    if (scope === "all" || scope === "subscriptions") {
    const expired = await subscriptions.find({
      status: "active",
      endDate: { $lt: now }
    }).sort({ endDate: 1 }).limit(500).toArray();

    for (const sub of expired) {
      const result = await subscriptions.updateOne(
        { _id: sub._id, status: "active", endDate: { $lt: now } },
        { $set: { status: "inactive", updatedAt: now } }
      );
      if (!result.modifiedCount) continue;
      expiredSubscriptions += 1;

      // Do not downgrade a user if another paid subscription is still active.
      const active = await subscriptions.findOne({
        userId: sub.userId,
        status: "active",
        endDate: { $gt: now }
      }, { projection: { _id: 1 } });
      if (!active) {
        // Preserve a still-valid trial even when a separate paid subscription expires.
        const downgraded = await users.updateOne(
          {
            _id: sub.userId,
            plan: "premium",
            $or: [
              { trialExpires: { $exists: false } },
              { trialExpires: null },
              { trialExpires: { $lte: now } }
            ]
          },
          { $set: { plan: "basic", updatedAt: now } }
        );
        downgradedUsers += downgraded.modifiedCount || 0;
      }
    }

    }

    // Expire trial-based premium access only when there is no active paid plan.
    if (scope === "all" || scope === "trials") {
    const expiredTrials = await users.find({
      plan: "premium",
      trialExpires: { $lt: now, $ne: null }
    }).sort({ trialExpires: 1 }).limit(500).toArray();

    for (const user of expiredTrials) {
      const active = await subscriptions.findOne({
        userId: user._id,
        status: "active",
        endDate: { $gt: now }
      }, { projection: { _id: 1 } });
      if (active) continue;
      const result = await users.updateOne(
        { _id: user._id, plan: "premium", trialExpires: { $lt: now, $ne: null } },
        { $set: { plan: "basic", trialExpires: null, updatedAt: now } }
      );
      expiredTrialsCount += result.modifiedCount || 0;
      downgradedUsers += result.modifiedCount || 0;
    }

    }

    // Restore only expired temporary suspensions. Permanent bans are never
    // automatically lifted by the scheduled job.
    if (scope === "all" || scope === "moderation") {
      const expiredSuspensions = await users.find({
        suspendedUntil: { $lte: now },
        $or: [
          { accountStatus: "temporarily_suspended" },
          { accountStatus: { $exists: false } }
        ]
      }).sort({ suspendedUntil: 1 }).limit(500).toArray();
      for (const user of expiredSuspensions) {
        // Support legacy temporary suspensions created before accountStatus
        // existed, while never lifting an explicitly permanent ban.
        if ((user.accountStatus !== "temporarily_suspended" && user.accountStatus !== undefined) ||
            !user.suspendedUntil || new Date(user.suspendedUntil) > now) continue;
        const accountFilter = user.accountStatus === "temporarily_suspended"
          ? { accountStatus: "temporarily_suspended" }
          : { accountStatus: { $exists: false } };
        await users.updateOne(
          { _id: user._id, ...accountFilter, suspendedUntil: { $lte: now } },
          {
            $set: {
              accountStatus: "active",
              isProfileVisible: user.profileVisibilityBeforeSuspension !== false,
              updatedAt: now
            },
            $unset: {
              suspendedUntil: "", profileVisibilityBeforeSuspension: "",
              moderationReason: "", suspendedBy: ""
            }
          }
        );
      }
    }

    return {
      success: true,
      expiredSubscriptions,
      expiredTrials: expiredTrialsCount,
      downgradedUsers
    };
  }

  async ping() {
    try {
      const client = await this.getClient();
      const db = this.getDatabase(client);
      await db.command({ ping: 1 });
      return { ok: true };
    } catch (error) {
      console.error("MongoDB readiness probe failed", {
        phase: "mongodb-readiness",
        name: error && typeof error.name === "string" ? error.name : "Error",
        code: error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : undefined,
        message: error && typeof error.message === "string" ? error.message.slice(0, 200) : undefined
      });
      return { ok: false };
    }
  }

  async ensureSuperadminUser(email) {
    if (typeof email !== "string" || !email.trim() || email.length > 320) {
      return { status: 400, body: { error: "Invalid superadmin email" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const existing = await users.findOne({ uid: "superadmin_uid" });
      if (existing && existing.role !== "superadmin") {
        return { status: 409, body: { error: "Reserved superadmin identity conflicts with an existing account" } };
      }
      const other = await users.findOne({ email: email.trim().toLowerCase(), uid: { $ne: "superadmin_uid" } });
      if (other) return { status: 409, body: { error: "Superadmin email is linked to another account" } };
      const now = new Date();
      await users.updateOne(
        { uid: "superadmin_uid" },
        { $set: {
          uid: "superadmin_uid", email: email.trim().toLowerCase(),
          name: "Super Admin", role: "superadmin", plan: "premium",
          isOnboardingComplete: true, isProfileVisible: false, updatedAt: now
        }, $setOnInsert: { createdAt: now, photos: [], blocked: [], interests: [], profilePrompts: [] } },
        { upsert: true }
      );
      return { status: 200, body: { success: true } };
    } catch {
      return { status: 503, body: { error: "Superadmin account provisioning unavailable" } };
    }
  }

  async findOrCreateUserFromClaims(claims) {
    if (!claims || typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }

    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const existingByUid = await users.findOne({ uid: claims.sub });
      if (existingByUid) {
        if (existingByUid.deletionRequestedAt || ["deletion_pending", "deleted"].includes(existingByUid.accountStatus)) {
          return { status: 403, body: { error: "This account is unavailable." } };
        }
        return { status: 200, user: existingByUid };
      }

      const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
      if (!email || claims.email_verified !== true) {
        return { status: 403, body: { error: "User provisioning requires a verified email address" } };
      }

      const existingByEmail = await users.findOne({ $expr: { $eq: [{ $toLower: "$email" }, email] } });
      if (existingByEmail) {
        if (existingByEmail.uid && existingByEmail.uid !== claims.sub) {
          return { status: 409, body: { error: "This email is already linked to another account" } };
        }
        const linked = await users.findOneAndUpdate(
          { _id: existingByEmail._id, $or: [{ uid: { $exists: false } }, { uid: null }, { uid: "" }] },
          { $set: { uid: claims.sub, email } },
          { returnDocument: "after" }
        );
        if (linked && linked.uid === claims.sub) return { status: 200, user: linked };
        return { status: 409, body: { error: "Account identity changed; please retry sign-in" } };
      }

      const user = {
        uid: claims.sub,
        email,
        name: typeof claims.name === "string" ? claims.name : "",
        trialExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
        isOnboardingComplete: false,
        interests: [],
        profilePrompts: [],
        blocked: [],
        photos: [],
        totalPhotoSize: 0,
        isVerified: false,
        plan: "basic",
        role: "user",
        isProfileVisible: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      try {
        const result = await users.insertOne(user);
        user._id = result.insertedId;
        return { status: 200, user };
      } catch (error) {
        if (error?.code === 11000) {
          const racedUser = await users.findOne({ uid: claims.sub });
          if (racedUser) return { status: 200, user: racedUser };
          return { status: 409, body: { error: "Account already exists; please retry sign-in" } };
        }
        throw error;
      }
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }





  async addUploadedPhoto(uid, photo) {
    if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
        !photo || typeof photo.url !== "string" || !photo.url.startsWith("photos-" + uid + "-") || photo.url.length > 256 || ![".jpg", ".jpeg", ".png", ".gif", ".webp"].some(ext => photo.url.endsWith(ext)) ||
        !Number.isInteger(photo.size) || photo.size < 1 || photo.size > 5 * 1024 * 1024) {
      return { status: 400, body: { message: "Invalid photo metadata" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const account = await users.findOne({ uid }, { projection: { accountStatus: 1, suspendedUntil: 1 } });
      if (!account) return { status: 404, body: { message: "User not found" } };
      if (isAccountRestricted(account)) return { status: 403, body: { message: "Account is suspended or banned." } };
      const result = await users.findOneAndUpdate({
        uid,
        $expr: {
          $and: [
            { $lt: [{ $size: { $ifNull: ["$photos", []] } }, 6] },
            { $lte: [{ $add: [{ $ifNull: ["$totalPhotoSize", 0] }, photo.size] }, 25 * 1024 * 1024] }
          ]
        }
      }, [{
        $set: {
          photos: {
            $concatArrays: [
              { $ifNull: ["$photos", []] },
              [{ url: photo.url, order: { $size: { $ifNull: ["$photos", []] } }, size: photo.size }]
            ]
          },
          totalPhotoSize: { $add: [{ $ifNull: ["$totalPhotoSize", 0] }, photo.size] },
          updatedAt: new Date()
        }
      }], { returnDocument: "after", projection: { password: 0, lastLoginIp: 0 } });
      if (result) return { status: 201, body: { success: true, fileUrl: photo.url } };
      const user = await users.findOne({ uid }, { projection: { photos: 1, totalPhotoSize: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      return { status: 400, body: { message: (user.photos || []).length >= 6 ? "You have reached the maximum of 6 photos." : "Uploading this photo would exceed your total storage limit." } };
    } catch {
      return { status: 503, body: { message: "Photo metadata service unavailable" } };
    }
  }

  async removeUploadedPhoto(uid, key) {
    if (typeof uid !== "string" || !uid || typeof key !== "string" || !key.startsWith("photos-" + uid + "-") ||
        key.length > 256 || ![".jpg", ".jpeg", ".png", ".gif", ".webp"].some(ext => key.endsWith(ext))) {
      return { status: 400, body: { message: "Invalid photo key" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne({ uid }, { projection: { photos: 1, accountStatus: 1, suspendedUntil: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      if (isAccountRestricted(user)) return { status: 403, body: { message: "Account is suspended or banned." } };
      const photo = (user.photos || []).find(item => item.url === key);
      if (!photo) return { status: 404, body: { message: "Photo not found in profile" } };
      if ((user.photos || []).length <= 1) return { status: 400, body: { message: "You must have at least one photo." } };
      const size = Number.isFinite(photo.size) && photo.size > 0 ? photo.size : 0;
      const result = await users.updateOne(
        { uid, "photos.url": key, "photos.1": { $exists: true } },
        { $set: { "photos.$.deletionPending": true, "photos.$.deletionRequestedAt": new Date(), updatedAt: new Date() } }
      );
      if (!result.modifiedCount) return { status: 409, body: { message: "Photo list changed; refresh and retry" } };
      return { status: 200, body: { message: "Photo deletion queued" } };
    } catch {
      return { status: 503, body: { message: "Photo metadata service unavailable" } };
    }
  }

  async finalizeUploadedPhotoDeletion(uid, key) {
    if (typeof uid !== "string" || !uid || typeof key !== "string" || !key.startsWith("photos-" + uid + "-") ||
        key.length > 256 || ![".jpg", ".jpeg", ".png", ".gif", ".webp"].some(ext => key.endsWith(ext))) {
      return { status: 400, body: { message: "Invalid photo key" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne({ uid }, { projection: { photos: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const photo = (user.photos || []).find(item => item.url === key && item.deletionPending === true);
      if (!photo) return { status: 404, body: { message: "Pending photo deletion not found" } };
      const size = Number.isFinite(photo.size) && photo.size > 0 ? photo.size : 0;
      const result = await users.updateOne(
        { uid, photos: { $elemMatch: { url: key, deletionPending: true } } },
        { $pull: { photos: { url: key, deletionPending: true } }, $inc: { totalPhotoSize: -size }, $set: { updatedAt: new Date() } }
      );
      if (!result.modifiedCount) return { status: 409, body: { message: "Photo deletion state changed; retry" } };
      return { status: 200, body: { message: "Photo deleted successfully" } };
    } catch {
      return { status: 503, body: { message: "Photo metadata service unavailable" } };
    }
  }

  async updatePhotoOrder(uid, photos) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    if (!Array.isArray(photos)) return { status: 400, body: { error: "Invalid payload. 'photos' must be an array." } };
    if (photos.length > 6) return { status: 400, body: { error: "A maximum of 6 photos is allowed." } };
    const requestedUrls = [];
    for (const photo of photos) {
      if (!photo || typeof photo !== "object" || Array.isArray(photo) ||
          typeof photo.url !== "string" || !photo.url || photo.url.length > 2048) {
        return { status: 400, body: { error: "Invalid photo entry." } };
      }
      if (requestedUrls.includes(photo.url)) return { status: 400, body: { error: "Duplicate photo entries are not allowed." } };
      requestedUrls.push(photo.url);
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const account = typeof users.findOne === "function"
        ? await users.findOne({ uid }, { projection: { photos: 1, accountStatus: 1, suspendedUntil: 1 } })
        : null;
      if (typeof users.findOne === "function") {
        if (!account) return { status: 404, body: { error: "User not found" } };
        if (isAccountRestricted(account)) return { status: 403, body: { error: "Account is suspended or banned." } };
      }
      const currentPhotos = Array.isArray(account?.photos) ? account.photos : [];
      if (currentPhotos.some(photo => photo && typeof photo === "object" && photo.deletionPending === true)) {
        return { status: 409, body: { error: "A photo deletion is pending; retry after cleanup completes." } };
      }
      if (typeof users.findOne === "function") {
        const currentUrls = currentPhotos.map((photo) => typeof photo === "string" ? photo : photo?.url);
        if (requestedUrls.length !== currentUrls.length ||
            requestedUrls.some((url) => !currentUrls.includes(url))) {
          return { status: 400, body: { error: "Photo order can only contain the current user's existing photos." } };
        }
      }
      const normalized = requestedUrls.map((url, order) => {
        const existing = currentPhotos.find((photo) => (typeof photo === "string" ? photo : photo?.url) === url);
        if (!existing) return { url, order };
        if (typeof existing === "string") return { url, order };
        const item = { url, order };
        if (Number.isFinite(existing.size) && existing.size >= 0) item.size = existing.size;
        if (typeof existing._id === "string" && /^[a-fA-F0-9]{24}$/.test(existing._id)) item._id = existing._id;
        return item;
      });
      const result = await users.updateOne({ uid }, { $set: { photos: normalized } });
      if (!result.matchedCount) return { status: 404, body: { error: "User not found" } };
      return await this.getCurrentUserProfile(uid);
    } catch {
      return { status: 500, body: { error: "An unexpected error occurred while updating photo order." } };
    }
  }

  async unmatchUsers(currentUid, targetUid) {
    if (typeof currentUid !== "string" || !currentUid || currentUid.length > 128 ||
        typeof targetUid !== "string" || !targetUid || targetUid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    if (currentUid === targetUid) return { status: 400, body: { error: "Cannot unmatch yourself." } };
    try {
      const db = this.getDatabase(await this.getClient());
      const user1Uid = currentUid < targetUid ? currentUid : targetUid;
      const user2Uid = currentUid < targetUid ? targetUid : currentUid;
      const conversation = await db.collection("chatmessages").findOne({
        $or: [
          { senderUid: currentUid, receiverUid: targetUid },
          { senderUid: targetUid, receiverUid: currentUid }
        ]
      }, { projection: { roomId: 1 } });
      const result = await db.collection("matches").updateOne(
        { user1Uid, user2Uid, status: "matched" },
        { $set: { status: "unmatched", unmatchedBy: currentUid, unmatchedAt: new Date(), updatedAt: new Date() }, $unset: { likedBy: "" } }
      );
      if (!result.matchedCount) {
        // A previous request may have ended the match but failed while revoking
        // the Firebase RTDB membership. Treat an already-unmatched pair as an
        // idempotent retry and return the room ID so the caller can finish revocation.
        const existingMatch = await db.collection("matches").findOne(
          { user1Uid, user2Uid },
          { projection: { status: 1 } }
        );
        if (existingMatch?.status !== "unmatched") {
          return { status: 404, body: { error: "An active match with this person was not found." } };
        }
      }
      return { status: 200, body: {
        success: true, message: "Match ended successfully.",
        ...(typeof conversation?.roomId === "string" ? { roomId: conversation.roomId } : {})
      } };
    } catch {
      return { status: 503, body: { error: "Unable to unmatch this conversation right now." } };
    }
  }

  async updateBlockedUser(currentUid, targetUid, action) {
    if (typeof currentUid !== "string" || !currentUid || currentUid.length > 128 ||
        typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
        !["block", "unblock"].includes(action)) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    if (currentUid === targetUid) {
      return { status: 400, body: { error: action === "block" ? "Cannot block yourself." : "Cannot unblock yourself." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      if (action === "block") {
        const target = await users.findOne({ uid: targetUid }, { projection: { _id: 1 } });
        if (!target) return { status: 404, body: { error: "User to block not found." } };
        const conversation = await db.collection("chatmessages").findOne({
          $or: [
            { senderUid: currentUid, receiverUid: targetUid },
            { senderUid: targetUid, receiverUid: currentUid }
          ]
        }, { projection: { roomId: 1 } });
        const current = await users.updateOne({ uid: currentUid }, { $addToSet: { blocked: targetUid } });
        if (!current.matchedCount) return { status: 404, body: { error: "Current user not found during update." } };
        const user1Uid = currentUid < targetUid ? currentUid : targetUid;
        const user2Uid = currentUid < targetUid ? targetUid : currentUid;
        await db.collection("matches").updateOne(
          { user1Uid, user2Uid },
          { $set: { status: "unmatched" }, $unset: { likedBy: "" } }
        );
        return { status: 200, body: {
          message: "User " + targetUid + " successfully blocked.",
          ...(typeof conversation?.roomId === "string" ? { roomId: conversation.roomId } : {})
        } };
      }
      const current = await users.updateOne({ uid: currentUid }, { $pull: { blocked: targetUid } });
      if (!current.matchedCount) return { status: 404, body: { error: "Current user not found." } };
      return { status: 200, body: { message: "User " + targetUid + " successfully unblocked." } };
    } catch {
      return {
        status: 500,
        body: { error: action === "block"
          ? "An unexpected error occurred while blocking user."
          : "An unexpected error occurred while unblocking user." }
      };
    }
  }

  async setInitialPassword(uid, newPassword) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "User not authenticated properly." } };
    }
    if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 1024) {
      return { status: 400, body: { error: "Password must be at least 6 characters long." } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne({ uid }, { projection: { mustSetPassword: 1 } });
      if (!user) return { status: 404, body: { error: "User not found." } };
      if (user.mustSetPassword !== true) {
        return { status: 400, body: { error: "Password already set or action not allowed." } };
      }
      const { default: bcrypt } = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const result = await users.updateOne(
        { uid, mustSetPassword: true },
        { $set: { password: passwordHash, mustSetPassword: false, updatedAt: new Date() } }
      );
      if (!result.matchedCount) return { status: 409, body: { error: "Password setup state changed; please retry." } };
      return { status: 200, body: { message: "Password set successfully." } };
    } catch {
      return { status: 503, body: { error: "Password setup service unavailable" } };
    }
  }

  async undoSwipe(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = this.getDatabase(await this.getClient());
      await this.ensureSubscriptionIndexes(db);
      const users = db.collection("users");
      const user = await users.findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found." } };
      if ((!user.undoSwipes || user.undoSwipes.count <= 0) && !(user.purchasedUndoSwipes > 0)) {
        return { status: 400, body: { error: "No undo swipes remaining." } };
      }
      const lastSwipe = user.lastSwipe;
      if (!lastSwipe || !lastSwipe.action) return { status: 404, body: { error: "No swipe to undo." } };
      if (!lastSwipe.matchId) return { status: 404, body: { error: "Cannot find the match record for the swipe to undo." } };
      const matches = db.collection("matches");
      const match = await matches.findOne({ _id: lastSwipe.matchId });
      if (!match) return { status: 404, body: { error: "Cannot find the match record for the swipe to undo." } };

      let undoCreditSource = null;
      if (user.purchasedUndoSwipes > 0) {
        const consumed = await users.updateOne({ uid, purchasedUndoSwipes: { $gt: 0 } }, { $inc: { purchasedUndoSwipes: -1 } });
        if (consumed.matchedCount) undoCreditSource = "purchasedUndoSwipes";
      }
      if (!undoCreditSource) {
        const consumed = await users.updateOne({ uid, "undoSwipes.count": { $gt: 0 } }, { $inc: { "undoSwipes.count": -1 } });
        if (consumed.matchedCount) undoCreditSource = "undoSwipes.count";
      }
      if (!undoCreditSource) return { status: 400, body: { error: "No undo swipes remaining." } };

      const update = { $set: { status: "pending", updatedAt: new Date() } };
      if (lastSwipe.action === "like" || lastSwipe.action === "superlike") {
        update.$pull = { likedBy: uid };
      }
      if (lastSwipe.action === "superlike") update.$set.superLike = false;
      await matches.updateOne({ _id: match._id }, update);

      if (lastSwipe.action === "superlike") {
        if (lastSwipe.superLikeSource === "purchasedSuperLikes") {
          await users.updateOne({ uid }, { $inc: { purchasedSuperLikes: 1 } });
        } else {
          await users.updateOne({ uid }, { $inc: { "superLikes.count": 1 } });
        }
      }
      await users.updateOne({ uid }, { $unset: { lastSwipe: "" }, $set: { updatedAt: new Date() } });

      const target = await users.findOne({ uid: lastSwipe.targetUserId });
      if (!target) return { status: 200, body: { undoneUser: null } };
      const profile = { ...target };
      delete profile.password;
      delete profile.lastLoginIp;
      if (profile.uid !== uid) {
        delete profile.email;
        delete profile.mobileNumber;
        delete profile.phoneNumber;
        delete profile.contactNumber;
      }
      if (profile._id !== undefined) profile.id = String(profile._id);
      if (Array.isArray(profile.photos)) {
        profile.photos = profile.photos.map(photo => {
          if (!photo || typeof photo.url !== "string" || !photo.url) return photo;
          let path = photo.url;
          while (path.startsWith("/")) path = path.slice(1);
          return { ...photo, url: this.getMediaUrl(path) };
        });
      }
      return { status: 200, body: { undoneUser: profile } };
    } catch {
      return { status: 503, body: { error: "Swipe service unavailable" } };
    }
  }

  async recordSwipe(uid, targetUid, action, canonical = false) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
        !["like", "pass", "superlike"].includes(action)) {
      return { status: 400, body: { error: "Invalid swipe request" } };
    }
    if (uid === targetUid) return { status: 400, body: { error: "Cannot swipe on yourself." } };
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const [currentUser, targetUser] = await Promise.all([
        users.findOne({ uid }, { projection: { blocked: 1, purchasedSuperLikes: 1, superLikes: 1, accountStatus: 1, suspendedUntil: 1 } }),
        users.findOne({ uid: targetUid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1 } })
      ]);
      if (!currentUser) return { status: 404, body: { error: "Current user not found." } };
      if (!targetUser) return { status: 404, body: { error: "Target user not found." } };
      if (isAccountRestricted(currentUser)) return { status: 403, body: { error: "Account is suspended or banned." } };
      if (isAccountRestricted(targetUser)) return { status: 403, body: { error: "Target account is unavailable." } };
      if (Array.isArray(currentUser.blocked) && currentUser.blocked.includes(targetUid)) {
        return { status: 403, body: { error: "You have blocked this user. Unblock them to swipe." } };
      }
      if (Array.isArray(targetUser.blocked) && targetUser.blocked.includes(uid)) {
        return { status: 403, body: { error: "This user has blocked you." } };
      }

      const matches = db.collection("matches");
      let superLikeSpent = null;
      if (action === "superlike") {
        if (Number(currentUser.purchasedSuperLikes) > 0) {
          const consumed = await users.updateOne({ uid, purchasedSuperLikes: { $gt: 0 } }, { $inc: { purchasedSuperLikes: -1 } });
          if (consumed.matchedCount) superLikeSpent = "purchasedSuperLikes";
        }
        if (!superLikeSpent) {
          const consumed = await users.updateOne({ uid, "superLikes.count": { $gt: 0 } }, { $inc: { "superLikes.count": -1 } });
          if (consumed.matchedCount) superLikeSpent = "superLikes.count";
        }
        if (!superLikeSpent) return { status: 400, body: { error: "No super likes remaining." } };
      }

      // A deterministic pair key plus a partial unique index prevents opposite
      // first likes from creating duplicate match documents under concurrency.
      const orderedUids = [uid, targetUid].sort();
      const pairKey = orderedUids.map(value => value.length + ":" + value).join("|");
      if (typeof matches.createIndex === "function") {
        if (!this.matchPairIndexPromise) {
          this.matchPairIndexPromise = matches.createIndex(
            { pairKey: 1 },
            {
              unique: true,
              partialFilterExpression: { pairKey: { $type: "string" } },
              name: "unique_match_pair_key"
            }
          ).catch(error => {
            this.matchPairIndexPromise = null;
            throw error;
          });
        }
        await this.matchPairIndexPromise;
      }

      let match = await matches.findOne({
        $or: [
          { user1Uid: uid, user2Uid: targetUid },
          { user1Uid: targetUid, user2Uid: uid }
        ]
      });
      const now = new Date();

      if (match && match.pairKey !== pairKey) {
        try {
          await matches.updateOne({ _id: match._id }, { $set: { pairKey, updatedAt: now } });
          match = await matches.findOne({ pairKey }) || { ...match, pairKey };
        } catch (error) {
          if (error?.code !== 11000) throw error;
          match = await matches.findOne({ pairKey }) || match;
        }
      }

      if (!match) {
        const user1Uid = canonical ? orderedUids[0] : uid;
        const user2Uid = canonical ? orderedUids[1] : targetUid;
        const initialMatch = {
          pairKey,
          user1Uid,
          user2Uid,
          status: action === "pass" ? "unmatched" : "pending",
          likedBy: action === "pass" ? [] : [uid],
          superLike: action === "superlike",
          createdAt: now,
          updatedAt: now
        };
        try {
          const inserted = await matches.insertOne(initialMatch);
          match = { _id: inserted.insertedId, ...initialMatch };
        } catch (error) {
          // The other participant may have inserted this pair after our read.
          // Recover from that unique-key race and apply this participant's vote.
          if (error?.code !== 11000) throw error;
          match = await matches.findOne({ pairKey });
          if (!match) throw error;
        }
      }

      if (action === "like" || action === "superlike") {
        const update = { $addToSet: { likedBy: uid }, $set: { updatedAt: now } };
        if (action === "superlike") update.$set.superLike = true;
        await matches.updateOne({ _id: match._id }, update);
        match = await matches.findOne({ _id: match._id }) || {
          ...match,
          likedBy: Array.from(new Set([...(Array.isArray(match.likedBy) ? match.likedBy : []), uid])),
          ...(action === "superlike" ? { superLike: true } : {}),
          updatedAt: now
        };
      } else {
        await matches.updateOne({ _id: match._id }, { $set: { status: "unmatched", updatedAt: now } });
        match.status = "unmatched";
        match.updatedAt = now;
      }

      if (action === "like" || action === "superlike") {
        const likedBy = Array.isArray(match.likedBy) ? match.likedBy : [];
        const isMutual = likedBy.includes(match.user1Uid) && likedBy.includes(match.user2Uid);
        // Only promote to matched. Writing a stale "pending" value here can
        // overwrite a reciprocal like committed by the other request between
        // our read and write. MongoDB evaluates this predicate atomically.
        if (isMutual) {
          const mutualUpdate = await matches.updateOne(
            { _id: match._id, likedBy: { $all: [match.user1Uid, match.user2Uid] } },
            { $set: { status: "matched", updatedAt: now } }
          );
          if (mutualUpdate.matchedCount) {
            match.status = "matched";
          } else {
            // An undo or moderation action may have changed the pair after our
            // read. Re-read before deciding whether to notify either user.
            match = await matches.findOne({ _id: match._id }) || match;
          }
        }
        const latestLikedBy = Array.isArray(match.likedBy) ? match.likedBy : [];
        const finalStatus = latestLikedBy.includes(match.user1Uid) && latestLikedBy.includes(match.user2Uid)
          ? "matched" : match.status || "pending";
        const notificationType = finalStatus === "matched" ? "match" : action === "superlike" ? "superlike" : "like";
        await db.collection("notifications").updateOne(
          { recipientUid: targetUid, senderUid: uid, type: notificationType },
          { $setOnInsert: {
            recipientUid: targetUid,
            senderUid: uid,
            type: notificationType,
            status: "pending",
            createdAt: now
          }, $set: { updatedAt: now } },
          { upsert: true }
        );
        if (finalStatus === "matched") {
          await db.collection("notifications").deleteOne({
            recipientUid: targetUid, senderUid: uid, type: { $in: ["like", "superlike"] }
          });
          await db.collection("notifications").deleteOne({
            recipientUid: uid, senderUid: targetUid, type: { $in: ["like", "superlike"] }
          });
          await db.collection("notifications").updateOne(
            { recipientUid: uid, senderUid: targetUid, type: "match" },
            { $setOnInsert: {
              recipientUid: uid,
              senderUid: targetUid,
              type: "match",
              status: "pending",
              createdAt: now
            }, $set: { updatedAt: now } },
            { upsert: true }
          );
        }
      } else {
        await db.collection("notifications").deleteOne({
          recipientUid: uid, senderUid: targetUid, type: { $in: ["like", "superlike"] }
        });
      }

      await users.updateOne({ uid }, {
        $set: { lastSwipe: { action, targetUserId: targetUid, matchId: match._id, timestamp: now, ...(action === "superlike" ? { superLikeSource: superLikeSpent } : {}) }, updatedAt: now }
      });
      return {
        status: 200,
        body: {
          ...match,
          _id: match._id === undefined ? undefined : String(match._id)
        }
      };
    } catch (error) {
      console.error("Swipe recording failed", {
        name: error && typeof error.name === "string" ? error.name : "Error",
        code: error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : undefined,
        message: error && typeof error.message === "string" ? error.message.slice(0, 180) : undefined
      });
      return { status: 503, body: { error: "Swipe service unavailable" } };
    }
  }

  getDefaultNotificationPreferences() {
    return {
      channels: { inApp: true, desktop: true, sounds: true, callRingtone: true },
      events: {
        newMatches: true, newLikes: true, newMessages: true,
        voiceCalls: true, videoCalls: true, profileViews: true,
        roomInvitations: true, roomBookings: true, subscriptionUpdates: true,
        paymentUpdates: true, supportUpdates: true, securityAlerts: true,
        productUpdates: true
      }
    };
  }

  normalizeNotificationPreferences(value = {}) {
    const defaults = this.getDefaultNotificationPreferences();
    const normalized = { channels: { ...defaults.channels }, events: { ...defaults.events } };
    for (const group of ["channels", "events"]) {
      if (!value[group] || typeof value[group] !== "object" || Array.isArray(value[group])) continue;
      for (const key of Object.keys(defaults[group])) {
        if (typeof value[group][key] === "boolean") normalized[group][key] = value[group][key];
      }
    }
    return normalized;
  }

  async getNotificationPreferences(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const user = await this.getDatabase(await this.getClient()).collection("users")
        .findOne({ uid }, { projection: { notificationPreferences: 1, _id: 0 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      return { status: 200, body: this.normalizeNotificationPreferences(user.notificationPreferences) };
    } catch {
      return { status: 503, body: { error: "Notification preferences unavailable" } };
    }
  }

  async updateNotificationPreferences(uid, preferences) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        !preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
      return { status: 400, body: { error: "Invalid notification preferences" } };
    }
    const allowedGroups = ["channels", "events"];
    for (const group of Object.keys(preferences)) {
      if (!allowedGroups.includes(group) || !preferences[group] || typeof preferences[group] !== "object" ||
          Array.isArray(preferences[group])) {
        return { status: 400, body: { error: "Invalid notification preference group" } };
      }
      const allowedKeys = Object.keys(this.getDefaultNotificationPreferences()[group]);
      for (const [key, value] of Object.entries(preferences[group])) {
        if (!allowedKeys.includes(key) || typeof value !== "boolean") {
          return { status: 400, body: { error: "Invalid notification preference", field: group + "." + key } };
        }
      }
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne({ uid }, { projection: { notificationPreferences: 1, _id: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const current = this.normalizeNotificationPreferences(user.notificationPreferences);
      const next = {
        channels: { ...current.channels, ...(preferences.channels || {}) },
        events: { ...current.events, ...(preferences.events || {}) }
      };
      await users.updateOne({ _id: user._id }, {
        $set: { notificationPreferences: next, updatedAt: new Date() }
      });
      return { status: 200, body: next };
    } catch {
      return { status: 503, body: { error: "Could not save notification preferences" } };
    }
  }

  async getNotifications(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const notifications = await this.getDatabase(await this.getClient()).collection("notifications")
        .find({ recipientUid: uid, status: "pending" })
        .sort({ createdAt: -1 })
        .toArray();
      return { status: 200, body: notifications };
    } catch {
      return { status: 503, body: { error: "Notification service unavailable" } };
    }
  }

  async getPotentialMatches(uid, filters = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128 || !filters || typeof filters !== "object" || Array.isArray(filters)) {
      return { status: 400, body: { error: "Invalid match request" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const currentUser = await db.collection("users").findOne({ uid });
      if (!currentUser) return { status: 404, body: { error: "Current user not found." } };
      const query = {
        uid: { $ne: uid, $nin: Array.isArray(currentUser.blocked) ? currentUser.blocked : [] },
        blocked: { $ne: uid },
        isProfileVisible: true
      };
      if (currentUser.preference) query.gender = currentUser.preference;
      if (typeof filters.education === "string" && filters.education.length <= 100) query.education = filters.education;
      if (typeof filters.relationshipGoals === "string" && filters.relationshipGoals.length <= 100) query.relationshipGoals = filters.relationshipGoals;
      if (typeof filters.interests === "string") {
        const interests = filters.interests.split(",").map(value => value.trim()).filter(Boolean).slice(0, 50);
        if (interests.length) query.interests = { $in: interests };
      }
      if (typeof filters.personalityType === "string" && filters.personalityType.length <= 20) {
        query["personalityQuizResults.type"] = filters.personalityType;
      }

      const projection = {
        uid: 1, email: 1, name: 1, birthday: 1, gender: 1, bio: 1, photos: 1,
        videoProfile: 1, isVerified: 1, education: 1, relationshipGoals: 1,
        location: 1, lastActiveAt: 1, interests: 1, personalityQuizResults: 1,
        personalityType: 1, badges: 1, lifestyle: 1, mobileNumber: 1, password: 1,
        lastLoginIp: 1, role: 1, isOnboardingComplete: 1, _id: 1
      };
      const candidates = await db.collection("users").find(query, { projection }).toArray();
      const score = candidate => {
        let value = 0;
        const currentInterests = new Set((Array.isArray(currentUser.interests) ? currentUser.interests : [])
          .map(item => typeof item === "string" ? item.toLowerCase().trim() : "").filter(Boolean));
        for (const item of (Array.isArray(candidate.interests) ? candidate.interests : [])) {
          const normalized = typeof item === "string" ? item.toLowerCase().trim() : "";
          if (normalized && currentInterests.has(normalized)) value += 10;
        }
        if (typeof currentUser.relationshipGoals === "string" && typeof candidate.relationshipGoals === "string" &&
            currentUser.relationshipGoals.trim().toLowerCase() === candidate.relationshipGoals.trim().toLowerCase()) value += 30;
        const currentType = currentUser.personalityQuizResults?.type;
        const candidateType = candidate.personalityQuizResults?.type;
        if (typeof currentType === "string" && typeof candidateType === "string" &&
            currentType.trim().toLowerCase() === candidateType.trim().toLowerCase()) value += 20;
        return value;
      };
      const ranked = candidates.map(user => ({ user, matchScore: score(user) }))
        .sort((a, b) => b.matchScore - a.matchScore);
      const parsedPage = Number.parseInt(filters.page, 10);
      const parsedLimit = Number.parseInt(filters.limit, 10);
      const page = Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100000) : 1;
      const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 10;
      const totalMatches = ranked.length;
      const paginated = ranked.slice((page - 1) * limit, page * limit);
      const sanitized = paginated.map(item => {
        const profile = { ...item.user };
        delete profile.password;
        delete profile.lastLoginIp;
        if (currentUser.role !== "superadmin") stripPrivateContactFields(profile);
        if (profile._id !== undefined) profile.id = String(profile._id);
        if (profile.birthday) {
          const birthday = new Date(profile.birthday);
          if (!Number.isNaN(birthday.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - birthday.getFullYear();
            const month = today.getMonth() - birthday.getMonth();
            if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age--;
            profile.age = age;
          }
        }
        if (Array.isArray(profile.photos)) {
          profile.photos = profile.photos.map(photo => {
            if (!photo || typeof photo.url !== "string" || !photo.url) return photo;
            let path = photo.url;
            while (path.startsWith("/")) path = path.slice(1);
            return { ...photo, url: this.getMediaUrl(path) };
          });
        }
        stripPreciseLocation(profile);
        const responseProfile = currentUser.role === "superadmin" ? profile : sanitizePublicProfile(profile);
        return { ...item, user: responseProfile };
      });
      return {
        status: 200,
        body: {
          matches: sanitized,
          currentPage: page,
          totalPages: Math.ceil(totalMatches / limit),
          totalMatches
        }
      };
    } catch {
      return { status: 503, body: { error: "Match service unavailable" } };
    }
  }

  async getConfirmedMatches(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const [currentUser, matches] = await Promise.all([
        db.collection("users").findOne({ uid }, { projection: { role: 1 } }),
        db.collection("matches").find({
          $or: [{ user1Uid: uid }, { user2Uid: uid }],
          status: "matched"
        }).toArray()
      ]);
      if (!currentUser) return { status: 404, body: { error: "User not found" } };
      const matchedUids = [...new Set(matches.map(match => match.user1Uid === uid ? match.user2Uid : match.user1Uid).filter(Boolean))];
      if (matchedUids.length === 0) return { status: 200, body: [] };
      const users = await db.collection("users").find({ uid: { $in: matchedUids } }).toArray();
      const byUid = new Map(users.map(user => [user.uid, user]));
      return {
        status: 200,
        body: matchedUids.flatMap(matchedUid => {
          const user = byUid.get(matchedUid);
          if (!user) return [];
          const profile = { ...user };
          delete profile.password;
          delete profile.lastLoginIp;
          if (currentUser.role !== "superadmin") stripPrivateContactFields(profile);
          if (profile._id !== undefined) profile.id = String(profile._id);
          if (profile.birthday) {
            const birthday = new Date(profile.birthday);
            if (!Number.isNaN(birthday.getTime())) {
              const today = new Date();
              let age = today.getFullYear() - birthday.getFullYear();
              const month = today.getMonth() - birthday.getMonth();
              if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age--;
              profile.age = age;
            }
          }
          if (Array.isArray(profile.photos)) {
            profile.photos = profile.photos.map(photo => {
              if (!photo || typeof photo.url !== "string" || !photo.url) return photo;
              let path = photo.url;
              while (path.startsWith("/")) path = path.slice(1);
              return { ...photo, url: this.getMediaUrl(path) };
            });
          }
          stripPreciseLocation(profile);
          return [currentUser.role === "superadmin" ? profile : sanitizePublicProfile(profile)];
        })
      };
    } catch {
      return { status: 503, body: { error: "Match service unavailable" } };
    }
  }

  async discoverUsers(uid, filters = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128 || !filters || typeof filters !== "object" || Array.isArray(filters)) {
      return { status: 400, body: { error: "Invalid discovery request" } };
    }
    const allowedPreferences = ["Male", "Female", "Other", "everyone", "Everyone"];
    if (filters.preference !== undefined && !allowedPreferences.includes(filters.preference)) {
      return { status: 400, body: { error: "Invalid gender preference filter" } };
    }
    let phase = "connect-to-mongodb";
    try {
      const db = this.getDatabase(await this.getClient());
      phase = "load-current-user";
      const currentUser = await db.collection("users").findOne({ uid });
      if (!currentUser) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(currentUser)) return { status: 403, body: { error: "Account is suspended or banned." } };

      const minAge = filters.minAge === undefined ? null : Number.parseInt(filters.minAge, 10);
      const maxAge = filters.maxAge === undefined ? null : Number.parseInt(filters.maxAge, 10);
      const maxDistance = filters.maxDistance === undefined ? null : Number.parseInt(filters.maxDistance, 10);
      if ((filters.minAge !== undefined && (!Number.isInteger(minAge) || minAge < 18 || minAge > 100)) ||
          (filters.maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 18 || maxAge > 100)) ||
          (minAge !== null && maxAge !== null && minAge > maxAge) ||
          (filters.maxDistance !== undefined && (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 20000))) {
        return { status: 400, body: { error: "Invalid discovery filter" } };
      }

      const baseMatchQuery = {
        uid: {
          $type: "string",
          $ne: uid,
          $nin: Array.isArray(currentUser.blocked) ? currentUser.blocked.filter(value => typeof value === "string") : []
        },
        isProfileVisible: true,
        blocked: { $ne: uid }
      };
      // The active Discover filter takes precedence over the saved profile
      // preference. This is required for Tinder/Bumble-style "Show me" controls
      // to take effect immediately without rewriting the user's profile.
      const selectedPreference = filters.preference !== undefined
        ? filters.preference
        : currentUser.preference;
      if (["Male", "Female", "Other"].includes(selectedPreference)) {
        baseMatchQuery.gender = selectedPreference;
      }
      // Respect the candidate's own discovery preference as well. A candidate
      // who selected a specific gender should not be shown to an incompatible
      // viewer. Missing legacy preferences continue to behave as "everyone".
      if (["Male", "Female", "Other"].includes(currentUser.gender)) {
        baseMatchQuery.$and = [{
          $or: [
            { preference: { $in: ["everyone", "Everyone", currentUser.gender] } },
            { preference: { $exists: false } },
            { preference: null }
          ]
        }];
      }
      for (const key of ["sexualOrientation", "familyStatus", "relationshipGoals"]) {
        if (typeof filters[key] === "string" && filters[key].length <= 100) baseMatchQuery[key] = filters[key];
      }
      // Coarse location filtering is independent from GPS consent. City/country
      // values are user/profile supplied and are never treated as exact location.
      for (const key of ["city", "country"]) {
        const value = filters[key];
        if (typeof value === "string" && value.trim() && value.trim().length <= 100) {
          const escaped = value.trim().split("").map(ch => "\\.^$*+?()[]{}|".includes(ch) ? "\\" + ch : ch).join("");
          baseMatchQuery["location." + key] = { $regex: escaped, $options: "i" };
        }
      }
      const lifestyleKeys = ["drinking", "smoking", "exercise", "diet", "lookingFor", "pets", "religion", "politicalLeaning"];
      for (const key of lifestyleKeys) {
        if (typeof filters[key] === "string" && filters[key].length <= 100) baseMatchQuery["lifestyle." + key] = filters[key];
      }
      if (minAge !== null && maxAge !== null) {
        const today = new Date();
        const maxDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
        const minDate = new Date(today.getFullYear() - maxAge - 1, today.getMonth(), today.getDate());
        baseMatchQuery.birthday = { $gte: minDate, $lte: maxDate };
      }

      phase = "build-discovery-query";
      const pipeline = [];
      const coordinates = currentUser.location?.coordinates;
      // Mongoose's legacy schema defaults missing locations to [0, 0]. That is
      // a placeholder, not a usable location; do not run $geoNear for it.
      const hasLocation = maxDistance !== null &&
        currentUser.locationSharing?.enabled === true &&
        currentUser.locationSharing.updatedAt instanceof Date &&
        currentUser.locationSharing.updatedAt.getTime() <= Date.now() &&
        Date.now() - currentUser.locationSharing.updatedAt.getTime() <= 24 * 60 * 60 * 1000 &&
        Array.isArray(coordinates) && coordinates.length === 2 &&
        coordinates.every(Number.isFinite) &&
        coordinates[0] >= -180 && coordinates[0] <= 180 &&
        coordinates[1] >= -90 && coordinates[1] <= 90;
      if (maxDistance !== null && !hasLocation) {
        return { status: 409, body: { error: "Refresh and enable your current location before applying a distance filter." } };
      }
      if (hasLocation) {
        baseMatchQuery["locationSharing.enabled"] = true;
        baseMatchQuery["locationSharing.updatedAt"] = {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          $lte: new Date()
        };
        // $geoNear requires a 2dsphere index. Ensure it exists in MongoDB
        // instead of turning every distance-filtered Discover request into 503.
        phase = "ensure-location-index";
        await withTimeout(db.collection("users").createIndex({ location: "2dsphere" }), 8000, "Discovery location index creation");
        pipeline.push({
          $geoNear: {
            near: { type: "Point", coordinates },
            distanceField: "distanceMeters",
            maxDistance: maxDistance * 1000,
            spherical: true,
            query: baseMatchQuery
          }
        });
      } else {
        pipeline.push({ $match: baseMatchQuery });
      }
      pipeline.push(
        // Narrow the candidate set before checking interactions. The previous
        // pipeline performed a correlated matches lookup for every visible user
        // before applying any limits, which becomes expensive as the user base grows.
        {
          $facet: {
            boostedUsers: [
              { $match: { boostExpiresAt: { $gt: new Date() } } },
              { $limit: 10 }
            ],
            regularUsers: [
              { $match: { $or: [{ boostExpiresAt: { $lte: new Date() } }, { boostExpiresAt: { $exists: false } }] } },
              { $sort: { lastActiveAt: -1 } },
              { $limit: 100 }
            ]
          }
        },
        {
          $project: {
            combinedUsers: {
              // The facet predicates are mutually exclusive. Avoid an
              // unnecessary aggregation $in expression here: malformed
              // legacy profile data can otherwise make MongoDB treat its
              // second argument as missing and fail the entire Discover
              // request.
              $concatArrays: [
                { $ifNull: ["$boostedUsers", []] },
                {
                  $slice: [
                    { $ifNull: ["$regularUsers", []] },
                    {
                      $max: [
                        0,
                        {
                          $subtract: [
                            100,
                            { $size: { $ifNull: ["$boostedUsers", []] } }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        },
        { $unwind: "$combinedUsers" },
        { $replaceRoot: { newRoot: "$combinedUsers" } },
        {
          $lookup: {
            from: "matches",
            let: { candidateUid: "$uid" },
            pipeline: [{
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$user1Uid", "$$candidateUid"] }, { $eq: ["$user2Uid", uid] }] },
                    { $and: [{ $eq: ["$user1Uid", uid] }, { $eq: ["$user2Uid", "$$candidateUid"] }] }
                  ]
                }
              }
            }, { $limit: 1 }],
            as: "interaction"
          }
        },
        { $match: { interaction: { $eq: [] } } },
        { $limit: 20 },
        { $project: { uid: 1 } }
      );

      // Do not block every Discover request on index DDL. Index creation can wait
      // behind MongoDB locks and previously held this Durable Object request open
      // for over two minutes. Start it once per DO instance in the background;
      // the aggregation itself remains bounded by maxTimeMS below.
      if (!this.discoveryMatchIndexesPromise) {
        const matches = db.collection("matches");
        this.discoveryMatchIndexesPromise = Promise.all([
          matches.createIndex({ user1Uid: 1, user2Uid: 1 }, { name: "discover_user1_user2" }),
          matches.createIndex({ user2Uid: 1, user1Uid: 1 }, { name: "discover_user2_user1" })
        ]).catch((error) => {
          this.discoveryMatchIndexesPromise = null;
          console.error("MongoDB discovery index creation failed", {
            name: error && typeof error.name === "string" ? error.name : "Error",
            message: error && typeof error.message === "string" ? error.message.slice(0, 200) : undefined
          });
        });
      }

      phase = "run-discovery-aggregation";
      // Bound the aggregation so a missing/ineffective index cannot hold the
      // Durable Object request open for minutes.
      const uidDocs = await db.collection("users").aggregate(pipeline, { maxTimeMS: 15000 }).toArray();
      const orderedUids = uidDocs.map(doc => doc.uid).filter(value => typeof value === "string");
      if (orderedUids.length === 0) return { status: 200, body: [] };

      phase = "load-discovered-profiles-and-superlikes";
      const [candidateUsers, superLikeMatches] = await Promise.all([
        db.collection("users").find({ uid: { $in: orderedUids } }).toArray(),
        db.collection("matches").find({ user2Uid: uid, superLike: true }).project({ user1Uid: 1 }).toArray()
      ]);
      phase = "serialize-discovered-profiles";
      const usersByUid = new Map(candidateUsers.map(user => [user.uid, user]));
      const superLikedBy = new Set(superLikeMatches.map(match => match.user1Uid));
      const result = [];
      const viewerRelationshipPreferences = currentUser.relationshipPreferences;
      const publicRelationshipDiscovery = preferences => {
        if (!preferences || preferences.consent !== true) return {};
        const visibility = preferences.visibility || {};
        const exposed = {};
        for (const field of ["relationshipIntent", "relationshipStyles"]) {
          if (visibility[field] !== "public" || !Array.isArray(preferences[field])) continue;
          const values = [...new Set(preferences[field]
            .filter(value => typeof value === "string")
            .map(value => value.trim().toLowerCase())
            .filter(Boolean))];
          if (values.length) exposed[field] = values;
        }
        return exposed;
      };
      const viewerPublicRelationshipDiscovery = publicRelationshipDiscovery(viewerRelationshipPreferences);
      const relationshipCompatibilityScore = candidate => {
        let score = 0;
        const candidatePublic = publicRelationshipDiscovery(candidate.relationshipPreferences);
        for (const field of ["relationshipIntent", "relationshipStyles"]) {
          const viewerValues = viewerPublicRelationshipDiscovery[field] || [];
          const candidateValues = candidatePublic[field] || [];
          if (!viewerValues.length || !candidateValues.length) continue;
          const overlap = candidateValues.filter(value => viewerValues.includes(value)).length;
          if (overlap) score += Math.min(20, overlap * 10);
        }
        return score;
      };
      for (const candidateUid of orderedUids) {
        const user = usersByUid.get(candidateUid);
        if (!user) continue;
        const profile = { ...user };
        const relationshipDiscovery = publicRelationshipDiscovery(user.relationshipPreferences);
        if (Object.keys(relationshipDiscovery).length) profile.relationshipDiscovery = relationshipDiscovery;
        else delete profile.relationshipDiscovery;
        delete profile.password;
        delete profile.lastLoginIp;
        if (profile._id !== undefined) profile.id = String(profile._id);
        if (profile.isOnboardingComplete === undefined) profile.isOnboardingComplete = true;
        if (profile.birthday) {
          const birthday = new Date(profile.birthday);
          if (!Number.isNaN(birthday.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - birthday.getFullYear();
            const month = today.getMonth() - birthday.getMonth();
            if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age--;
            profile.age = age;
          }
        }
        if (Array.isArray(profile.photos)) {
          profile.photos = profile.photos.map(photo => {
            if (!photo || typeof photo.url !== "string" || !photo.url) return photo;
            return { ...photo, url: this.getMediaUrl(photo.url) };
          });
        }
        profile.superLikedByCurrentUser = superLikedBy.has(candidateUid);
        const safeProfile = sanitizePublicProfile(profile);
        if (hasLocation && Array.isArray(user.location?.coordinates) && user.location.coordinates.length === 2) {
          const [candidateLongitude, candidateLatitude] = user.location.coordinates;
          const [viewerLongitude, viewerLatitude] = coordinates;
          if ([candidateLongitude, candidateLatitude].every(Number.isFinite)) {
            const radians = value => value * Math.PI / 180;
            const latitudeDelta = radians(candidateLatitude - viewerLatitude);
            const longitudeDelta = radians(candidateLongitude - viewerLongitude);
            const haversine = Math.sin(latitudeDelta / 2) ** 2 +
              Math.cos(radians(viewerLatitude)) * Math.cos(radians(candidateLatitude)) *
              Math.sin(longitudeDelta / 2) ** 2;
            const boundedHaversine = Math.min(1, Math.max(0, haversine));
            const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
            safeProfile.distanceBand = distanceKm < 5 ? "Within 5 km"
              : distanceKm < 15 ? "5 to 15 km"
                : distanceKm < 30 ? "15 to 30 km"
                  : distanceKm < 50 ? "30 to 50 km" : "50+ km";
          }
        }
        result.push({
          profile: safeProfile,
          compatibilityScore: relationshipCompatibilityScore(user),
          boosted: Boolean(user.boostExpiresAt && new Date(user.boostExpiresAt) > new Date()),
          originalOrder: result.length
        });
      }
      // Compatibility is a soft ranking signal only. Existing paid boosts keep
      // their precedence, and all eligibility, consent, visibility and safety
      // filters have already been applied by the server-side discovery query.
      result.sort((a, b) =>
        Number(b.boosted) - Number(a.boosted) ||
        b.compatibilityScore - a.compatibilityScore ||
        a.originalOrder - b.originalOrder
      );
      return { status: 200, body: result.map(item => item.profile) };
    } catch (error) {
      console.error("MongoDB discovery query failed", {
        phase,
        name: error && typeof error.name === "string" ? error.name : "Error",
        code: error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : undefined,
        codeName: error && typeof error.codeName === "string" ? error.codeName : undefined,
        message: error && typeof error.message === "string" ? error.message.slice(0, 240) : undefined
      });
      return { status: 503, body: { error: "Discovery service unavailable" } };
    }
  }

  async getDarkFantasyStatus(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { birthday: 1, darkFantasyAccessUntil: 1, accountStatus: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const birthday = user.birthday ? new Date(user.birthday) : null;
      let age = null;
      if (birthday && !Number.isNaN(birthday.getTime())) {
        const now = new Date();
        age = now.getFullYear() - birthday.getFullYear();
        if (now.getMonth() < birthday.getMonth() || (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
      }
      const accessUntil = user.darkFantasyAccessUntil ? new Date(user.darkFantasyAccessUntil) : null;
      const entitled = Boolean(accessUntil && !Number.isNaN(accessUntil.getTime()) && accessUntil > new Date());
      const accountEligible = !["temporarily_suspended", "permanently_banned"].includes(user.accountStatus);
      const ageEligible = age !== null && age >= 18;
      return { status: 200, body: { enabled: true, ageEligible, accountEligible, hasAccess: entitled && ageEligible && accountEligible, accessUntil: entitled ? accessUntil.toISOString() : null } };
    } catch {
      return { status: 503, body: { error: "Dark Fantasy access status unavailable" } };
    }
  }

  async saveDarkFantasyProfile(uid, payload = {}) {
    const allowedInterests = new Set(["video-rooms", "cam-shows", "couples", "threesome", "ffm", "group-play", "femdom", "cuckold", "roleplay", "sensory-play", "lingerie", "intimacy-products"]);
    const allowedBoundaries = new Set(["no-explicit-media", "no-unmatched-messages", "verified-adults-only", "couples-only", "private-profile"]);
    if (typeof uid !== "string" || !uid || uid.length > 128 || !payload || typeof payload !== "object" || Array.isArray(payload)) return { status: 400, body: { error: "Invalid profile payload" } };
    if (payload.consent !== true) return { status: 400, body: { error: "Explicit opt-in consent is required" } };
    if (!Array.isArray(payload.interests) || payload.interests.length > 20 || payload.interests.some(x => typeof x !== "string" || !allowedInterests.has(x)) ||
        !Array.isArray(payload.boundaries) || payload.boundaries.length > 10 || payload.boundaries.some(x => typeof x !== "string" || !allowedBoundaries.has(x))) {
      return { status: 400, body: { error: "Invalid interests or boundaries" } };
    }
    if (!["private", "discoverable"].includes(payload.visibility)) return { status: 400, body: { error: "Invalid visibility setting" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const status = await this.getDarkFantasyStatus(uid);
      if (status.status !== 200) return status;
      if (!status.body.ageEligible) return { status: 403, body: { error: "Dark Fantasy is available only to eligible adults" } };
      if (!status.body.hasAccess) return { status: 402, body: { error: "A valid Dark Fantasy add-on is required" } };
      const now = new Date();
      const profile = {
        uid,
        consent: true,
        consentAt: now,
        interests: [...new Set(payload.interests)],
        boundaries: [...new Set(payload.boundaries)],
        visibility: payload.visibility,
        updatedAt: now
      };
      await db.collection("darkfantasyprofiles").createIndex({ uid: 1 }, { unique: true, name: "dark_fantasy_uid_unique" });
      await db.collection("darkfantasyprofiles").updateOne({ uid }, { $set: profile, $setOnInsert: { createdAt: now } }, { upsert: true });
      return { status: 200, body: { consent: profile.consent, interests: profile.interests, boundaries: profile.boundaries, visibility: profile.visibility, updatedAt: now.toISOString() } };
    } catch {
      return { status: 503, body: { error: "Dark Fantasy profile could not be saved" } };
    }
  }

  async deleteDarkFantasyProfile(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const client = await this.getClient();
      const db = this.getDatabase(client);
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await db.collection("darkfantasyprofiles").deleteOne({ uid }, { session });
          // DELETE is the user's explicit consent withdrawal. Revoke every Dark Fantasy
          // entitlement at the same time so existing gallery and room access cannot persist.
          await db.collection("users").updateOne(
            { uid },
            { $unset: {
              darkFantasyAccessUntil: "",
              creatorGalleryAccessUntil: "",
              darkFantasyUnlimitedUntil: "",
              darkFantasyGalleryAccess: ""
            } },
            { session }
          );
        });
      } finally {
        await session.endSession();
      }
      return { status: 200, body: { deleted: true, accessRevoked: true } };
    } catch {
      return { status: 503, body: { error: "Dark Fantasy preferences could not be deleted" } };
    }
  }

  async getDarkFantasyProfile(uid) {
    const status = await this.getDarkFantasyStatus(uid);
    if (status.status !== 200) return status;
    if (!status.body.ageEligible) return { status: 403, body: { error: "Dark Fantasy is available only to eligible adults" } };
    if (!status.body.hasAccess) return { status: 402, body: { error: "A valid Dark Fantasy add-on is required" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const profile = await db.collection("darkfantasyprofiles").findOne({ uid }, { projection: { _id: 0, uid: 0, consentAt: 0, createdAt: 0 } });
      return { status: 200, body: profile || { consent: false, interests: [], boundaries: [], visibility: "private" } };
    } catch {
      return { status: 503, body: { error: "Dark Fantasy profile unavailable" } };
    }
  }

  async discoverDarkFantasy(uid) {
    const status = await this.getDarkFantasyStatus(uid);
    if (status.status !== 200) return status;
    if (!status.body.ageEligible) return { status: 403, body: { error: "Dark Fantasy is available only to eligible adults" } };
    if (!status.body.hasAccess) return { status: 402, body: { error: "A valid Dark Fantasy add-on is required" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const [me, myProfile, profiles] = await Promise.all([
        db.collection("users").findOne({ uid }, { projection: { blocked: 1, accountStatus: 1 } }),
        db.collection("darkfantasyprofiles").findOne({ uid, consent: true }),
        db.collection("darkfantasyprofiles").find({ uid: { $ne: uid }, consent: true, visibility: "discoverable" }).limit(100).toArray()
      ]);
      if (!myProfile || myProfile.visibility !== "discoverable") return { status: 200, body: [] };
      const blocked = new Set(Array.isArray(me?.blocked) ? me.blocked.map(String) : []);
      const candidateUids = profiles.map(p => p.uid).filter(candidateUid => !blocked.has(candidateUid));
      if (!candidateUids.length) return { status: 200, body: [] };
      const users = await db.collection("users").find({
        uid: { $in: candidateUids },
        accountStatus: { $nin: ["temporarily_suspended", "permanently_banned", "deletion_pending", "deleted"] },
        darkFantasyAccessUntil: { $gt: new Date() }
      }).limit(100).toArray();
      const results = [];
      for (const candidate of users) {
        const candidateProfile = profiles.find(p => p.uid === candidate.uid);
        if (!candidateProfile || (Array.isArray(candidate.blocked) && candidate.blocked.map(String).includes(uid))) continue;
        const birthday = candidate.birthday ? new Date(candidate.birthday) : null;
        if (!birthday || Number.isNaN(birthday.getTime())) continue;
        const now = new Date();
        let age = now.getFullYear() - birthday.getFullYear();
        if (now.getMonth() < birthday.getMonth() || (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
        if (age < 18) continue;
        const sharedInterestCount = myProfile.interests.filter(x => candidateProfile.interests.includes(x)).length;
        if (!sharedInterestCount) continue;
        const safe = sanitizePublicProfile(candidate);
        results.push({ ...safe, sharedInterestCount });
      }
      return { status: 200, body: results };
    } catch {
      return { status: 503, body: { error: "Dark Fantasy discovery unavailable" } };
    }
  }

  getSecretCommunityCatalog() {
    return [
      { slug: "gay-men", title: "Secret Gay Men", description: "A private space for gay men to connect and share experiences." },
      { slug: "lesbian-women", title: "Secret Lesbian Women", description: "A private space for lesbian women, friendship and dating connections." },
      { slug: "bisexual", title: "Secret Bi & Bi-curious", description: "For bisexual and bi-curious adults to explore identity and connect without judgement." },
      { slug: "lgbtq-plus", title: "Secret LGBTQ+ Community", description: "A welcoming social space for LGBTQ+ adults." },
      { slug: "trans-nonbinary", title: "Secret Trans & Non-binary", description: "Peer connection for transgender and non-binary adults." },
      { slug: "swingers-swap", title: "Secret Swingers & Swap", description: "For consenting adults interested in ethical swinging and partner-swapping." },
      { slug: "open-relationships", title: "Secret Open Relationships", description: "Discuss consensual non-monogamy, communication and boundaries." },
      { slug: "polyamory", title: "Secret Polyamory & Throuples", description: "Connect around polyamory, triads and consensual relationship structures." },
      { slug: "couples", title: "Secret Couples Connection", description: "A private space for couples seeking shared social connections." },
      { slug: "kink-consent", title: "Secret Kink & Boundaries", description: "Discuss kink-related interests, safety, negotiation and consent." },
      { slug: "friends-social", title: "Secret Friends & Social", description: "Meet people for friendship, community events and supportive conversations." },
      { slug: "regional", title: "Secret Local Groups", description: "Find local interest groups where location-based discovery is available." }
    ];
  }

  getSecretCommunityRules() {
    return [
      "Respect privacy. Never share identifying details or another member content outside the community without permission.",
      "Consent is mandatory. No harassment, coercion, unwanted sexual content, or repeated unwanted contact.",
      "Do not out, threaten, stalk, dox, or discriminate against members.",
      "Only eligible adults may participate. Never post illegal content or content involving minors.",
      "Report harmful content and respect moderator decisions. Repeated violations may result in removal or suspension."
    ];
  }

  async secretCommunityAction(uid, action, input = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const status = await this.getDarkFantasyStatus(uid);
      if (status.status !== 200) return status;
      if (!status.body.ageEligible || !status.body.accountEligible) return { status: 403, body: { error: "Eligible adult accounts only" } };
      if (!status.body.hasAccess && !["list", "detail"].includes(action)) return { status: 402, body: { error: "An active Dark Fantasy add-on is required" } };
      const db = this.getDatabase(await this.getClient());
      const catalog = this.getSecretCommunityCatalog();
      if (action === "list") {
        const memberships = await db.collection("secretcommunitymemberships").find({ uid }).toArray();
        return { status: 200, body: catalog.map(c => ({ ...c, membershipStatus: memberships.find(m => m.communitySlug === c.slug)?.status || "none", rules: this.getSecretCommunityRules() })) };
      }
      const slug = input.slug;
      const community = catalog.find(c => c.slug === slug);
      if (!community) return { status: 404, body: { error: "Community not found" } };
      const membership = await db.collection("secretcommunitymemberships").findOne({ communitySlug: slug, uid });
      const user = await db.collection("users").findOne({ uid }, { projection: { accountStatus: 1, suspendedUntil: 1 } });
      if (isAccountRestricted(user)) return { status: 403, body: { error: "This account is restricted" } };
      if (action === "detail") {
        const memberCount = await db.collection("secretcommunitymemberships").countDocuments({ communitySlug: slug, status: "active" });
        const postCount = await db.collection("secretcommunityposts").countDocuments({ communitySlug: slug, status: "published" });
        return { status: 200, body: { ...community, memberCount, postCount, membershipStatus: membership?.status || "none", hasAccess: status.body.hasAccess, canModerate: input.claimsRole === "superadmin" || ["owner", "moderator"].includes(membership?.role), rules: this.getSecretCommunityRules() } };
      }
      if (action === "join") {
        if (membership?.status === "active") return { status: 200, body: { status: "active", message: "You are already a member." } };
        if (membership?.status === "requested") return { status: 200, body: { status: "requested", message: "Your membership request is awaiting review." } };
        const now = new Date();
        await db.collection("secretcommunitymemberships").updateOne({ communitySlug: slug, uid }, { $set: { communitySlug: slug, uid, status: "requested", role: "member", requestedAt: now, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
        return { status: 201, body: { status: "requested", message: "Your membership request has been submitted for review." } };
      }
      if (action === "requests") {
        if (input.claimsRole !== "superadmin" && !["owner", "moderator"].includes(membership?.role)) return { status: 403, body: { error: "Only community moderators can view membership requests" } };
        const requests = await db.collection("secretcommunitymemberships").find({ communitySlug: slug, status: "requested" }, { projection: { _id: 0, uid: 1, requestedAt: 1 } }).sort({ requestedAt: 1 }).limit(100).toArray();
        return { status: 200, body: requests.map(item => ({ uid: item.uid, requestedAt: item.requestedAt })) };
      }
      if (action === "decision") {
        if (input.claimsRole !== "superadmin" && !["owner", "moderator"].includes(membership?.role)) return { status: 403, body: { error: "Only community moderators can review membership requests" } };
        if (!["approve", "reject"].includes(input.input?.decision) || typeof input.targetUid !== "string" || input.targetUid.length > 128) return { status: 400, body: { error: "Invalid membership decision" } };
        const result = await db.collection("secretcommunitymemberships").updateOne({ communitySlug: slug, uid: input.targetUid, status: "requested" }, { $set: { status: input.input.decision === "approve" ? "active" : "rejected", reviewedAt: new Date(), reviewedBy: uid } });
        return result.matchedCount ? { status: 200, body: { status: input.input.decision === "approve" ? "active" : "rejected" } } : { status: 404, body: { error: "Membership request not found" } };
      }
      if (["posts", "create-post", "comment", "reaction"].includes(action) && membership?.status !== "active") return { status: 403, body: { error: "Active community membership is required" } };
      const posts = db.collection("secretcommunityposts");
      if (action === "posts") {
        const items = await posts.find({ communitySlug: slug, status: "published" }).sort({ createdAt: -1 }).limit(50).toArray();
        return { status: 200, body: items.map(p => ({ id: String(p._id), text: p.text, author: "Member", createdAt: p.createdAt, comments: (p.comments || []).map(c => ({ id: c.id, text: c.text, author: "Member", createdAt: c.createdAt })), reactions: (p.reactions || []).map(r => ({ type: r.type })) })) };
      }
      if (action === "create-post") {
        const text = typeof input.input?.text === "string" ? input.input.text.trim() : "";
        if (!text || text.length > 3000) return { status: 400, body: { error: "Post text must be between 1 and 3000 characters" } };
        const now = new Date();
        const result = await posts.insertOne({ communitySlug: slug, authorUid: uid, text, status: "published", comments: [], reactions: [], createdAt: now, updatedAt: now });
        return { status: 201, body: { id: String(result.insertedId), text, author: "Member", createdAt: now, comments: [], reactions: [] } };
      }
      if (!["comment", "reaction"].includes(action) || typeof input.postId !== "string" || !/^[a-fA-F0-9]{24}$/.test(input.postId)) return { status: 400, body: { error: "Invalid post or action" } };
      const { ObjectId } = await import("mongodb");
      const post = await posts.findOne({ _id: new ObjectId(input.postId), communitySlug: slug, status: "published" });
      if (!post) return { status: 404, body: { error: "Post not found" } };
      if (action === "comment") {
        const text = typeof input.input?.text === "string" ? input.input.text.trim() : "";
        if (!text || text.length > 1000) return { status: 400, body: { error: "Comment text must be between 1 and 1000 characters" } };
        const comment = { id: crypto.randomUUID(), uid, text, createdAt: new Date() };
        await posts.updateOne({ _id: post._id }, { $push: { comments: comment }, $set: { updatedAt: new Date() } });
        return { status: 201, body: { id: comment.id, text, author: "Member", createdAt: comment.createdAt } };
      }
      const reaction = input.input?.reaction;
      if (!["like", "heart", "support"].includes(reaction)) return { status: 400, body: { error: "Unsupported reaction" } };
      const current = post.reactions || [];
      const next = current.some(r => r.uid === uid && r.type === reaction) ? current.filter(r => r.uid !== uid) : [...current.filter(r => r.uid !== uid), { uid, type: reaction }];
      await posts.updateOne({ _id: post._id }, { $set: { reactions: next, updatedAt: new Date() } });
      return { status: 200, body: { reactions: next.map(r => ({ type: r.type })) } };
    } catch (error) {
      console.error("Secret community operation failed", { action, name: error?.name || "Error" });
      return { status: 503, body: { error: "Community service unavailable" } };
    }
  }
  async createPendingPurchase(uid, itemId) {
    const prices = { "super-like-5": 500, "undo-swipes-5": 500, "profile-boost-1": 100, "dark-fantasy-monthly": 1200, "dark-fantasy-creator-monthly": 800, "dark-fantasy-unlimited-pass": 3500 };
    const names = { "super-like-5": "5 Super Likes", "undo-swipes-5": "5 Undo Swipes", "profile-boost-1": "1 Profile Boost", "dark-fantasy-monthly": "Dark Fantasy Add-on (30 days)", "dark-fantasy-creator-monthly": "Dark Fantasy Creator Gallery (30 days)", "dark-fantasy-unlimited-pass": "Dark Fantasy Unlimited Pass (30 days)" };
    const galleryMatch = typeof itemId === "string" ? itemId.match(/^dark-fantasy-gallery:([A-Za-z0-9_-]{1,128})$/) : null;
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid purchase request." } };
    }
    // Gallery checkout stays disabled until private media delivery is implemented
    // and verified by the CDN proxy. Never charge for gallery access that cannot
    // yet be securely delivered.
    if (galleryMatch || ["dark-fantasy-creator-monthly", "dark-fantasy-unlimited-pass"].includes(itemId)) {
      return { status: 503, body: { error: "Private gallery purchases are temporarily unavailable." } };
    }
    if (!Object.hasOwn(prices, itemId)) {
      return { status: 400, body: { error: "Invalid item ID." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found" } };
      if (["dark-fantasy-creator-monthly", "dark-fantasy-unlimited-pass", "dark-fantasy-monthly"].includes(itemId)) {
        const status = await this.getDarkFantasyStatus(uid);
        if (status.status !== 200) return status;
        if (!status.body.ageEligible || !status.body.accountEligible) return { status: 403, body: { error: "An eligible adult account is required." } };
      }
      const now = new Date();
      const purchase = {
        userId: user._id,
        itemId,
        itemName: names[itemId],
        itemPrice: String(prices[itemId]),
        status: "pending",
        createdAt: now,
        updatedAt: now
      };
      const inserted = await db.collection("purchases").insertOne(purchase);
      return {
        status: 201,
        body: {
          orderId: String(inserted.insertedId),
          price: prices[itemId],
          itemName: names[itemId],
          user: {
            name: typeof user.name === "string" ? user.name : "User",
            email: typeof user.email === "string" ? user.email : "",
            contactNumber: user.mobileNumber || user.phoneNumber || "0711234567"
          }
        }
      };
    } catch {
      return { status: 503, body: { error: "Purchase service unavailable" } };
    }
  }

  async createPendingVideoRoomTicket(uid, roomId) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        typeof roomId !== "string" || !roomId || roomId.length > 64) {
      return { status: 400, body: { error: "Invalid video room ticket request." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const room = await db.collection("videoRooms").findOne({ roomId, status: "active" });
      if (room?.expiresAt && new Date(room.expiresAt) <= new Date()) {
        await db.collection("videoRooms").updateOne({ roomId, status: "active" }, { $set: { status: "ended", endedAt: new Date(), updatedAt: new Date() } });
        return { status: 404, body: { error: "This live show has expired." } };
      }
      if (!room || room.mode !== "broadcast" || room.visibility !== "listed" ||
          !Number.isInteger(room.ticketPriceLkr) || room.ticketPriceLkr < 1) {
        return { status: 404, body: { error: "This room is not offering paid tickets." } };
      }
      if (room.mediaStatus !== "ready") {
        return { status: 409, body: { error: "Ticket sales are disabled until live video is connected and the room is ready." } };
      }
      if (room.hostUid === uid) return { status: 400, body: { error: "You cannot purchase your own room ticket." } };
      const user = await db.collection("users").findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found." } };
      const existing = await db.collection("videoRoomTickets").findOne({ roomId, viewerUid: uid, status: "paid" });
      if (existing) return { status: 409, body: { error: "You already have access to this live show." } };
      const purchases = db.collection("purchases");
      const pending = await purchases.findOne({ videoRoomId: roomId, viewerUid: uid, status: "pending" });
      const now = new Date();
      if (pending) {
        const pendingSince = pending.updatedAt || pending.createdAt;
        const pendingAge = pendingSince ? now.getTime() - new Date(pendingSince).getTime() : 0;
        // Recover abandoned checkout attempts after 15 minutes. Records without a
        // timestamp are kept pending for backward compatibility rather than guessed stale.
        if (Number.isFinite(pendingAge) && pendingAge >= 15 * 60 * 1000) {
          await purchases.updateOne({ _id: pending._id, status: "pending" }, { $set: { status: "expired", updatedAt: now, expirationReason: "checkout_timeout" } });
        } else {
          return { status: 409, body: { error: "A checkout for this live show is already pending. Complete it before starting another." } };
        }
      }
      const itemId = "video-room-ticket:" + roomId;
      const purchase = {
        userId: user._id, viewerUid: uid, itemId, itemName: "Live show ticket: " + String(room.title || "Video Room").slice(0, 80),
        itemPrice: String(room.ticketPriceLkr), videoRoomId: roomId, creatorUid: room.hostUid,
        creatorSharePercent: 70, status: "pending", createdAt: now, updatedAt: now,
        checkoutExpiresAt: new Date(now.getTime() + 15 * 60 * 1000)
      };
      const inserted = await db.collection("purchases").insertOne(purchase);
      return { status: 201, body: {
        orderId: String(inserted.insertedId), price: room.ticketPriceLkr, itemName: purchase.itemName,
        user: { name: typeof user.name === "string" ? user.name : "User", email: typeof user.email === "string" ? user.email : "",
          contactNumber: user.mobileNumber || user.phoneNumber || "0711234567" }
      } };
    } catch (error) {
      console.error("Video room ticket checkout creation failed", { message: String(error?.message || "unknown").slice(0, 160) });
      return { status: 503, body: { error: "Video room ticket checkout unavailable." } };
    }
  }

  async createPendingSubscription(uid, plan) {
    const prices = { weekly: 800, monthly: 3000, yearly: 10000 };
    if (typeof uid !== "string" || !uid || uid.length > 128 || !Object.hasOwn(prices, plan)) {
      return { status: 400, body: { error: "Invalid subscription plan." } };
    }
    let reservationId = null;
    let reservationUserId = null;
    try {
      const db = this.getDatabase(await this.getClient());
      // Atlas still has legacy unique indexes for both Stripe and PayHere
      // subscription IDs. WebXPay uses unique internal markers until settlement.
      const users = db.collection("users");
      const user = await users.findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const subscriptions = db.collection("subscriptions");
      const now = new Date();
      const pendingCutoff = new Date(now.getTime() - 30 * 60 * 1000);
      // Expire abandoned checkouts before checking for another pending order.
      // This prevents multiple live checkout sessions from being paid for the
      // same account and creating overlapping subscription records.
      await subscriptions.updateMany(
        { userId: user._id, status: "pending", createdAt: { $lt: pendingCutoff } },
        { $set: { status: "cancelled", cancellationReason: "payment_timeout", updatedAt: now } }
      );
      const active = await subscriptions.findOne({
        userId: user._id,
        status: "active",
        endDate: { $gt: now }
      }, { projection: { _id: 1 } });
      if (active) return { status: 409, body: { error: "You already have an active subscription." } };
      const pending = await subscriptions.findOne({
        userId: user._id,
        status: "pending",
        createdAt: { $gte: pendingCutoff }
      }, { projection: { _id: 1 } });
      if (pending) return { status: 409, body: { error: "A subscription checkout is already pending. Complete it before starting another." } };
      // A read-then-insert check is not sufficient under concurrent requests.
      // Claim a short-lived per-user reservation with one conditional MongoDB
      // write so only one checkout can pass this point.
      reservationId = crypto.randomUUID();
      reservationUserId = user._id;
      const reservationExpiry = new Date(now.getTime() + 30 * 60 * 1000);
      const reservation = await users.updateOne(
        {
          _id: user._id,
          $or: [
            { pendingSubscriptionCheckout: { $exists: false } },
            { pendingSubscriptionCheckout: null },
            { "pendingSubscriptionCheckout.expiresAt": { $lte: now } }
          ]
        },
        { $set: { pendingSubscriptionCheckout: { reservationId, expiresAt: reservationExpiry } } }
      );
      if (!reservation.matchedCount) {
        reservationId = null;
        reservationUserId = null;
        return { status: 409, body: { error: "A subscription checkout is already pending. Complete it before starting another." } };
      }
      const subscription = {
        userId: user._id,
        plan,
        amount: prices[plan],
        currency: "LKR",
        status: "pending",
        checkoutReservationId: reservationId,
        // WebXPay does not issue Stripe or PayHere subscription IDs. Unique
        // internal markers prevent legacy unique indexes from colliding on null.
        stripeSubscriptionId: "webxpay-pending-" + crypto.randomUUID(),
        payhereSubscriptionId: "webxpay-pending-" + crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      };
      const inserted = await subscriptions.insertOne(subscription);
      return {
        status: 201,
        body: {
          orderId: String(inserted.insertedId),
          price: prices[plan],
          plan,
          user: {
            name: typeof user.name === "string" ? user.name : "User",
            email: typeof user.email === "string" ? user.email : "",
            contactNumber: user.mobileNumber || user.phoneNumber || "0711234567"
          }
        }
      };
    } catch (error) {
      if (reservationId && reservationUserId) {
        try {
          const db = this.getDatabase(await this.getClient());
          await db.collection("users").updateOne(
            { _id: reservationUserId, "pendingSubscriptionCheckout.reservationId": reservationId },
            { $unset: { pendingSubscriptionCheckout: "" } }
          );
        } catch (releaseError) {
          console.error("Subscription checkout reservation release failed", {
            message: String(releaseError?.message || "unknown").slice(0, 160)
          });
        }
      }
      console.error("MongoDB subscription creation failed", {
        phase: "create-pending-subscription",
        name: error && typeof error.name === "string" ? error.name : "Error",
        code: error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : undefined,
        codeName: error && typeof error.codeName === "string" ? error.codeName : undefined,
        message: error && typeof error.message === "string" ? error.message.slice(0, 240) : undefined
      });
      return { status: 503, body: { error: "Subscription service unavailable" } };
    }
  }

  async abandonPendingSubscription(uid, orderId) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        typeof orderId !== "string" || !/^[a-fA-F0-9]{24}$/.test(orderId)) {
      return { status: 400, body: { error: "Invalid checkout request." } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const subscriptions = db.collection("subscriptions");
      const user = await users.findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { error: "User not found." } };
      const subscription = await subscriptions.findOne({ _id: new ObjectId(orderId), userId: user._id });
      if (!subscription) return { status: 404, body: { error: "Checkout not found." } };
      if (subscription.status === "cancelled") {
        if (subscription.checkoutReservationId) {
          await users.updateOne(
            { _id: user._id, "pendingSubscriptionCheckout.reservationId": subscription.checkoutReservationId },
            { $unset: { pendingSubscriptionCheckout: "" } }
          );
        }
        return { status: 200, body: { success: true, status: "cancelled" } };
      }
      if (subscription.status !== "pending") {
        return { status: 409, body: { error: "This payment can no longer be cancelled. Check its payment status before retrying.", status: subscription.status } };
      }
      const now = new Date();
      const cancelled = await subscriptions.updateOne(
        { _id: subscription._id, userId: user._id, status: "pending" },
        { $set: { status: "cancelled", cancellationReason: "checkout_start_failed", updatedAt: now } }
      );
      if (!cancelled.modifiedCount) {
        const latest = await subscriptions.findOne({ _id: subscription._id }, { projection: { status: 1 } });
        return { status: 409, body: { error: "Payment status changed. Check the transaction before retrying.", status: latest?.status || "unknown" } };
      }
      if (subscription.checkoutReservationId) {
        await users.updateOne(
          { _id: user._id, "pendingSubscriptionCheckout.reservationId": subscription.checkoutReservationId },
          { $unset: { pendingSubscriptionCheckout: "" } }
        );
      }
      return { status: 200, body: { success: true, status: "cancelled" } };
    } catch (error) {
      console.error("Pending subscription checkout cancellation failed", {
        message: String(error?.message || "unknown").slice(0, 160)
      });
      return { status: 503, body: { error: "Could not safely release this checkout. Please check payment status." } };
    }
  }

  async settleWebXPay(orderId, statusCode, reference = "", gatewayMetadata = {}) {
    if (typeof orderId !== "string" || !/^[a-fA-F0-9]{24}$/.test(orderId) ||
        !["0", "00", "15"].includes(String(statusCode)) ||
        (!normalizeWebXPayReference(reference)) ||
        (gatewayMetadata.transactionDate && (typeof gatewayMetadata.transactionDate !== "string" || !isValidWebXPayTransactionDate(gatewayMetadata.transactionDate))) ||
        (gatewayMetadata.gatewayId && (typeof gatewayMetadata.gatewayId !== "string" || gatewayMetadata.gatewayId.length > 32)) ||
        (gatewayMetadata.gatewayComment && (typeof gatewayMetadata.gatewayComment !== "string" || gatewayMetadata.gatewayComment.length > 256))) {
      return { status: 400, body: { error: "Invalid payment response" } };
    }
    const normalizedReference = normalizeWebXPayReference(reference);
    let outcome = { status: 503, body: { error: "Payment settlement unavailable" } };
    let session;
    try {
      const client = await this.getClient();
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(client);
      session = client.startSession();
      await session.withTransaction(async () => {
        const purchases = db.collection("purchases");
        const subscriptions = db.collection("subscriptions");
        const purchase = await purchases.findOne({ _id: new ObjectId(orderId) }, { session });
        const subscription = purchase ? null : await subscriptions.findOne({ _id: new ObjectId(orderId) }, { session });
        const record = purchase || subscription;
        if (!record) {
          outcome = { status: 404, body: { error: "Transaction not found." } };
          return;
        }
        const success = statusCode === "0" || statusCode === "00";
        const now = new Date();
        // A delayed success callback can arrive after a checkout was cancelled
        // locally or after the gateway previously reported a decline. Never grant
        // access in that case, but do flag the captured payment for refund review.
        const lateSuccessAfterCancellation = success &&
          ((purchase && record.status === "rejected") || (subscription && record.status === "cancelled"));
        if (lateSuccessAfterCancellation) {
          const collection = purchase ? purchases : subscriptions;
          const changed = await collection.updateOne(
            { _id: record._id, status: record.status },
            { $set: {
              status: "refund_required",
              refundReviewRequired: true,
              refundReason: "late_success_after_cancelled_checkout",
              paymentReference: normalizedReference,
              ...(gatewayMetadata.transactionDate ? { gatewayTransactionDate: gatewayMetadata.transactionDate } : {}),
              ...(gatewayMetadata.gatewayId ? { paymentGatewayId: gatewayMetadata.gatewayId } : {}),
              ...(gatewayMetadata.gatewayComment ? { paymentGatewayComment: gatewayMetadata.gatewayComment } : {}),
              paidLateAt: now,
              updatedAt: now
            } },
            { session }
          );
          if (!changed.modifiedCount) {
            outcome = { status: 409, body: { error: "Transaction was already processed." } };
            throw new Error("PAYMENT_STATE_CHANGED");
          }
          outcome = {
            status: 200,
            body: {
              success: true,
              processed: false,
              refundReviewRequired: true,
              message: "Payment was received after checkout cancellation and has been flagged for refund review."
            }
          };
          return;
        }
        const isVideoTicketPurchase = Boolean(purchase && typeof purchase.itemId === "string" &&
          purchase.itemId.startsWith("video-room-ticket:"));
        const lateExpiredTicket = Boolean(isVideoTicketPurchase && record.status === "expired");
        const terminalStates = purchase ? ["completed", "rejected", "refund_required"] : ["active", "cancelled", "inactive", "refund_required"];
        if (terminalStates.includes(record.status)) {
          outcome = { status: 200, body: { success: true, message: "Payment already processed." } };
          return;
        }
        if (record.status !== "pending" && !lateExpiredTicket) {
          outcome = { status: 409, body: { error: "Transaction is no longer pending." } };
          return;
        }
        // The WebXPay order reference is the unique provider transaction
        // reference. Its gateway_id field identifies the payment method and is
        // intentionally not used as a uniqueness key.
        if (normalizedReference) {
          const duplicateQuery = { _id: { $ne: record._id }, paymentReference: normalizedReference };
          const [duplicatePurchase, duplicateSubscription] = await Promise.all([
            purchases.findOne(duplicateQuery, { session }),
            subscriptions.findOne(duplicateQuery, { session })
          ]);
          if (duplicatePurchase || duplicateSubscription) {
            outcome = {
              status: 409,
              body: { error: "This provider transaction reference is already linked to another order." }
            };
            return;
          }
        }
        if (isVideoTicketPurchase && success) {
          const roomId = String(purchase.videoRoomId || purchase.itemId.slice("video-room-ticket:".length));
          const room = await db.collection("videoRooms").findOne({ roomId, status: "active" }, { session });
          if (!room || room.mediaStatus !== "ready" || (room.expiresAt && new Date(room.expiresAt) <= now)) {
            await purchases.updateOne(
              { _id: record._id, status: record.status },
              { $set: {
                status: "refund_required", paymentReference: String(reference).slice(0, 128),
                refundReviewRequired: true, refundReason: "room_unavailable_at_settlement",
                paidLateAt: now, updatedAt: now
              } },
              { session }
            );
            outcome = { status: 409, body: { error: "Payment was received but the live room is no longer available. The transaction has been flagged for refund review.", refundReviewRequired: true } };
            return;
          }
        }
        const collection = purchase ? purchases : subscriptions;
        const nextStatus = success ? (purchase ? "completed" : "active") : (purchase ? "rejected" : "cancelled");
        const changed = await collection.updateOne(
          { _id: record._id, status: record.status },
          { $set: {
            status: nextStatus,
            paymentReference: String(reference).slice(0, 128),
            ...(gatewayMetadata.transactionDate ? { gatewayTransactionDate: gatewayMetadata.transactionDate } : {}),
            ...(gatewayMetadata.gatewayId ? { paymentGatewayId: gatewayMetadata.gatewayId } : {}),
            ...(gatewayMetadata.gatewayComment ? { paymentGatewayComment: gatewayMetadata.gatewayComment } : {}),
            updatedAt: now
          } },
          { session }
        );
        if (!changed.modifiedCount) {
          outcome = { status: 409, body: { error: "Transaction was already processed." } };
          throw new Error("PAYMENT_STATE_CHANGED");
        }
        if (!success) {
          if (subscription?.checkoutReservationId) {
            await db.collection("users").updateOne(
              { _id: subscription.userId, "pendingSubscriptionCheckout.reservationId": subscription.checkoutReservationId },
              { $unset: { pendingSubscriptionCheckout: "" } },
              { session }
            );
          }
          outcome = { status: 200, body: { success: true, processed: false, status: "declined" } };
          return;
        }
        if (purchase) {
          const userUpdate = {};
          if (purchase.itemId === "super-like-5") userUpdate.$inc = { purchasedSuperLikes: 5 };
          else if (purchase.itemId === "undo-swipes-5") userUpdate.$inc = { purchasedUndoSwipes: 5 };
          else if (purchase.itemId === "profile-boost-1") userUpdate.$set = { boostExpiresAt: new Date(now.getTime() + 30 * 60 * 1000) };
          else if (["dark-fantasy-monthly", "dark-fantasy-creator-monthly", "dark-fantasy-unlimited-pass"].includes(purchase.itemId)) {
            const entitlementField = purchase.itemId === "dark-fantasy-monthly" ? "darkFantasyAccessUntil" : purchase.itemId === "dark-fantasy-creator-monthly" ? "creatorGalleryAccessUntil" : "darkFantasyUnlimitedUntil";
            const existingUser = await db.collection("users").findOne({ _id: purchase.userId }, { projection: { [entitlementField]: 1 }, session });
            const currentExpiry = existingUser?.[entitlementField] ? new Date(existingUser[entitlementField]).getTime() : 0;
            userUpdate.$set = { [entitlementField]: new Date(Math.max(now.getTime(), Number.isFinite(currentExpiry) ? currentExpiry : 0) + 30 * 86400000) };
          } else if (typeof purchase.itemId === "string" && purchase.itemId.startsWith("dark-fantasy-gallery:")) {
            const creatorUid = purchase.itemId.slice("dark-fantasy-gallery:".length);
            const existing = await db.collection("users").findOne({ _id: purchase.userId }, { projection: { darkFantasyGalleryAccess: 1 }, session });
            const access = Array.isArray(existing?.darkFantasyGalleryAccess) ? existing.darkFantasyGalleryAccess.filter(x => x && x.creatorUid !== creatorUid) : [];
            access.push({ creatorUid, accessUntil: new Date(now.getTime() + 30 * 86400000) });
            userUpdate.$set = { darkFantasyGalleryAccess: access };
          } else if (typeof purchase.itemId === "string" && purchase.itemId.startsWith("video-room-ticket:")) {
            const roomId = String(purchase.videoRoomId || purchase.itemId.slice("video-room-ticket:".length));
            const viewerUid = String(purchase.viewerUid || "");
            const creatorUid = String(purchase.creatorUid || "");
            const grossLkr = Math.max(0, Math.floor(Number(purchase.itemPrice) || 0));
            if (!viewerUid || !creatorUid || !roomId || grossLkr < 1) throw new Error("INVALID_VIDEO_ROOM_TICKET_PURCHASE");
            const existingTicket = await db.collection("videoRoomTickets").findOne({ roomId, viewerUid, status: "paid" }, { session });
            if (!existingTicket) {
              await db.collection("videoRoomTickets").insertOne({
                roomId, viewerUid, creatorUid, purchaseId: String(purchase._id), status: "paid",
                paidAt: now, createdAt: now, updatedAt: now
              }, { session });
              const creatorSharePercent = Math.min(90, Math.max(40, Number(purchase.creatorSharePercent) || 70));
              const creatorAmountLkr = Math.floor(grossLkr * creatorSharePercent / 100);
              await db.collection("creatorEarnings").insertOne({
                purchaseId: String(purchase._id), roomId, creatorUid, viewerUid, currency: "LKR",
                grossAmount: grossLkr, creatorAmount: creatorAmountLkr, platformAmount: grossLkr - creatorAmountLkr,
                status: "pending_review", payoutStatus: "not_requested",
                createdAt: now, updatedAt: now
              }, { session });
            }
          }
          if (Object.keys(userUpdate).length) {
            userUpdate.$set = { ...(userUpdate.$set || {}), updatedAt: now };
            const changedUser = await db.collection("users").updateOne({ _id: purchase.userId }, userUpdate, { session });
            if (!changedUser.matchedCount) throw new Error("PAYMENT_USER_MISSING");
          }
        } else {
          const durations = { weekly: 7, monthly: 30, yearly: 365 };
          const days = durations[subscription.plan];
          if (!days) throw new Error("UNSUPPORTED_SUBSCRIPTION_PLAN");
          await subscriptions.updateOne(
            { _id: subscription._id, status: "active" },
            { $set: { startDate: now, endDate: new Date(now.getTime() + days * 86400000), updatedAt: now } },
            { session }
          );
          const changedUser = await db.collection("users").updateOne(
            { _id: subscription.userId },
            { $set: { plan: "premium", trialExpires: null, updatedAt: now } },
            { session }
          );
          if (!changedUser.matchedCount) throw new Error("PAYMENT_USER_MISSING");
          // Clear only the reservation created for this order. A delayed callback
          // must never remove a newer checkout's reservation after stale-lock recovery.
          if (subscription.checkoutReservationId) {
            await db.collection("users").updateOne(
              { _id: subscription.userId, "pendingSubscriptionCheckout.reservationId": subscription.checkoutReservationId },
              { $unset: { pendingSubscriptionCheckout: "" } },
              { session }
            );
          }
        }
        outcome = { status: 200, body: { success: true, message: "Payment verified and processed successfully." } };
      });
      return outcome;
    } catch (error) {
      if (outcome.status === 404 || outcome.status === 409) return outcome;
      return { status: 503, body: { error: "Payment settlement unavailable" } };
    } finally {
      if (session) await session.endSession().catch(() => {});
    }
  }

  async getSubscriptionHistory(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const subscriptionCollection = db.collection("subscriptions");
      // WebXPay checkout can be abandoned before the gateway sends a verified
      // callback. Expire those attempts so they do not remain "pending" forever.
      // Keep the records in history as cancelled rather than deleting audit data.
      const now = new Date();
      const pendingCutoff = new Date(now.getTime() - 30 * 60 * 1000);
      await subscriptionCollection.updateMany(
        { userId: user._id, status: "pending", createdAt: { $lt: pendingCutoff } },
        { $set: { status: "cancelled", cancellationReason: "payment_timeout", updatedAt: now } }
      );
      const subscriptions = await subscriptionCollection
        .find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
      return { status: 200, body: subscriptions };
    } catch {
      return { status: 503, body: { error: "Subscription history unavailable" } };
    }
  }

  async getLikes(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const currentUser = await db.collection("users").findOne(
        { uid }, { projection: { _id: 1, plan: 1, role: 1, blocked: 1 } }
      );
      if (!currentUser) return { status: 404, body: { error: "User not found" } };
      // Match documents are normally directional (user1 = liker, user2 = target),
      // but legacy /matches/like writes canonical UID ordering. Query both sides
      // and derive the incoming liker from likedBy so either representation works.
      const matches = await db.collection("matches").find({
        $or: [{ user1Uid: uid }, { user2Uid: uid }],
        status: "pending"
      }).toArray();
      const incomingMatches = matches.flatMap(match => {
        const likedBy = Array.isArray(match.likedBy) ? match.likedBy : null;
        let likedUid = null;
        if (likedBy) {
          if (!likedBy.includes(uid)) {
            likedUid = likedBy.find(value => typeof value === "string" && value !== uid) || null;
          }
        } else if (match.user2Uid === uid && typeof match.user1Uid === "string") {
          // Backward compatibility for historical directional records without likedBy.
          likedUid = match.user1Uid;
        }
        return likedUid ? [{ likedUid, match }] : [];
      });
      if (incomingMatches.length === 0) return { status: 200, body: [] };
      const likedUids = [...new Set(incomingMatches.map(item => item.likedUid))];
      const users = await db.collection("users").find({ uid: { $in: likedUids } }).toArray();
      const usersByUid = new Map(users.map(user => [user.uid, user]));
      const matchByUid = new Map(incomingMatches.map(item => [item.likedUid, item.match]));
      const isBlurred = currentUser.role !== "superadmin" && currentUser.plan !== "premium";
      const result = [];
      for (const likedUid of likedUids) {
        const user = usersByUid.get(likedUid);
        if (!user) continue;
        const viewerBlockedTarget = Array.isArray(currentUser.blocked) && currentUser.blocked.includes(likedUid);
        const targetBlockedViewer = Array.isArray(user.blocked) && user.blocked.includes(uid);
        if (user.isProfileVisible === false || viewerBlockedTarget || targetBlockedViewer) continue;
        const match = matchByUid.get(likedUid);
        // Basic accounts receive an anonymous teaser only. Never send identity,
        // profile text, photos, or CDN object URLs and rely on client-side blur.
        if (isBlurred) {
          result.push({
            likeId: match?._id === undefined ? undefined : String(match._id),
            likeType: match && match.superLike ? "superlike" : "like",
            isBlurred: true
          });
          continue;
        }
        const profile = { ...user };
        delete profile.password;
        delete profile.lastLoginIp;
        if (profile._id !== undefined) profile.id = String(profile._id);
        if (profile.isOnboardingComplete === undefined) profile.isOnboardingComplete = true;
        if (profile.birthday) {
          const birthday = new Date(profile.birthday);
          if (!Number.isNaN(birthday.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - birthday.getFullYear();
            const month = today.getMonth() - birthday.getMonth();
            if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age--;
            profile.age = age;
          }
        }
        if (Array.isArray(profile.photos)) {
          profile.photos = profile.photos.map(photo => {
            if (!photo || typeof photo.url !== "string" || !photo.url) return photo;
            return { ...photo, url: this.getMediaUrl(photo.url) };
          });
        }
        const responseProfile = sanitizePublicProfile(profile);
        // Superadmins may inspect profile contact details, but still receive
        // the same public-field allowlist rather than unrestricted DB records.
        if (currentUser.role === "superadmin") {
          if (typeof profile.email === "string") responseProfile.email = profile.email;
          if (typeof profile.mobileNumber === "string") responseProfile.mobileNumber = profile.mobileNumber;
        }
        result.push({
          ...responseProfile,
          likeType: match && match.superLike ? "superlike" : "like",
          isBlurred
        });
      }
      return { status: 200, body: result };
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async getAdminReports(uid, params = {}) {
    try {
      const db = this.getDatabase(await this.getClient());
      const admin = await db.collection("users").findOne({ uid }, { projection: { _id: 1, role: 1 } });
      if (!admin || !["admin", "superadmin"].includes(admin.role)) {
        return { status: 403, body: { message: "Forbidden: You do not have the required permissions." } };
      }
      const allowedStatuses = ["pending_review", "under_investigation", "resolved_no_action", "resolved_warning_issued_to_reported_user", "resolved_reporter_notified", "resolved_content_removed", "resolved_user_suspended", "resolved_user_banned", "resolved_user_restored"];
      const query = {};
      if (typeof params.status === "string" && params.status) {
        if (!allowedStatuses.includes(params.status)) return { status: 400, body: { message: "Invalid report status." } };
        query.status = params.status;
      }
      const page = Number.isInteger(params.page) && params.page > 0 ? Math.min(params.page, 100000) : 1;
      const limit = Number.isInteger(params.limit) && params.limit > 0 ? Math.min(params.limit, 100) : 10;
      if (typeof params.search === "string" && params.search.trim()) {
        const term = params.search.trim().slice(0, 128);
        const escapedTerm = term.split("").map(character =>
          "\\.^$*+?()[]{}|".includes(character) ? "\\" + character : character
        ).join("");
        const searchQuery = {
          $or: [
            { uid: term },
            { name: { $regex: escapedTerm, $options: "i" } },
            ...(admin.role === "superadmin" ? [{ email: { $regex: escapedTerm, $options: "i" } }] : [])
          ]
        };
        const matchingUsers = await db.collection("users").find(
          searchQuery, { projection: { uid: 1 } }
        ).toArray();
        const matchingUids = matchingUsers.map(user => user.uid).filter(Boolean);
        if (!matchingUids.length) return { status: 200, body: { reports: [], totalPages: 0, currentPage: page } };
        query.reportedUserUid = { $in: matchingUids };
      }
      const reports = await db.collection("reports").find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
      const total = await db.collection("reports").countDocuments(query);
      const uids = [...new Set(reports.flatMap(report => [report.reporterUid, report.reportedUserUid]).filter(Boolean))];
      const userProjection = {
        uid: 1, name: 1, isProfileVisible: 1, role: 1, accountStatus: 1, suspendedUntil: 1,
        ...(admin.role === "superadmin" ? { email: 1, mobileNumber: 1 } : {})
      };
      const users = uids.length ? await db.collection("users").find(
        { uid: { $in: uids } }, { projection: userProjection }
      ).toArray() : [];
      const byUid = new Map(users.map(user => [user.uid, user]));
      return { status: 200, body: { reports: reports.map(report => ({ ...report, reporter: byUid.get(report.reporterUid) || null, reportedUser: byUid.get(report.reportedUserUid) || null })), totalPages: Math.ceil(total / limit), currentPage: page } };
    } catch {
      return { status: 503, body: { message: "Report administration service is temporarily unavailable." } };
    }
  }

  async getAdminReport(uid, reportId) {
    if (typeof reportId !== "string" || !/^[a-fA-F0-9]{24}$/.test(reportId)) return { status: 400, body: { message: "Invalid report ID" } };
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const admin = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
      if (!admin || !["admin", "superadmin"].includes(admin.role)) return { status: 403, body: { message: "Forbidden: You do not have the required permissions." } };
      const report = await db.collection("reports").findOne({ _id: new ObjectId(reportId) });
      if (!report) return { status: 404, body: { message: "Report not found" } };
      const privateContactProjection = admin.role === "superadmin" ? { email: 1, mobileNumber: 1 } : {};
      const [reporter, reportedUser] = await Promise.all([
        db.collection("users").findOne({ uid: report.reporterUid }, { projection: { uid: 1, name: 1, ...privateContactProjection } }),
        db.collection("users").findOne({ uid: report.reportedUserUid }, { projection: {
          uid: 1, name: 1, isProfileVisible: 1, role: 1, suspendedUntil: 1, accountStatus: 1,
          ...privateContactProjection
        } })
      ]);
      return { status: 200, body: { ...report, reporter, reportedUser } };
    } catch {
      return { status: 503, body: { message: "Report administration service is temporarily unavailable." } };
    }
  }

  async moderateReport(uid, reportId, payload = {}) {
    let auditId = null;
    let auditCollection = null;
    if (typeof reportId !== "string" || !/^[a-fA-F0-9]{24}$/.test(reportId)) return { status: 400, body: { message: "Invalid report ID" } };
    const actions = ["dismiss", "suspend_user", "ban_user", "restore_user"];
    if (!payload || !actions.includes(payload.action)) return { status: 400, body: { message: "Invalid action specified." } };
    if (payload.adminNotes !== undefined && (typeof payload.adminNotes !== "string" || payload.adminNotes.length > 4000)) {
      return { status: 400, body: { message: "Admin notes must be text of at most 4000 characters." } };
    }
    let durationDays;
    if (payload.action === "suspend_user") {
      durationDays = Number(payload.durationDays);
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        return { status: 400, body: { message: "Valid duration in days (1-3650) is required for suspension." } };
      }
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const admin = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
      if (!admin || !["admin", "superadmin"].includes(admin.role)) return { status: 403, body: { message: "Forbidden: You do not have the required permissions." } };
      const report = await db.collection("reports").findOne({ _id: new ObjectId(reportId) });
      if (!report) return { status: 404, body: { message: "Report not found." } };
      const target = await db.collection("users").findOne({ uid: report.reportedUserUid });
      if (!target) return { status: 404, body: { message: "Reported user not found." } };
      // Moderation must never let an ordinary admin demote or disable another
      // administrator. Superadmin identities are immutable through report actions.
      if (target.role === "superadmin") {
        return { status: 403, body: { message: "Superadmin accounts cannot be moderated through reports." } };
      }
      if (["admin", "contributor"].includes(target.role) && admin.role !== "superadmin") {
        return { status: 403, body: { message: "Only a superadmin can moderate administrative accounts." } };
      }
      if (payload.action !== "dismiss" &&
          ["deletion_pending", "deleted"].includes(target.accountStatus)) {
        return { status: 409, body: { message: "An account in the deletion process cannot be changed by report moderation." } };
      }
      if (payload.action === "restore_user" && target.accountStatus === "permanently_banned" &&
          admin.role !== "superadmin") {
        return { status: 403, body: { message: "Only a superadmin can restore a permanently banned account." } };
      }
      const now = new Date();
      auditCollection = db.collection("auditlogs");
      const auditEntry = {
        eventType: "moderation_action",
        actorUid: uid,
        targetUid: report.reportedUserUid,
        reportId: report._id,
        action: payload.action,
        previousAccountStatus: target.accountStatus || "active",
        previousProfileVisibility: target.isProfileVisible !== false,
        ...(payload.action === "suspend_user" ? { durationDays } : {}),
        outcome: "started",
        createdAt: now,
        updatedAt: now
      };
      // Fail closed: do not mutate an account unless the moderation audit entry
      // has been durably written first. An interrupted action remains visible as
      // outcome="started" for administrative investigation.
      const auditResult = await auditCollection.insertOne(auditEntry);
      auditId = auditResult.insertedId;
      let status;
      if (payload.action === "dismiss") {
        status = "resolved_no_action";
      } else if (payload.action === "suspend_user") {
        const until = new Date(now.getTime() + durationDays * 86400000);
        await db.collection("users").updateOne({ _id: target._id }, {
          $set: {
            accountStatus: "temporarily_suspended", suspendedUntil: until,
            profileVisibilityBeforeSuspension: target.profileVisibilityBeforeSuspension !== undefined
              ? target.profileVisibilityBeforeSuspension : target.isProfileVisible !== false,
            isProfileVisible: false, suspendedBy: uid,
            moderationReason: typeof payload.adminNotes === "string" ? payload.adminNotes.trim() : "Policy violation",
            updatedAt: now
          }
        });
        status = "resolved_user_suspended";
      } else if (payload.action === "ban_user") {
        await db.collection("users").updateOne({ _id: target._id }, {
          $set: {
            role: "user", accountStatus: "permanently_banned", isProfileVisible: false,
            suspendedUntil: new Date("9999-12-31T00:00:00.000Z"), bannedAt: now, bannedBy: uid,
            moderationReason: typeof payload.adminNotes === "string" ? payload.adminNotes.trim() : "Policy violation",
            updatedAt: now
          },
          $unset: { profileVisibilityBeforeSuspension: "", suspendedBy: "" }
        });
        status = "resolved_user_banned";
      } else {
        await db.collection("users").updateOne({ _id: target._id }, {
          $set: {
            accountStatus: "active",
            isProfileVisible: target.profileVisibilityBeforeSuspension !== false,
            updatedAt: now
          },
          $unset: {
            suspendedUntil: "", bannedAt: "", bannedBy: "", moderationReason: "",
            profileVisibilityBeforeSuspension: "", suspendedBy: ""
          }
        });
        status = "resolved_user_restored";
      }
      let chatAccessRevocationStatus = "not_required";
      if (payload.action === "suspend_user" || payload.action === "ban_user") {
        await Promise.all([
          db.collection("chatTyping").deleteMany({ uid: report.reportedUserUid }),
          db.collection("callSessions").updateMany(
            { $or: [{ callerUid: report.reportedUserUid }, { receiverUid: report.reportedUserUid }], status: { $in: ["ringing", "accepted"] } },
            { $set: { status: "cancelled", endedAt: new Date(), updatedAt: new Date(), endReason: "account_suspension" } }
          ),
          db.collection("videoRooms").updateMany(
            { hostUid: report.reportedUserUid, status: "active" },
            { $set: { status: "ended", endedAt: new Date(), updatedAt: new Date(), endReason: "account_suspension" } }
          )
        ]);
        try {
          const revocation = await revokeFirebaseChatMemberships(this.env, report.reportedUserUid, db);
          if (revocation.configured) {
            chatAccessRevocationStatus = "completed";
            await db.collection("users").updateOne({ uid: report.reportedUserUid }, { $set: {
              chatAccessRevocationStatus,
              chatAccessRevokedRoomCount: revocation.revoked,
              chatAccessRevokedAt: new Date()
            } });
          }
        } catch {
          chatAccessRevocationStatus = "retry_pending";
          await db.collection("users").updateOne({ uid: report.reportedUserUid }, { $set: {
            chatAccessRevocationStatus,
            chatAccessRevocationLastAttemptAt: new Date()
          } });
          await auditCollection.updateOne({ _id: auditId }, { $set: {
            outcome: "revocation_pending", chatAccessRevocationStatus, updatedAt: new Date()
          } });
          return { status: 202, body: {
            message: "Account restriction is active, but realtime chat access revocation is pending.",
            accountStatus: payload.action === "ban_user" ? "permanently_banned" : "temporarily_suspended",
            chatAccessRevocationStatus
          } };
        }
      }
      const update = { status, updatedAt: now };
      if (typeof payload.adminNotes === "string") update.adminNotes = payload.adminNotes.trim();
      if (chatAccessRevocationStatus !== "not_required") update.chatAccessRevocationStatus = chatAccessRevocationStatus;
      await db.collection("reports").updateOne({ _id: report._id }, { $set: update });
      await auditCollection.updateOne(
        { _id: auditId, outcome: "started" },
        { $set: { outcome: "completed", reportStatus: status, updatedAt: new Date() } }
      );
      return { status: 200, body: { message: "Action '" + payload.action + "' performed successfully.", report: { ...report, ...update } } };
    } catch (error) {
      if (auditCollection && auditId) {
        try {
          await auditCollection.updateOne(
            { _id: auditId, outcome: "started" },
            { $set: { outcome: "failed_or_interrupted", updatedAt: new Date() } }
          );
        } catch (auditError) {
          console.error("Moderation audit finalization failed", {
            phase: "moderation-audit-finalize",
            message: auditError && typeof auditError.message === "string" ? auditError.message.slice(0, 160) : "Unknown error"
          });
        }
      }
      console.error("Moderation action failed", {
        phase: "moderation-action",
        message: error && typeof error.message === "string" ? error.message.slice(0, 160) : "Unknown error"
      });
      return { status: 503, body: { message: "Report moderation service is temporarily unavailable." } };
    }
  }

  async getPurchaseStatus(uid, purchaseId) {
    if (typeof purchaseId !== "string" || !/^[a-fA-F0-9]{24}$/.test(purchaseId)) {
      return { status: 400, body: { error: "Invalid purchase ID" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const purchase = await db.collection("purchases").findOne({ _id: new ObjectId(purchaseId) });
      if (!purchase) return { status: 404, body: { error: "Purchase not found" } };
      if (String(purchase.userId) !== String(user._id)) return { status: 403, body: { error: "Access denied." } };
      return { status: 200, body: { status: purchase.status } };
    } catch {
      return { status: 503, body: { error: "Purchase service is temporarily unavailable." } };
    }
  }

  async getSubscriptionStatus(uid, subscriptionId) {
    if (typeof subscriptionId !== "string" || !/^[a-fA-F0-9]{24}$/.test(subscriptionId)) {
      return { status: 400, body: { error: "Invalid subscription ID" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const subscription = await db.collection("subscriptions").findOne({ _id: new ObjectId(subscriptionId) });
      if (!subscription) return { status: 404, body: { error: "Subscription not found" } };
      if (String(subscription.userId) !== String(user._id)) {
        return { status: 403, body: { error: "Not authorized to view this subscription" } };
      }
      return { status: 200, body: { status: subscription.status, plan: subscription.plan, endDate: subscription.endDate } };
    } catch {
      return { status: 503, body: { error: "Subscription service is temporarily unavailable." } };
    }
  }

  async createSupportTicket(uid, payload) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        !payload || typeof payload.subject !== "string" || !payload.subject.trim() ||
        payload.subject.trim().length > 200 || typeof payload.message !== "string" ||
        !payload.message.trim() || payload.message.trim().length > 5000) {
      return { status: 400, body: { message: "A subject and message are required." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const now = new Date();
      // Start the default Normal-priority SLA when the customer opens the
      // ticket, rather than waiting for an administrator to edit metadata.
      const ticket = {
        userId: user._id,
        ticketNumber: crypto.randomUUID(),
        subject: payload.subject.trim(),
        status: "Open",
        priority: "Normal",
        category: "Other",
        slaDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      };
      const ticketResult = await db.collection("supporttickets").insertOne(ticket);
      ticket._id = ticketResult.insertedId;
      const message = {
        ticketId: ticket._id,
        senderId: user._id,
        message: payload.message.trim(),
        createdAt: now,
        updatedAt: now
      };
      const messageResult = await db.collection("ticketmessages").insertOne(message);
      message._id = messageResult.insertedId;
      return { status: 201, body: ticket };
    } catch {
      return { status: 503, body: { message: "Support ticket service is temporarily unavailable." } };
    }
  }

  async getSupportTickets(uid) {
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const tickets = await db.collection("supporttickets").find({ userId: user._id }).sort({ createdAt: -1 }).toArray();
      return { status: 200, body: tickets };
    } catch {
      return { status: 503, body: { message: "Support ticket service is temporarily unavailable." } };
    }
  }

  async getSupportTicket(uid, ticketId) {
    if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId)) {
      return { status: 400, body: { message: "Invalid ticket ID" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const ticket = await db.collection("supporttickets").findOne({ _id: new ObjectId(ticketId), userId: user._id });
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      const messages = await db.collection("ticketmessages").find({ ticketId: ticket._id, isInternalNote: { $ne: true } }).sort({ createdAt: 1 }).toArray();
      const senderIds = [...new Set(messages.map(item => String(item.senderId)))];
      const { ObjectId: MongoObjectId } = await import("mongodb");
      const senders = senderIds.length
        ? await db.collection("users").find({ _id: { $in: senderIds.map(id => new MongoObjectId(id)) } }, { projection: { name: 1 } }).toArray()
        : [];
      const names = new Map(senders.map(sender => [String(sender._id), sender.name || ""]));
      return { status: 200, body: { ticket, messages: messages.map(item => ({ ...item, senderId: { _id: item.senderId, name: names.get(String(item.senderId)) || "" } })) } };
    } catch {
      return { status: 503, body: { message: "Support ticket service is temporarily unavailable." } };
    }
  }

  async updateSupportTicketMessage(uid, ticketId, messageId, payload = {}, adminAction = false) {
    if (adminAction) {
      const access = await this.requireAdmin(uid);
      if (access.status !== 200) return access;
    }
    if (![ticketId, messageId].every(value => typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value)) ||
        typeof payload.message !== "string" || !payload.message.trim() || payload.message.trim().length > 5000) {
      return { status: 400, body: { message: "A valid message between 1 and 5000 characters is required." } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const actor = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!actor) return { status: 404, body: { message: "User not found" } };
      const ticketObjectId = new ObjectId(ticketId);
      const ticketQuery = adminAction ? { _id: ticketObjectId } : { _id: ticketObjectId, userId: actor._id };
      const ticket = await db.collection("supporttickets").findOne(ticketQuery);
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      const messageObjectId = new ObjectId(messageId);
      const messageQuery = { _id: messageObjectId, ticketId: ticketObjectId, deletedAt: { $exists: false } };
      if (!adminAction) Object.assign(messageQuery, { senderId: actor._id, isFromAdmin: { $ne: true }, isInternalNote: { $ne: true } });
      const message = await db.collection("ticketmessages").findOne(messageQuery);
      if (!message) return { status: 404, body: { message: "Message not found" } };
      const createdAtMs = new Date(message.createdAt).getTime();
      if (!adminAction && (!Number.isFinite(createdAtMs) || createdAtMs > Date.now() || Date.now() - createdAtMs > 15 * 60 * 1000)) {
        return { status: 403, body: { message: "Messages can only be edited within 15 minutes of sending." } };
      }
      // Use optimistic concurrency so simultaneous edits cannot overwrite one
      // another after both have written separate audit entries.
      if (message.updatedAt) messageQuery.updatedAt = message.updatedAt;
      else messageQuery.updatedAt = { $exists: false };
      const now = new Date();
      const auditLogs = db.collection("auditlogs");
      const auditResult = await auditLogs.insertOne({
        eventType: "support_ticket_message_edited", actorUid: uid, actorType: adminAction ? "admin" : "customer",
        ticketId: ticketObjectId, messageId: messageObjectId, previousMessage: message.message,
        updatedMessage: payload.message.trim(), createdAt: now
      });
      const updateResult = await db.collection("ticketmessages").updateOne(messageQuery, {
        $set: { message: payload.message.trim(), editedAt: now, editedByUid: uid, updatedAt: now }
      });
      if (!updateResult.matchedCount) {
        if (auditResult?.insertedId) await auditLogs.deleteOne({ _id: auditResult.insertedId });
        return { status: 409, body: { message: "Message changed before the edit could be saved." } };
      }
      await db.collection("supporttickets").updateOne({ _id: ticketObjectId }, { $set: { updatedAt: now } });
      return { status: 200, body: { ...message, message: payload.message.trim(), editedAt: now, updatedAt: now, editedByUid: uid } };
    } catch { return { status: 503, body: { message: "Unable to edit support message." } }; }
  }

  async deleteSupportTicketMessage(uid, ticketId, messageId, adminAction = false) {
    if (adminAction) {
      const access = await this.requireAdmin(uid);
      if (access.status !== 200) return access;
    }
    if (![ticketId, messageId].every(value => typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value))) {
      return { status: 400, body: { message: "Invalid ticket or message ID." } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const actor = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!actor) return { status: 404, body: { message: "User not found" } };
      const ticketObjectId = new ObjectId(ticketId);
      const ticketQuery = adminAction ? { _id: ticketObjectId } : { _id: ticketObjectId, userId: actor._id };
      const ticket = await db.collection("supporttickets").findOne(ticketQuery);
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      const messageObjectId = new ObjectId(messageId);
      const messageQuery = { _id: messageObjectId, ticketId: ticketObjectId, deletedAt: { $exists: false } };
      if (!adminAction) Object.assign(messageQuery, { senderId: actor._id, isFromAdmin: { $ne: true }, isInternalNote: { $ne: true } });
      const message = await db.collection("ticketmessages").findOne(messageQuery);
      if (!message) return { status: 404, body: { message: "Message not found" } };
      const createdAtMs = new Date(message.createdAt).getTime();
      if (!adminAction && (!Number.isFinite(createdAtMs) || createdAtMs > Date.now() || Date.now() - createdAtMs > 60 * 60 * 1000)) {
        return { status: 403, body: { message: "Messages can only be deleted within one hour of sending." } };
      }
      // Keep deletion atomic with respect to edits or another deletion.
      if (message.updatedAt) messageQuery.updatedAt = message.updatedAt;
      else messageQuery.updatedAt = { $exists: false };
      const now = new Date();
      const auditLogs = db.collection("auditlogs");
      const auditResult = await auditLogs.insertOne({
        eventType: "support_ticket_message_deleted", actorUid: uid, actorType: adminAction ? "admin" : "customer",
        ticketId: ticketObjectId, messageId: messageObjectId, previousMessage: message.message,
        attachments: Array.isArray(message.attachments) ? message.attachments : [], createdAt: now
      });
      const updateResult = await db.collection("ticketmessages").updateOne(messageQuery, {
        $set: { message: "This message was deleted.", deletedAt: now, deletedByUid: uid, updatedAt: now },
        $unset: { attachments: "" }
      });
      if (!updateResult.matchedCount) {
        if (auditResult?.insertedId) await auditLogs.deleteOne({ _id: auditResult.insertedId });
        return { status: 409, body: { message: "Message changed before deletion could be saved." } };
      }
      await db.collection("supporttickets").updateOne({ _id: ticketObjectId }, { $set: { updatedAt: now } });
      return { status: 200, body: { success: true, messageId } };
    } catch { return { status: 503, body: { message: "Unable to delete support message." } }; }
  }

  async submitSupportTicketFeedback(uid, ticketId, payload) {
    if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId) ||
        !payload || !Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5 ||
        (payload.comment !== undefined && (typeof payload.comment !== "string" || payload.comment.trim().length > 1000))) {
      return { status: 400, body: { message: "A rating from 1 to 5 and an optional comment of up to 1,000 characters are required." } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const tickets = db.collection("supporttickets");
      const ticketObjectId = new ObjectId(ticketId);
      const ticket = await tickets.findOne({ _id: ticketObjectId, userId: user._id });
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      if (ticket.status !== "Closed") return { status: 409, body: { message: "Feedback is available after the ticket has been closed." } };
      if (ticket.customerFeedback) return { status: 409, body: { message: "Feedback has already been submitted for this ticket." } };
      const now = new Date();
      const feedback = { rating: payload.rating, comment: typeof payload.comment === "string" ? payload.comment.trim() : "", submittedAt: now };
      const saved = await tickets.updateOne(
        { _id: ticketObjectId, userId: user._id, status: "Closed", customerFeedback: { $exists: false } },
        { $set: { customerFeedback: feedback } }
      );
      if (!saved.modifiedCount) {
        const latest = await tickets.findOne({ _id: ticketObjectId, userId: user._id }, { projection: { status: 1, customerFeedback: 1 } });
        if (!latest) return { status: 404, body: { message: "Ticket not found" } };
        return { status: 409, body: { message: latest.customerFeedback ? "Feedback has already been submitted for this ticket." : "Feedback is available after the ticket has been closed." } };
      }
      await db.collection("auditlogs").insertOne({
        eventType: "support_ticket_feedback_submitted", actorUid: uid, actorType: "customer",
        ticketId: ticketObjectId,
        changes: [{ field: "customerFeedback.rating", from: null, to: feedback.rating }],
        createdAt: now
      });
      return { status: 201, body: { customerFeedback: feedback } };
    } catch {
      return { status: 503, body: { message: "Support ticket service is temporarily unavailable." } };
    }
  }

  async addSupportTicketMessage(uid, ticketId, payload) {
    if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId) ||
        !payload || typeof payload.message !== "string" || !payload.message.trim() ||
        payload.message.trim().length > 5000) {
      return { status: 400, body: { message: "A valid ticket ID and message are required." } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const ticket = await db.collection("supporttickets").findOne({ _id: new ObjectId(ticketId), userId: user._id });
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      const now = new Date();
      const wasClosed = ticket.status === "Closed";
      const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 5).filter(item => {
        if (!item || typeof item.key !== "string" || typeof item.url !== "string" ||
            typeof item.name !== "string" ||
            !["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(item.type) ||
            !Number.isFinite(Number(item.size)) || Number(item.size) <= 0 ||
            Number(item.size) > 10 * 1024 * 1024) return false;

        // Attachment metadata is client-controlled. Accept only the exact
        // ticket-scoped object key and URL generated by this API's configured CDN.
        const keyPrefix = "support-" + ticketId + "-";
        if (!item.key.startsWith(keyPrefix) ||
            !/^[0-9]{10,16}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|jpeg|png|gif|webp|pdf)$/i.test(item.key.slice(keyPrefix.length))) return false;
        try {
          const configured = String(this.env.CDN_HOSTNAME || "").trim();
          if (!configured) return false;
          const base = new URL(configured.toLowerCase().startsWith("https://") ? configured : "https://" + configured);
          const supplied = new URL(item.url);
          if (base.protocol !== "https:" || supplied.protocol !== "https:" ||
              base.username || base.password || base.search || base.hash ||
              supplied.username || supplied.password || supplied.search || supplied.hash) return false;
          const expectedPath = base.pathname.replace(/\/+$/, "") + "/" + encodeURIComponent(item.key);
          return supplied.origin === base.origin && supplied.pathname === expectedPath;
        } catch {
          return false;
        }
      }).map(item => ({
        key: item.key, url: item.url, name: item.name.replace(/[\r\n\0]/g, "_").slice(0, 180),
        type: item.type, size: Number(item.size)
      })) : [];
      const message = { ticketId: ticket._id, senderId: user._id, message: payload.message.trim(), ...(attachments.length ? { attachments } : {}), createdAt: now, updatedAt: now };
      const result = await db.collection("ticketmessages").insertOne(message);
      message._id = result.insertedId;
      const reopening = wasClosed;
      const nextStatus = reopening ? "Open" : "In Progress";
      const ticketUpdate = { status: nextStatus, updatedAt: now };
      if (reopening) {
        const slaHours = { Urgent: 1, High: 4, Normal: 24, Low: 72 };
        ticketUpdate.resolutionSummary = null;
        ticketUpdate.resolvedAt = null;
        ticketUpdate.resolvedByUid = null;
        ticketUpdate.slaDueAt = new Date(now.getTime() + (slaHours[ticket.priority] || 24) * 60 * 60 * 1000);
      }
      await db.collection("supporttickets").updateOne({ _id: ticket._id, userId: user._id }, { $set: ticketUpdate });
      if (reopening) await db.collection("auditlogs").insertOne({
        eventType: "support_ticket_updated", actorUid: uid, actorType: "customer",
        ticketId: ticket._id,
        changes: [
          { field: "status", from: "Closed", to: "Open" },
          { field: "resolutionSummary", from: ticket.resolutionSummary || null, to: null }
        ],
        createdAt: now
      });
      return { status: 201, body: message };
    } catch {
      return { status: 503, body: { message: "Support ticket service is temporarily unavailable." } };
    }
  }

  async createReport(reporterUid, payload) {
    const categories = [
      "spam",
      "inappropriate_profile_content",
      "harassment_or_bullying",
      "hateful_conduct",
      "impersonation",
      "underage_user",
      "scam_or_fraud",
      "other"
    ];
    const reportedUserUid = payload?.reportedUserUid;
    const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
    const category = payload?.category;
    if (typeof reportedUserUid !== "string" || !reportedUserUid || reportedUserUid.length > 128 ||
        reportedUserUid === reporterUid || !reason || reason.length > 2000 || !categories.includes(category)) {
      return { status: 400, body: { error: "A different reported user, valid category, and reason of at most 2000 characters are required." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const [reporter, reported] = await Promise.all([
        users.findOne({ uid: reporterUid }, { projection: { _id: 1 } }),
        users.findOne({ uid: reportedUserUid }, { projection: { _id: 1 } })
      ]);
      if (!reporter) return { status: 404, body: { error: "Reporter user not found." } };
      if (!reported) return { status: 404, body: { error: "Reported user not found." } };
      const reports = db.collection("reports");
      const now = new Date();
      const duplicateSince = new Date(now.getTime() - 30 * 86400000);
      // Deduplicate a reporter/target pair for 30 days so repeat submissions
      // cannot inflate the review queue or independent-reporter signal.
      const duplicate = await reports.findOne({
        reporterUid, reportedUserUid, createdAt: { $gte: duplicateSince }
      }, { projection: { _id: 1, status: 1 } });
      if (duplicate) {
        return { status: 409, body: {
          error: "You have already reported this user recently.",
          existingReportStatus: duplicate.status || "pending_review"
        } };
      }
      const report = {
        reporterUid, reportedUserUid, reason, category,
        status: "pending_review", adminNotes: "", createdAt: now, updatedAt: now
      };
      const result = await reports.insertOne(report);
      // Independent reports prioritize human review only; counts never auto-ban.
      const recentSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let distinctReporterCount = 1;
      if (typeof reports.distinct === "function") {
        const reporterIds = await reports.distinct("reporterUid", {
          reportedUserUid, createdAt: { $gte: recentSince }, status: "pending_review"
        });
        distinctReporterCount = Math.max(1, reporterIds.length);
      } else if (typeof reports.countDocuments === "function") {
        distinctReporterCount = Math.max(1, await reports.countDocuments({
          reportedUserUid, createdAt: { $gte: recentSince }, status: "pending_review"
        }));
      }
      const reviewPriority = category === "underage_user" ? "urgent"
        : (["scam_or_fraud", "harassment_or_bullying", "hateful_conduct"].includes(category) || distinctReporterCount >= 3
          ? "high" : "normal");
      await reports.updateOne(
        { _id: result.insertedId },
        { $set: { distinctReporterCount24h: distinctReporterCount, reviewPriority, updatedAt: now } }
      );
      return { status: 201, body: {
        message: "Report submitted successfully.", reportId: result.insertedId.toString(),
        reviewPriority, distinctReporterCount24h: distinctReporterCount
      } };
    } catch {
      return { status: 503, body: { error: "Report service is temporarily unavailable." } };
    }
  }

  async getUserLocationStatus(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const user = await this.getDatabase(await this.getClient()).collection("users").findOne(
        { uid },
        { projection: { locationSharing: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }
      );
      if (!user) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(user)) return { status: 403, body: { error: "This account is unavailable." } };
      const sharing = user.locationSharing || {};
      const updatedAt = sharing.updatedAt ? new Date(sharing.updatedAt) : null;
      const now = Date.now();
      const stale = !updatedAt || Number.isNaN(updatedAt.getTime()) ||
        updatedAt.getTime() > now ||
        now - updatedAt.getTime() > 24 * 60 * 60 * 1000;
      return { status: 200, body: {
        enabled: sharing.enabled === true,
        stale: sharing.enabled === true && stale,
        updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
        accuracyMeters: Number.isFinite(sharing.accuracyMeters) ? sharing.accuracyMeters : null
      } };
    } catch {
      return { status: 503, body: { error: "Location settings are unavailable." } };
    }
  }

  async saveUserLocation(uid, payload) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        !payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: 400, body: { error: "Invalid location update" } };
    }
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const accuracyMeters = Number(payload.accuracyMeters);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 5000) {
      return { status: 400, body: { error: "A valid GPS position with accuracy of 5 km or better is required." } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne(
        { uid },
        { projection: { location: 1, locationSharing: 1, birthday: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }
      );
      if (!user) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(user)) return { status: 403, body: { error: "This account is unavailable." } };
      const birthday = user.birthday ? new Date(user.birthday) : null;
      if (!birthday || Number.isNaN(birthday.getTime())) {
        return { status: 403, body: { error: "Complete age verification before enabling location-based discovery." } };
      }
      const now = new Date();
      let age = now.getFullYear() - birthday.getFullYear();
      if (now.getMonth() < birthday.getMonth() ||
          (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
      if (age < 18) return { status: 403, body: { error: "Location-based dating discovery is available only to adults aged 18 or older." } };
      const previous = user.location && typeof user.location === "object" && !Array.isArray(user.location)
        ? user.location : {};
      const updatedAt = new Date();
      await users.updateOne({ _id: user._id }, {
        $set: {
          location: { ...previous, type: "Point", coordinates: [longitude, latitude] },
          locationSharing: {
            enabled: true,
            source: "browser_geolocation",
            accuracyMeters,
            // Keep the original opt-in timestamp across GPS refreshes. The
            // updatedAt field records freshness; consentAt records consent.
            consentAt: user.locationSharing?.enabled === true && user.locationSharing.consentAt
              ? user.locationSharing.consentAt
              : updatedAt,
            updatedAt
          }
        }
      });
      return { status: 200, body: { enabled: true, updatedAt, accuracyMeters } };
    } catch {
      return { status: 503, body: { error: "Could not update your location." } };
    }
  }

  async deleteUserLocation(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne({ uid }, { projection: { location: 1, _id: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const location = user.location && typeof user.location === "object" && !Array.isArray(user.location)
        ? { ...user.location } : {};
      delete location.coordinates;
      delete location.type;
      const update = { $set: { locationSharing: { enabled: false, revokedAt: new Date() } } };
      if (Object.keys(location).length) update.$set.location = location;
      else update.$unset = { location: "" };
      await users.updateOne({ _id: user._id }, update);
      return { status: 200, body: { enabled: false } };
    } catch {
      return { status: 503, body: { error: "Could not disable location sharing." } };
    }
  }

  async getRelationshipPreferences(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const user = await users.findOne(
        { uid },
        { projection: { birthday: 1, relationshipPreferences: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }
      );
      if (!user) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(user)) return { status: 403, body: { error: "This account is unavailable." } };
      const birthday = user.birthday ? new Date(user.birthday) : null;
      if (!birthday || Number.isNaN(birthday.getTime())) {
        return { status: 403, body: { error: "Complete adult age verification before using Desires & Discovery." } };
      }
      const now = new Date();
      let age = now.getFullYear() - birthday.getFullYear();
      if (now.getMonth() < birthday.getMonth() ||
          (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
      if (age < 18) return { status: 403, body: { error: "Desires & Discovery is available only to adults aged 18 or older." } };
      const saved = user.relationshipPreferences;
      return { status: 200, body: saved && saved.consent === true ? {
        consent: true,
        consentVersion: saved.consentVersion || 1,
        consentAt: saved.consentAt || null,
        relationshipIntent: Array.isArray(saved.relationshipIntent) ? saved.relationshipIntent : [],
        relationshipStyles: Array.isArray(saved.relationshipStyles) ? saved.relationshipStyles : [],
        desires: Array.isArray(saved.desires) ? saved.desires : [],
        curiosities: Array.isArray(saved.curiosities) ? saved.curiosities : [],
        boundaries: Array.isArray(saved.boundaries) ? saved.boundaries : [],
        visibility: {
          relationshipIntent: saved.visibility?.relationshipIntent === "public" ? "public" : "private",
          relationshipStyles: saved.visibility?.relationshipStyles === "public" ? "public" : "private",
          desires: "private",
          curiosities: "private",
          boundaries: "private"
        },
        updatedAt: saved.updatedAt || null
      } : {
        consent: false,
        relationshipIntent: [],
        relationshipStyles: [],
        desires: [],
        curiosities: [],
        boundaries: [],
        visibility: { relationshipIntent: "private", relationshipStyles: "private", desires: "private", curiosities: "private", boundaries: "private" }
      } };
    } catch {
      return { status: 503, body: { error: "Desires & Discovery preferences are unavailable." } };
    }
  }

  async saveRelationshipPreferences(uid, payload = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        !payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: 400, body: { error: "Invalid preferences request" } };
    }
    if (payload.consent !== true) {
      return { status: 400, body: { error: "Explicit consent is required to save these sensitive preferences." } };
    }

    const catalogues = {
      relationshipIntent: new Set(["long_term", "casual_dating", "friendship", "exploring"]),
      relationshipStyles: new Set(["monogamy", "open_relationship", "ethical_non_monogamy", "polyamory", "partner_inclusive", "group_connection"]),
      desires: new Set(["romantic_exploration", "adventure", "roleplay", "sensory_experiences", "power_dynamics", "kink_aware", "shared_fantasies", "playful_experimentation"]),
      curiosities: new Set(["new_experiences", "nontraditional_relationships", "group_social_experiences", "partner_inclusive_dating", "roleplay", "sensory_exploration"]),
      boundaries: new Set(["no_unsolicited_explicit_media", "discuss_before_escalating", "no_pressure", "privacy_first", "no_group_invitations", "no_partner_linking"])
    };
    const limits = { relationshipIntent: 4, relationshipStyles: 6, desires: 8, curiosities: 6, boundaries: 6 };
    const visibilityInput = payload.visibility === undefined ? {} : payload.visibility;
    if (!visibilityInput || typeof visibilityInput !== "object" || Array.isArray(visibilityInput)) {
      return { status: 400, body: { error: "Invalid visibility settings" } };
    }
    const visibility = {
      relationshipIntent: visibilityInput.relationshipIntent === "public" ? "public" : "private",
      relationshipStyles: visibilityInput.relationshipStyles === "public" ? "public" : "private",
      desires: "private",
      curiosities: "private",
      boundaries: "private"
    };
    if (["desires", "curiosities", "boundaries"].some(field => visibilityInput[field] !== undefined && visibilityInput[field] !== "private")) {
      return { status: 400, body: { error: "Desires, curiosities and boundaries must remain private." } };
    }
    for (const field of ["relationshipIntent", "relationshipStyles"]) {
      if (visibilityInput[field] !== undefined && !["private", "public"].includes(visibilityInput[field])) {
        return { status: 400, body: { error: "Visibility must be private or public.", field } };
      }
    }
    const normalized = {};
    for (const [field, allowed] of Object.entries(catalogues)) {
      const values = payload[field] === undefined ? [] : payload[field];
      if (!Array.isArray(values) || values.length > limits[field] ||
          values.some(value => typeof value !== "string" || !allowed.has(value)) ||
          new Set(values).size !== values.length) {
        return { status: 400, body: { error: "Invalid or unsupported preference selection", field } };
      }
      normalized[field] = values.slice();
    }

    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const current = await users.findOne(
        { uid },
        { projection: { birthday: 1, relationshipPreferences: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }
      );
      if (!current) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(current)) return { status: 403, body: { error: "This account is unavailable." } };
      const birthday = current.birthday ? new Date(current.birthday) : null;
      if (!birthday || Number.isNaN(birthday.getTime())) {
        return { status: 403, body: { error: "Complete adult age verification before using Desires & Discovery." } };
      }
      const now = new Date();
      let age = now.getFullYear() - birthday.getFullYear();
      if (now.getMonth() < birthday.getMonth() ||
          (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
      if (age < 18) return { status: 403, body: { error: "Desires & Discovery is available only to adults aged 18 or older." } };

      const previous = current.relationshipPreferences || {};
      const preferences = {
        consent: true,
        consentVersion: 1,
        consentAt: previous.consent === true && previous.consentAt ? previous.consentAt : now,
        updatedAt: now,
        ...normalized,
        visibility
      };
      await users.updateOne({ uid }, { $set: { relationshipPreferences: preferences, updatedAt: now } });
      return { status: 200, body: {
        consent: true,
        consentVersion: preferences.consentVersion,
        consentAt: preferences.consentAt,
        updatedAt: preferences.updatedAt,
        ...normalized,
        visibility
      } };
    } catch {
      return { status: 503, body: { error: "Desires & Discovery preferences could not be saved." } };
    }
  }

  async deleteRelationshipPreferences(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const current = await users.findOne({ uid }, { projection: { accountStatus: 1, suspendedUntil: 1 } });
      if (!current) return { status: 404, body: { error: "User not found" } };
      // Consent withdrawal and deletion must remain available even if the account is restricted.
      await users.updateOne({ uid }, { $unset: { relationshipPreferences: "" }, $set: { updatedAt: new Date() } });
      return { status: 200, body: { deleted: true, consentRevoked: true } };
    } catch {
      return { status: 503, body: { error: "Desires & Discovery preferences could not be deleted." } };
    }
  }

  async managePartnerLink(uid, action, payload = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        !["list", "invite", "accept", "decline", "revoke"].includes(action) ||
        !payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: 400, body: { error: "Invalid partner-link request" } };
    }

    try {
      const db = this.getDatabase(await this.getClient());
      const links = db.collection("partnerLinks");
      await links.createIndex({ memberUids: 1 }, {
        unique: true,
        partialFilterExpression: { activeKey: { $exists: true } },
        name: "one_active_partner_link_per_member"
      });
      if (action === "list") {
        const items = await links.find({ memberUids: uid })
          .sort({ updatedAt: -1, createdAt: -1 }).limit(20).toArray();
        return { status: 200, body: { links: items.map(item => ({
          id: String(item._id),
          status: item.status,
          inviterUid: item.inviterUid,
          inviteeUid: item.inviteeUid,
          isIncoming: item.inviteeUid === uid,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          acceptedAt: item.acceptedAt || null,
          revokedAt: item.revokedAt || null
        })) } };
      }

      const now = new Date();
      if (action === "invite") {
        const targetUid = payload.targetUid;
        if (typeof targetUid !== "string" || !targetUid || targetUid.length > 128 || targetUid === uid) {
          return { status: 400, body: { error: "Choose another valid member to invite." } };
        }
        const users = db.collection("users");
        const [inviter, invitee] = await Promise.all([
          users.findOne({ uid }, { projection: { birthday: 1, relationshipPreferences: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1, blocked: 1 } }),
          users.findOne({ uid: targetUid }, { projection: { birthday: 1, relationshipPreferences: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1, blocked: 1 } })
        ]);
        if (!inviter || !invitee) return { status: 404, body: { error: "Member not found." } };
        if (isAccountRestricted(inviter) || isAccountRestricted(invitee)) {
          return { status: 403, body: { error: "Both members must have eligible accounts." } };
        }
        if ((Array.isArray(inviter.blocked) && inviter.blocked.includes(targetUid)) ||
            (Array.isArray(invitee.blocked) && invitee.blocked.includes(uid))) {
          return { status: 404, body: { error: "Member not found." } };
        }
        const isAdult = user => {
          const birthday = user.birthday ? new Date(user.birthday) : null;
          if (!birthday || Number.isNaN(birthday.getTime())) return false;
          let age = now.getFullYear() - birthday.getFullYear();
          if (now.getMonth() < birthday.getMonth() ||
              (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
          return age >= 18;
        };
        if (!isAdult(inviter) || !isAdult(invitee)) {
          return { status: 403, body: { error: "Partner linking is available only to members whose recorded birthday indicates they are at least 18." } };
        }
        if (inviter.relationshipPreferences?.boundaries?.includes("no_partner_linking") ||
            invitee.relationshipPreferences?.boundaries?.includes("no_partner_linking")) {
          return { status: 403, body: { error: "Partner linking is unavailable because a member has disabled partner-link requests." } };
        }
        const linkKey = JSON.stringify([uid, targetUid].sort());
        const existing = await links.findOne({ memberUids: { $in: [uid, targetUid] }, activeKey: { $exists: true } });
        if (existing) {
          return { status: 409, body: { error: "One of these members already has a pending or active partner link." } };
        }
        const previousPair = await links.findOne(
          { memberUids: { $all: [uid, targetUid] } },
          { sort: { updatedAt: -1, createdAt: -1 } }
        );
        const pairCooldownStartedAt = previousPair?.declinedAt || previousPair?.revokedAt ||
          previousPair?.updatedAt || previousPair?.createdAt;
        if (previousPair && ["declined", "revoked"].includes(previousPair.status) &&
            pairCooldownStartedAt && new Date(pairCooldownStartedAt).getTime() > now.getTime() - 30 * 24 * 60 * 60 * 1000) {
          return { status: 429, body: { error: "A partner-link request for this pair cannot be repeated for 30 days after decline or revocation." } };
        }
        const document = {
          activeKey: linkKey,
          memberUids: [uid, targetUid],
          inviterUid: uid,
          inviteeUid: targetUid,
          status: "pending",
          createdAt: now,
          updatedAt: now
        };
        try {
          const inserted = await links.insertOne(document);
          return { status: 201, body: { id: String(inserted.insertedId), status: "pending", inviteeUid: targetUid } };
        } catch (error) {
          if (error?.code === 11000) return { status: 409, body: { error: "One of these members already has a pending or active partner link." } };
          throw error;
        }
      }

      const linkId = payload.linkId;
      if (typeof linkId !== "string" || !/^[a-f0-9]{24}$/i.test(linkId)) {
        return { status: 400, body: { error: "A valid partner-link ID is required." } };
      }
      const { ObjectId } = await import("mongodb");
      const link = await links.findOne({ _id: new ObjectId(linkId), memberUids: uid });
      if (!link) return { status: 404, body: { error: "Partner link not found." } };
      if (action === "accept" || action === "decline") {
        if (link.inviteeUid !== uid) return { status: 403, body: { error: "Only the invited member can respond to this request." } };
        if (link.status !== "pending") return { status: 409, body: { error: "This partner-link request is no longer pending." } };
        if (action === "accept") {
          const users = db.collection("users");
          const [inviter, invitee] = await Promise.all([
            users.findOne({ uid: link.inviterUid }, { projection: { birthday: 1, relationshipPreferences: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1, blocked: 1 } }),
            users.findOne({ uid: link.inviteeUid }, { projection: { birthday: 1, relationshipPreferences: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1, blocked: 1 } })
          ]);
          const isAdult = user => {
            const birthday = user?.birthday ? new Date(user.birthday) : null;
            if (!birthday || Number.isNaN(birthday.getTime())) return false;
            let age = now.getFullYear() - birthday.getFullYear();
            if (now.getMonth() < birthday.getMonth() ||
                (now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate())) age--;
            return age >= 18;
          };
          if (!inviter || !invitee || isAccountRestricted(inviter) || isAccountRestricted(invitee) ||
              !isAdult(inviter) || !isAdult(invitee)) {
            return { status: 403, body: { error: "Both members must remain eligible adults to accept a partner link." } };
          }
          if ((Array.isArray(inviter.blocked) && inviter.blocked.includes(link.inviteeUid)) ||
              (Array.isArray(invitee.blocked) && invitee.blocked.includes(link.inviterUid)) ||
              inviter.relationshipPreferences?.boundaries?.includes("no_partner_linking") ||
              invitee.relationshipPreferences?.boundaries?.includes("no_partner_linking")) {
            return { status: 403, body: { error: "Partner-link consent is no longer available for these members." } };
          }
        }
        const update = action === "accept"
          ? { $set: { status: "accepted", acceptedAt: now, updatedAt: now } }
          : { $set: { status: "declined", declinedAt: now, updatedAt: now }, $unset: { activeKey: "" } };
        const result = await links.updateOne({ _id: link._id, inviteeUid: uid, status: "pending" }, update);
        if (!result.modifiedCount) return { status: 409, body: { error: "This partner-link request has already changed." } };
        return { status: 200, body: { id: linkId, status: action === "accept" ? "accepted" : "declined" } };
      }
      if (!["pending", "accepted"].includes(link.status)) {
        return { status: 409, body: { error: "This partner link is no longer active." } };
      }
      const result = await links.updateOne(
        { _id: link._id, memberUids: uid, status: link.status },
        { $set: { status: "revoked", revokedByUid: uid, revokedAt: now, updatedAt: now }, $unset: { activeKey: "" } }
      );
      if (!result.modifiedCount) return { status: 409, body: { error: "This partner link has already changed." } };
      return { status: 200, body: { id: linkId, status: "revoked", revoked: true } };
    } catch {
      return { status: 503, body: { error: "Partner-link service is unavailable." } };
    }
  }

  async getUserProfile(targetUid, viewerUid) {
    if (typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
        typeof viewerUid !== "string" || !viewerUid || viewerUid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid: targetUid });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const viewer = targetUid === viewerUid ? user : await db.collection("users").findOne(
        { uid: viewerUid }, { projection: { role: 1, blocked: 1 } }
      );
      const isOwner = targetUid === viewerUid;
      const isSuperAdmin = viewer?.role === "superadmin";
      const viewerBlockedTarget = Array.isArray(viewer?.blocked) && viewer.blocked.includes(targetUid);
      const targetBlockedViewer = Array.isArray(user.blocked) && user.blocked.includes(viewerUid);
      if (!isOwner && !isSuperAdmin &&
          (user.isProfileVisible === false || viewerBlockedTarget || targetBlockedViewer)) {
        // Do not reveal whether a hidden or blocked profile exists.
        return { status: 404, body: { error: "User not found" } };
      }
      const profile = { ...user };
      // Relationship preferences are strictly owner-only, including for administrators.
      if (!isOwner) {
        const preferences = profile.relationshipPreferences;
        if (!isSuperAdmin && preferences?.consent === true) {
          const visibility = preferences.visibility || {};
          const relationshipDiscovery = {};
          if (visibility.relationshipIntent === "public" && Array.isArray(preferences.relationshipIntent) && preferences.relationshipIntent.length) {
            relationshipDiscovery.relationshipIntent = preferences.relationshipIntent.slice();
          }
          if (visibility.relationshipStyles === "public" && Array.isArray(preferences.relationshipStyles) && preferences.relationshipStyles.length) {
            relationshipDiscovery.relationshipStyles = preferences.relationshipStyles.slice();
          }
          if (Object.keys(relationshipDiscovery).length) profile.relationshipDiscovery = relationshipDiscovery;
        }
        delete profile.relationshipPreferences;
        stripPreciseLocation(profile);
      }
      // Never expose credentials or operational IP metadata in profile responses.
      delete profile.password;
      delete profile.lastLoginIp;
      if (profile._id !== undefined) profile.id = String(profile._id);
      if (profile.isOnboardingComplete === undefined) profile.isOnboardingComplete = true;
      if (profile.birthday) {
        const birthday = new Date(profile.birthday);
        if (!Number.isNaN(birthday.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birthday.getFullYear();
          const month = today.getMonth() - birthday.getMonth();
          if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age--;
          profile.age = age;
        }
      }
      if (Array.isArray(profile.photos)) {
        profile.photos = profile.photos.map(photo => {
          if (!photo || typeof photo.url !== "string" || !photo.url) return photo;
          return { ...photo, url: this.getMediaUrl(photo.url) };
        });
      }
      return { status: 200, body: (isOwner || isSuperAdmin) ? profile : sanitizePublicProfile(profile) };
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async updateCurrentUserProfile(uid, update) {
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    if (!update || typeof update !== "object" || Array.isArray(update)) return { status: 400, body: { error: "A JSON profile object is required" } };
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const current = await users.findOne({ uid }, { projection: { isOnboardingComplete: 1, accountStatus: 1, suspendedUntil: 1, photos: 1, birthday: 1 } });
      if (!current) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(current)) return { status: 403, body: { error: "Account is suspended or banned." } };
      const onboardingComplete = current.isOnboardingComplete === undefined ? true : current.isOnboardingComplete;
      const hasRecordedBirthday = current.birthday !== undefined && current.birthday !== null && current.birthday !== "";
      const allowedFields = onboardingComplete
        ? ["preference", "sexualOrientation", "bio", "interests", "profilePrompts", "personalityType", "socialMediaLinks", "education", "relationshipGoals", "familyStatus", "siblings", "lifestyle", "mobileNumber", "badges", "lastActiveAt", ...(!hasRecordedBirthday ? ["birthday"] : [])]
        : ["name", "birthday", "gender", "preference", "sexualOrientation", "bio", "interests", "profilePrompts", "personalityType", "socialMediaLinks", "education", "relationshipGoals", "lifestyle", "mobileNumber", "photos", "badges", "lastActiveAt", "isOnboardingComplete"];
      const nestedAllowed = {
        lifestyle: ["drinking", "smoking", "exercise", "diet", "lookingFor"],
        socialMediaLinks: ["instagram", "spotify", "tiktok"],
        education: ["school", "degree"],
        badges: ["height"]
      };
      const sanitizedUpdate = {};
      if (Object.hasOwn(update, "photos") && !onboardingComplete) {
        if (!Array.isArray(update.photos) || update.photos.length < 1 || update.photos.length > 6) {
          return { status: 400, body: { error: "Profile photos must be uploaded before they can be added to onboarding." } };
        }
        const currentPhotos = Array.isArray(current.photos) ? current.photos : [];
        const requestedUrls = [];
        for (const photo of update.photos) {
          if (!photo || typeof photo !== "object" || Array.isArray(photo) ||
              typeof photo.url !== "string" || !photo.url || photo.url.length > 256 ||
              requestedUrls.includes(photo.url)) {
            return { status: 400, body: { error: "Invalid onboarding photo entry." } };
          }
          requestedUrls.push(photo.url);
        }
        const ownedPhotos = requestedUrls.map((url, order) => {
          const existing = currentPhotos.find((photo) => photo && typeof photo.url === "string" && photo.url === url);
          if (!existing) return null;
          const item = { url, order };
          if (Number.isInteger(existing.size) && existing.size > 0) item.size = existing.size;
          return item;
        });
        if (ownedPhotos.some((photo) => photo === null)) {
          return { status: 400, body: { error: "Onboarding photos must belong to the current user's uploaded photos." } };
        }
        sanitizedUpdate.photos = ownedPhotos;
      }
      for (const key of allowedFields) {
        if (update[key] === undefined || key === "photos") continue;
        if (nestedAllowed[key]) {
          // The onboarding and profile forms represent education as a plain text
          // value. Preserve that established schema while continuing to accept
          // the structured { school, degree } shape used by older clients.
          if (key === "education" && typeof update[key] === "string") {
            const education = update[key].trim();
            if (education.length > 200) return { status: 400, body: { error: "Education must be 200 characters or fewer." } };
            sanitizedUpdate[key] = education;
            continue;
          }
          if (!update[key] || typeof update[key] !== "object" || Array.isArray(update[key])) return { status: 400, body: { error: "Invalid nested profile field format", field: key, receivedType: Array.isArray(update[key]) ? "array" : typeof update[key] } };
          const nestedValue = {};
          for (const prop of nestedAllowed[key]) if (update[key][prop] !== undefined) nestedValue[prop] = update[key][prop];
          if (Object.keys(nestedValue).length) sanitizedUpdate[key] = nestedValue;
        } else sanitizedUpdate[key] = update[key];
      }
      if (Object.hasOwn(sanitizedUpdate, "preference") && !["Male", "Female", "everyone"].includes(sanitizedUpdate.preference)) {
        return { status: 400, body: { error: "Choose Male, Female, or Everyone for discovery preferences." } };
      }
      if (sanitizedUpdate.mobileNumber) {
        const mobile = sanitizedUpdate.mobileNumber;
        if (typeof mobile !== "string" || !/^\+\d{1,3}\d{6,14}$/.test(mobile)) return { status: 400, body: { error: "Invalid mobile number format. Please use the format +[countrycode][number]." } };
        const digits = mobile.replace(/^\+\d{1,3}/, "");
        if (/^(\d)\1{8,}$/.test(digits)) return { status: 400, body: { error: "Invalid mobile number pattern." } };
      }
      if (sanitizedUpdate.birthday) {
        const birthDate = new Date(sanitizedUpdate.birthday);
        if (Number.isNaN(birthDate.getTime())) return { status: 400, body: { error: "Invalid birthday format." } };
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const month = today.getMonth() - birthDate.getMonth();
        if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) age--;
        if (age < 18) return { status: 400, body: { error: "You must be at least 18 years old to register." } };
        sanitizedUpdate.birthday = birthDate;
      }
      if (sanitizedUpdate.lifestyle && sanitizedUpdate.lifestyle.lookingFor === "Casual (FWB)" && !sanitizedUpdate.sexualOrientation) {
        return { status: 400, body: { error: 'Sexual orientation is required when looking for "Casual (FWB)".' } };
      }
      // Do not write an empty profile update. In particular, completed
      // profiles must ignore attempts to replace an already-recorded birthday
      // without touching updatedAt or creating a misleading database write.
      if (Object.keys(sanitizedUpdate).length > 0) {
        await users.updateOne({ uid }, { $set: { ...sanitizedUpdate, updatedAt: new Date() } });
      }
      return await this.getCurrentUserProfile(uid);
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async getCurrentUserProfile(uid) {
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }

    try {
      const client = await this.getClient();
      const db = this.getDatabase(client);
      const user = await db.collection("users").findOne(
        { uid },
        { projection: { password: 0, lastLoginIp: 0 } }
      );

      if (!user) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(user)) return { status: 403, body: { error: "This account is unavailable." } };

      const activeSubscription = await db.collection("subscriptions").findOne(
        { userId: user._id, status: "active" },
        { projection: { _id: 1 } }
      );

      if (user.birthday) {
        const birthday = new Date(user.birthday);
        if (!Number.isNaN(birthday.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birthday.getFullYear();
          const monthDiff = today.getMonth() - birthday.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) age--;
          user.age = age;
        }
      }
      if (user.isOnboardingComplete === undefined) user.isOnboardingComplete = true;
      user.isPremium = Boolean(activeSubscription);
      user.id = String(user._id);
      delete user.password;
      delete user.lastLoginIp;

      if (Array.isArray(user.photos)) {
        for (const photo of user.photos) {
          if (photo && typeof photo.url === "string" && photo.url) {
            photo.url = this.getMediaUrl(photo.url);
          }
        }
      }

      return { status: 200, body: user };
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async exportUserData(uid) {
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }

    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found" } };

      // Export only account-owned records and remove credentials, authentication
      // material, biometric evidence, operational IPs, and provider secrets.
      const sensitiveKey = /password|token|secret|credential|private.?key|lastloginip|ipaddress|biometric|selfie|face.?template|verification|internal.?note|admin.?note|encryption.?key|api.?key|rawcallback|signature/i;
      const serialize = value => {
        if (value === null || value === undefined) return value;
        if (value instanceof Date) return value.toISOString();
        if (typeof value?.toHexString === "function") return value.toHexString();
        if (Array.isArray(value)) return value.map(serialize);
        if (typeof value === "object") {
          const output = {};
          for (const [key, item] of Object.entries(value)) {
            if (key === "__v" || sensitiveKey.test(key)) continue;
            if (item !== undefined && typeof item !== "function") output[key] = serialize(item);
          }
          return output;
        }
        if (typeof value === "bigint") return value.toString();
        return value;
      };
      const readBounded = async (collectionName, query, sort = { createdAt: -1 }) => {
        const records = await db.collection(collectionName).find(query)
          .sort(sort).limit(1001).maxTimeMS(10000).toArray();
        return {
          records: records.slice(0, 1000).map(serialize),
          truncated: records.length > 1000
        };
      };

      const userId = user._id;
      const [matches, conversations, purchases, subscriptions, tickets] = await Promise.all([
        readBounded("matches", { $or: [{ user1Uid: uid }, { user2Uid: uid }] }),
        readBounded("chatmessages", { $or: [{ senderUid: uid }, { receiverUid: uid }] }, { timestamp: 1, _id: 1 }),
        readBounded("purchases", { userId }),
        readBounded("subscriptions", { userId }),
        readBounded("supporttickets", { userId })
      ]);

      const ticketIds = (await db.collection("supporttickets").find(
        { userId }, { projection: { _id: 1 } }
      ).limit(1000).maxTimeMS(10000).toArray()).map(ticket => ticket._id);
      const ticketMessages = ticketIds.length
        ? await readBounded("ticketmessages", { ticketId: { $in: ticketIds }, isInternalNote: { $ne: true } }, { createdAt: 1, _id: 1 })
        : { records: [], truncated: false };

      const profile = { ...user };
      delete profile.password;
      delete profile.lastLoginIp;
      const generatedAt = new Date().toISOString();
      return {
        status: 200,
        body: {
          exportVersion: 1,
          generatedAt,
          account: serialize(profile),
          data: {
            matches: matches.records,
            conversations: conversations.records,
            purchases: purchases.records,
            subscriptions: subscriptions.records,
            supportTickets: tickets.records,
            supportTicketMessages: ticketMessages.records
          },
          limits: {
            perCollectionMaximum: 1000,
            truncated: {
              matches: matches.truncated,
              conversations: conversations.truncated,
              purchases: purchases.truncated,
              subscriptions: subscriptions.truncated,
              supportTickets: tickets.truncated,
              supportTicketMessages: ticketMessages.truncated
            }
          },
          exclusions: [
            "Passwords, authentication tokens, provider credentials, and signing secrets",
            "Biometric and photo-verification evidence",
            "Operational IP addresses and internal security audit logs",
            "Internal support-ticket notes"
          ]
        }
      };
    } catch (error) {
      console.error("User data export failed", {
        message: error && typeof error.message === "string" ? error.message.slice(0, 160) : "Unknown error"
      });
      return { status: 503, body: { error: "User data export is temporarily unavailable." } };
    }
  }

  async requireAdmin(uid, allowSuperadminOnly = false) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { message: "Invalid user identity" } };
    try {
      const user = await this.getDatabase(await this.getClient()).collection("users").findOne(
        { uid }, { projection: { role: 1 } }
      );
      if (!user || !["admin", "superadmin"].includes(user.role) || (allowSuperadminOnly && user.role !== "superadmin")) {
        return { status: 403, body: { message: "Forbidden" } };
      }
      return { status: 200, role: user.role };
    } catch {
      return { status: 503, body: { message: "Administration service unavailable" } };
    }
  }

  async getAdminUsers(uid, params = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    const page = Number.isFinite(Number(params.page)) ? Math.max(1, Math.floor(Number(params.page))) : 1;
    const limit = Number.isFinite(Number(params.limit)) ? Math.min(100, Math.max(1, Math.floor(Number(params.limit)))) : 10;
    const query = {};
    if (typeof params.role === "string" && ["user", "contributor", "admin", "superadmin"].includes(params.role)) query.role = params.role;
    if (typeof params.search === "string" && params.search.trim()) {
      const escaped = params.search.trim().slice(0, 100).split("").map((ch) =>
        "\\.^$*+?()[]{}|".includes(ch) ? "\\" + ch : ch
      ).join("");
      query.$or = [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }];
    }
    const allowedSort = ["createdAt", "name", "email", "lastActiveAt", "role"];
    const sortField = allowedSort.includes(params.sortBy) ? params.sortBy : "createdAt";
    const sortDirection = params.sortOrder === "asc" ? 1 : -1;
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const [items, totalUsers] = await Promise.all([
        users.find(query, { projection: { password: 0, lastLoginIp: 0, relationshipPreferences: 0, location: 0, locationSharing: 0, coordinates: 0, latitude: 0, longitude: 0, lat: 0, lng: 0 } })
          .sort({ [sortField]: sortDirection, _id: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
        users.countDocuments(query)
      ]);
      const safeItems = items.map(item => {
        const safeUser = { ...item };
        if (access.role !== "superadmin") stripPrivateContactFields(safeUser);
        return safeUser;
      });
      return { status: 200, body: { users: safeItems, totalPages: Math.ceil(totalUsers / limit), currentPage: page, totalUsers } };
    } catch {
      return { status: 503, body: { message: "Unable to list users" } };
    }
  }

  async getAdminUser(uid, userId) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) return { status: 400, body: { message: "Invalid user ID" } };
    try {
      const { ObjectId } = await import("mongodb");
      const user = await this.getDatabase(await this.getClient()).collection("users").findOne(
        { _id: new ObjectId(userId) }, { projection: { password: 0, lastLoginIp: 0, relationshipPreferences: 0 } }
      );
      if (!user) return { status: 404, body: { message: "User not found" } };
      if (access.role !== "superadmin") {
        delete user.email;
        delete user.mobileNumber;
        delete user.phoneNumber;
        delete user.contactNumber;
      }
      return { status: 200, body: user };
    } catch {
      return { status: 503, body: { message: "Administration service unavailable" } };
    }
  }

  async createAdminUser(uid, payload = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (!payload || !isValidEmailAddress(payload.email)) {
      return { status: 400, body: { message: "A valid email address is required" } };
    }
    const role = typeof payload.role === "string" ? payload.role : "user";
    if (!["user", "contributor", "admin", "superadmin"].includes(role)) return { status: 400, body: { message: "Invalid role" } };
    if (access.role !== "superadmin" && ["admin", "superadmin"].includes(role)) return { status: 403, body: { message: "Only a superadmin can create administrator accounts" } };
    const email = payload.email.trim().toLowerCase();
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 160) : "";
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      if (await users.findOne({ $expr: { $eq: [{ $toLower: "$email" }, email] } }, { projection: { _id: 1 } })) {
        return { status: 409, body: { message: "User with this email already exists" } };
      }
      const now = new Date();
      const user = {
        email, name, role, isProfileVisible: payload.isProfileVisible !== false,
        mustSetPassword: true, isOnboardingComplete: false, interests: [], profilePrompts: [],
        blocked: [], photos: [], totalPhotoSize: 0, isVerified: false, plan: "basic",
        createdAt: now, updatedAt: now
      };
      const result = await users.insertOne(user);
      delete user.password;
      const safeUser = { ...user, _id: result.insertedId };
      if (access.role !== "superadmin") stripPrivateContactFields(safeUser);
      return { status: 201, body: safeUser };
    } catch {
      return { status: 503, body: { message: "Unable to create user" } };
    }
  }

  async updateAdminUser(uid, userId, payload = {}) {
    let lifecycleAuditId = null;
    let lifecycleAuditCollection = null;
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) return { status: 400, body: { message: "Invalid user ID" } };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { status: 400, body: { message: "A user update object is required" } };
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const targetId = new ObjectId(userId);
      const target = await users.findOne({ _id: targetId }, { projection: {
        uid: 1, role: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1,
        isProfileVisible: 1, profileVisibilityBeforeSuspension: 1
      } });
      if (!target) return { status: 404, body: { message: "User not found" } };
      if (target.role === "superadmin") return { status: 403, body: { message: "Superadmin accounts cannot be modified" } };
      if (access.role !== "superadmin" && target.role !== "user") {
        return { status: 403, body: { message: "Admins cannot modify other administrative accounts" } };
      }
      const lifecycleRequested = Object.prototype.hasOwnProperty.call(payload, "accountStatus") ||
        Object.prototype.hasOwnProperty.call(payload, "suspendedUntil");
      if (lifecycleRequested && access.role !== "superadmin" && target.role !== "user") {
        return { status: 403, body: { message: "Only superadmins can change account status for administrative accounts." } };
      }
      const allowed = [
        "name", "email", "gender", "bio", "interests", "profilePrompts", "education",
        "relationshipGoals", "isProfileVisible", "role", "lastActiveAt"
      ];
      const privilegedFields = ["email", "plan", "faceVerified", "isVerified", "mustSetPassword", "photos"];
      if (access.role !== "superadmin" && privilegedFields.some(key => Object.prototype.hasOwnProperty.call(payload, key))) {
        return { status: 403, body: { message: "Only a superadmin can modify subscription, verification, password-setup, or photo fields." } };
      }
      const update = {};
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(payload, key)) update[key] = payload[key];
      let revokeChatAccess = false;
      if (lifecycleRequested) {
        const nextStatus = payload.accountStatus;
        if (!["active", "temporarily_suspended", "permanently_banned"].includes(nextStatus)) {
          return { status: 400, body: { message: "Invalid account status" } };
        }
        if (nextStatus === "temporarily_suspended") {
          const until = new Date(payload.suspendedUntil);
          const maxUntil = Date.now() + 3650 * 86400000;
          if (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now() || until.getTime() > maxUntil) {
            return { status: 400, body: { message: "A future suspension expiry within 3650 days is required" } };
          }
          update.accountStatus = "temporarily_suspended";
          update.suspendedUntil = until;
          update.profileVisibilityBeforeSuspension = target.profileVisibilityBeforeSuspension !== undefined
            ? target.profileVisibilityBeforeSuspension : target.isProfileVisible !== false;
          update.isProfileVisible = false;
          revokeChatAccess = true;
        } else if (nextStatus === "permanently_banned") {
          update.accountStatus = "permanently_banned";
          update.suspendedUntil = new Date("9999-12-31T00:00:00.000Z");
          update.bannedAt = new Date();
          update.bannedBy = uid;
          update.isProfileVisible = false;
          revokeChatAccess = true;
        } else {
          if (target.accountStatus === "deletion_pending" || target.accountStatus === "deleted" || target.deletionRequestedAt) {
            return { status: 409, body: { message: "An account in the deletion process cannot be restored through user management." } };
          }
          if (target.accountStatus === "permanently_banned" && access.role !== "superadmin") {
            return { status: 403, body: { message: "Only a superadmin can restore a permanently banned account" } };
          }
          update.accountStatus = "active";
          update.isProfileVisible = target.profileVisibilityBeforeSuspension === true;
        }
      }
      if (Object.keys(update).length === 0) return { status: 400, body: { message: "No supported fields to update" } };
      if (update.role !== undefined) {
        if (!["user", "contributor", "admin", "superadmin"].includes(update.role)) return { status: 400, body: { message: "Invalid role" } };
        if (access.role !== "superadmin") {
          return { status: 403, body: { message: "Only superadmins can change account roles" } };
        }
      }
      if (update.plan !== undefined && !["basic", "premium", "weekly", "monthly", "yearly"].includes(update.plan)) return { status: 400, body: { message: "Invalid plan" } };
      if (update.email !== undefined) {
        if (!isValidEmailAddress(update.email)) return { status: 400, body: { message: "Invalid email address" } };
        update.email = update.email.trim().toLowerCase();
        const duplicate = await users.findOne({ email: update.email, _id: { $ne: targetId } }, { projection: { _id: 1 } });
        if (duplicate) return { status: 409, body: { message: "Email is already in use" } };
      }
      if (update.name !== undefined && (typeof update.name !== "string" || update.name.length > 160)) return { status: 400, body: { message: "Invalid name" } };
      if (update.bio !== undefined && (typeof update.bio !== "string" || update.bio.length > 5000)) return { status: 400, body: { message: "Invalid bio" } };
      if (update.isProfileVisible !== undefined && typeof update.isProfileVisible !== "boolean") return { status: 400, body: { message: "Invalid profile visibility" } };
      if (update.isProfileVisible === true && !(lifecycleRequested && payload.accountStatus === "active") && (
        target.accountStatus === "temporarily_suspended" ||
        target.accountStatus === "permanently_banned" ||
        (target.suspendedUntil && new Date(target.suspendedUntil) > new Date())
      )) {
        return { status: 403, body: { message: "Suspended or banned accounts cannot be made visible" } };
      }
      if (update.interests !== undefined && (!Array.isArray(update.interests) || update.interests.length > 100 || update.interests.some(x => typeof x !== "string" || x.length > 100))) return { status: 400, body: { message: "Invalid interests" } };
      update.updatedAt = new Date();
      const unset = lifecycleRequested && payload.accountStatus === "active"
        ? { suspendedUntil: "", bannedAt: "", bannedBy: "", moderationReason: "", profileVisibilityBeforeSuspension: "", suspendedBy: "" }
        : undefined;
      if (lifecycleRequested) {
        lifecycleAuditCollection = db.collection("auditlogs");
        const action = payload.accountStatus === "temporarily_suspended" ? "suspend_user" :
          payload.accountStatus === "permanently_banned" ? "ban_user" : "restore_user";
        const audit = await lifecycleAuditCollection.insertOne({
          eventType: "admin_account_lifecycle",
          actorUid: uid,
          targetUid: target.uid || null,
          targetUserId: targetId,
          action,
          previousAccountStatus: target.accountStatus || "active",
          nextAccountStatus: payload.accountStatus,
          previousProfileVisibility: target.isProfileVisible !== false,
          nextProfileVisibility: update.isProfileVisible,
          ...(update.suspendedUntil ? { suspendedUntil: update.suspendedUntil } : {}),
          outcome: "started",
          createdAt: new Date(),
          updatedAt: new Date()
        });
        lifecycleAuditId = audit.insertedId;
      }
      const updateDocument = { $set: update, ...(unset ? { $unset: unset } : {}) };
      const result = await users.findOneAndUpdate(
        { _id: targetId }, updateDocument, { returnDocument: "after", projection: { password: 0, lastLoginIp: 0 } }
      );
      if (!result) {
        if (lifecycleAuditId) await lifecycleAuditCollection.updateOne(
          { _id: lifecycleAuditId }, { $set: { outcome: "target_missing", updatedAt: new Date() } }
        );
        return { status: 404, body: { message: "User not found" } };
      }
      if (revokeChatAccess && typeof target.uid === "string" && target.uid) {
        await Promise.all([
          db.collection("chatTyping").deleteMany({ uid: target.uid }),
          db.collection("callSessions").updateMany(
            { $or: [{ callerUid: target.uid }, { receiverUid: target.uid }], status: { $in: ["ringing", "accepted"] } },
            { $set: { status: "cancelled", endedAt: new Date(), updatedAt: new Date(), endReason: "account_suspension" } }
          ),
          db.collection("videoRooms").updateMany(
            { hostUid: target.uid, status: "active" },
            { $set: { status: "ended", endedAt: new Date(), updatedAt: new Date(), endReason: "account_suspension" } }
          )
        ]);
        try {
          const revocation = await revokeFirebaseChatMemberships(this.env, target.uid, db);
          if (revocation.configured) {
            await users.updateOne({ _id: targetId }, { $set: {
              chatAccessRevocationStatus: "completed",
              chatAccessRevokedRoomCount: revocation.revoked,
              chatAccessRevokedAt: new Date(),
              updatedAt: new Date()
            } });
          }
        } catch {
          await users.updateOne({ _id: targetId }, { $set: {
            chatAccessRevocationStatus: "retry_pending",
            chatAccessRevocationLastAttemptAt: new Date(),
            updatedAt: new Date()
          } });
          if (lifecycleAuditId) await lifecycleAuditCollection.updateOne(
            { _id: lifecycleAuditId }, { $set: {
              outcome: "revocation_pending", chatAccessRevocationStatus: "retry_pending",
              updatedAt: new Date()
            } }
          );
          return { status: 202, body: {
            message: "Account is restricted, but realtime chat access revocation is pending.",
            accountStatus: payload.accountStatus,
            chatAccessRevocationStatus: "retry_pending"
          } };
        }
      }
      if (lifecycleAuditId) await lifecycleAuditCollection.updateOne(
        { _id: lifecycleAuditId }, { $set: {
          outcome: "completed",
          chatAccessRevocationStatus: revokeChatAccess ? "completed_or_not_configured" : "not_required",
          updatedAt: new Date()
        } }
      );
      const safeResult = { ...result };
      if (access.role !== "superadmin") stripPrivateContactFields(safeResult);
      return { status: 200, body: safeResult };
    } catch {
      if (lifecycleAuditId && lifecycleAuditCollection) {
        try {
          await lifecycleAuditCollection.updateOne(
            { _id: lifecycleAuditId, outcome: "started" },
            { $set: { outcome: "failed_or_interrupted", updatedAt: new Date() } }
          );
        } catch {}
      }
      return { status: 503, body: { message: "Unable to update user" } };
    }
  }

  async getAdminUserDeletionAssets(uid, userId) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      return { status: 400, body: { message: "Invalid user ID" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const targetId = new ObjectId(userId);
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne(
        { _id: targetId },
        { projection: { uid: 1, photos: 1, cdnAssetCleanupDeletedKeys: 1 } }
      );
      if (!user) return { status: 404, body: { message: "User not found" } };
      const uidValue = typeof user.uid === "string" ? user.uid : "";
      const photoKeys = [];
      let unresolvedAssetCount = 0;
      for (const photo of Array.isArray(user.photos) ? user.photos : []) {
        const photoUrl = typeof photo === "string" ? photo : photo?.url;
        if (typeof photoUrl !== "string") {
          unresolvedAssetCount++;
          continue;
        }
        let key = "";
        try {
          const parsed = new URL(photoUrl);
          key = decodeURIComponent(parsed.pathname.split("/").pop() || "");
        } catch {
          unresolvedAssetCount++;
          continue;
        }
        const validUid = /^[A-Za-z0-9_-]{1,128}$/.test(uidValue);
        const ownedPattern = validUid
          ? new RegExp("^photos-" + uidValue + "-(?:[0-9a-f-]{36}|[0-9]{10,16})\\.(?:jpg|jpeg|png|gif|webp)$", "i")
          : null;
        if (!ownedPattern || !ownedPattern.test(key)) unresolvedAssetCount++;
        else photoKeys.push(key);
      }

      const tickets = await db.collection("supporttickets").find(
        { userId: targetId }, { projection: { _id: 1 } }
      ).toArray();
      const ticketIds = tickets.map(ticket => ticket._id);
      const supportKeys = [];
      if (ticketIds.length) {
        const messages = await db.collection("ticketmessages").find(
          { ticketId: { $in: ticketIds }, senderId: targetId },
          { projection: { ticketId: 1, attachments: 1 } }
        ).toArray();
        for (const message of messages) {
          for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
            const key = attachment?.key;
            const ticketId = String(message.ticketId || "");
            const keyPattern = new RegExp("^support-" + ticketId +
              "-[0-9]{10,16}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\.(?:jpg|jpeg|png|gif|webp|pdf)$", "i");
            if (typeof key !== "string" || !keyPattern.test(key)) unresolvedAssetCount++;
            else supportKeys.push(key);
          }
        }
      }
      const uniquePhotoKeys = [...new Set(photoKeys)];
      const uniqueSupportKeys = [...new Set(supportKeys)];
      const expectedKeySet = new Set([...uniquePhotoKeys, ...uniqueSupportKeys]);
      const completedKeys = [...new Set((Array.isArray(user.cdnAssetCleanupDeletedKeys) ? user.cdnAssetCleanupDeletedKeys : []).filter(key => typeof key === "string" && expectedKeySet.has(key)))];
      await db.collection("users").updateOne(
        { _id: targetId, accountStatus: "deletion_pending" },
        { $set: {
          cdnAssetCleanupStatus: unresolvedAssetCount > 0 ? "manual_review_required" : "pending",
          cdnAssetCleanupLastAttemptAt: new Date(),
          updatedAt: new Date()
        } }
      );
      return {
        status: 200,
        body: {
          uid: uidValue,
          photoKeys: uniquePhotoKeys,
          supportKeys: uniqueSupportKeys,
          completedKeys,
          unresolvedAssetCount,
          total: uniquePhotoKeys.length + uniqueSupportKeys.length
        }
      };
    } catch {
      return { status: 503, body: { message: "Unable to inspect account storage assets" } };
    }
  }

  async finalizeAdminUserDeletionAssets(uid, userId, deletedKeys) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId) ||
        !Array.isArray(deletedKeys) || deletedKeys.length > 40 ||
        deletedKeys.some(key => typeof key !== "string" || key.length > 256)) {
      return { status: 400, body: { message: "Invalid storage cleanup confirmation" } };
    }
    try {
      const expected = await this.getAdminUserDeletionAssets(uid, userId);
      if (expected.status !== 200) return expected;
      if (expected.body.unresolvedAssetCount > 0) {
        return { status: 409, body: { message: "Some account assets require manual review" } };
      }
      const expectedKeys = [...expected.body.photoKeys, ...expected.body.supportKeys];
      const expectedSet = new Set(expectedKeys);
      const batchKeys = [...new Set(deletedKeys)];
      if (batchKeys.some(key => !expectedSet.has(key))) {
        return { status: 409, body: { message: "Storage cleanup confirmation contains an unknown asset" } };
      }

      const { ObjectId } = await import("mongodb");
      const targetId = new ObjectId(userId);
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const now = new Date();
      const progressUpdate = await users.updateOne(
        { _id: targetId, accountStatus: "deletion_pending" },
        {
          $addToSet: { cdnAssetCleanupDeletedKeys: { $each: batchKeys } },
          $set: { cdnAssetCleanupStatus: "in_progress", cdnAssetCleanupLastAttemptAt: now, updatedAt: now }
        }
      );
      if (!progressUpdate.matchedCount) {
        return { status: 409, body: { message: "Account is not pending deletion" } };
      }

      const progress = await users.findOne(
        { _id: targetId },
        { projection: { cdnAssetCleanupDeletedKeys: 1 } }
      );
      const persisted = new Set(
        (Array.isArray(progress?.cdnAssetCleanupDeletedKeys) ? progress.cdnAssetCleanupDeletedKeys : [])
          .filter(key => typeof key === "string" && expectedSet.has(key))
      );
      const allAssetsConfirmed = expectedKeys.every(key => persisted.has(key));
      if (!allAssetsConfirmed) {
        return {
          status: 202,
          body: {
            cdnAssetCleanupStatus: "in_progress",
            confirmedAssetCount: persisted.size,
            totalAssetCount: expectedKeys.length
          }
        };
      }

      const userUpdate = await users.updateOne(
        { _id: targetId, accountStatus: "deletion_pending" },
        { $set: {
          photos: [],
          totalPhotoSize: 0,
          cdnAssetCleanupStatus: "completed",
          cdnAssetCleanupCompletedAt: now,
          updatedAt: now
        } }
      );
      if (!userUpdate.matchedCount) {
        return { status: 409, body: { message: "Account is not pending deletion" } };
      }
      await db.collection("ticketmessages").updateMany(
        { senderId: targetId, attachments: { $exists: true } },
        { $unset: { attachments: "" }, $set: { updatedAt: now } }
      );
      return {
        status: 200,
        body: {
          cdnAssetCleanupStatus: "completed",
          deletedAssetCount: persisted.size,
          totalAssetCount: expectedKeys.length
        }
      };
    } catch {
      return { status: 503, body: { message: "Unable to finalize account storage cleanup" } };
    }
  }

  async finalizeAdminUserAnonymization(uid, userId) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      return { status: 400, body: { message: "Invalid user ID" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const targetId = new ObjectId(userId);
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const user = await users.findOne(
        { _id: targetId },
        { projection: {
          uid: 1, role: 1, accountStatus: 1, firebaseAuthDeletionStatus: 1,
          cdnAssetCleanupStatus: 1, anonymizationStatus: 1
        } }
      );
      if (!user) return { status: 404, body: { message: "User not found" } };
      if (user.role === "superadmin") {
        return { status: 403, body: { message: "Superadmin accounts cannot be anonymized" } };
      }
      if (user.accountStatus === "deleted" && user.anonymizationStatus === "completed") {
        if (typeof user.uid === "string" && user.uid) {
          await db.collection("pushSubscriptions").deleteMany({ uid: user.uid });
        }
        return { status: 200, body: { deletionStatus: "completed", anonymizationStatus: "completed" } };
      }
      if (user.accountStatus !== "deletion_pending" ||
          user.firebaseAuthDeletionStatus !== "completed" ||
          user.cdnAssetCleanupStatus !== "completed") {
        return {
          status: 409,
          body: {
            message: "Account anonymization prerequisites are incomplete",
            deletionStatus: user.accountStatus || "unknown",
            firebaseAuthDeletionStatus: user.firebaseAuthDeletionStatus || "unknown",
            cdnAssetCleanupStatus: user.cdnAssetCleanupStatus || "unknown"
          }
        };
      }

      // Biometric evidence and browser push credentials are personal data.
      // Purge both before completing account anonymization.
      if (typeof user.uid === "string" && user.uid) {
        await Promise.all([
          db.collection("photoVerifications").deleteMany({ uid: user.uid }),
          db.collection("pushSubscriptions").deleteMany({ uid: user.uid })
        ]);
      }
      const now = new Date();
      const result = await users.updateOne(
        {
          _id: targetId,
          role: { $ne: "superadmin" },
          accountStatus: "deletion_pending",
          firebaseAuthDeletionStatus: "completed",
          cdnAssetCleanupStatus: "completed"
        },
        {
          $set: {
            email: "deleted+" + userId.toLowerCase() + "@account.invalid",
            name: "Deleted user",
            role: "user",
            accountStatus: "deleted",
            anonymizationStatus: "completed",
            anonymizedAt: now,
            plan: "basic",
            isProfileVisible: false,
            isProfileVisibleByAdmin: false,
            isVerified: false,
            isOnboardingComplete: false,
            photos: [],
            totalPhotoSize: 0,
            updatedAt: now
          },
          $unset: {
            password: "",
            mobileNumber: "",
            phoneNumber: "",
            contactNumber: "",
            birthday: "",
            gender: "",
            sexualOrientation: "",
            bio: "",
            interests: "",
            profilePrompts: "",
            personalityType: "",
            personalityQuizResults: "",
            education: "",
            relationshipGoals: "",
            location: "",
            lastActiveAt: "",
            socialMediaLinks: "",
            familyStatus: "",
            siblings: "",
            religion: "",
            politicalLeaning: "",
            lookingFor: "",
            pets: "",
            lifestyle: "",
            badges: "",
            videoProfile: "",
            faceVerified: "",
            faceVerification: "",
            mustSetPassword: "",
            lastLoginIp: "",
            lastLoginDevice: "",
            blocked: "",
            blockedBy: "",
            darkFantasyAccessUntil: "",
            creatorGalleryAccessUntil: "",
            darkFantasyUnlimitedUntil: "",
            darkFantasyGalleryAccess: "",
            cdnAssetCleanupDeletedKeys: ""
          }
        }
      );
      if (!result.matchedCount) {
        return { status: 409, body: { message: "Account deletion prerequisites changed; retry required" } };
      }
      return {
        status: 200,
        body: {
          deletionStatus: "completed",
          anonymizationStatus: "completed",
          retainedHistoricalRecords: true
        }
      };
    } catch {
      return { status: 503, body: { message: "Unable to finalize account anonymization" } };
    }
  }

  async deleteAdminUser(uid, userId) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) return { status: 400, body: { message: "Invalid user ID" } };
    try {
      const { ObjectId } = await import("mongodb");
      const client = await this.getClient();
      const db = this.getDatabase(client);
      const targetId = new ObjectId(userId);
      const now = new Date();
      let targetUid = null;
      let firebaseAuthAlreadyDeleted = false;
      let alreadyAnonymized = false;
      const session = client.startSession();
      try {
        let targetFound = false;
        await session.withTransaction(async () => {
          const users = db.collection("users");
          const target = await users.findOne({ _id: targetId }, { projection: { uid: 1, role: 1, accountStatus: 1, deletionRequestedAt: 1, firebaseAuthDeletionStatus: 1, cdnAssetCleanupStatus: 1, anonymizationStatus: 1 }, session });
          if (!target) return;
          if (target.role === "superadmin") throw new Error("SUPERADMIN_DELETE_FORBIDDEN");
          // Repeated DELETE requests deliberately replay idempotent database cleanup.
          // Preserve the original request metadata while allowing a later retry to
          // repair partial cleanup after a transient failure.
          targetFound = true;
          targetUid = typeof target.uid === "string" ? target.uid : null;
          if (target.accountStatus === "deleted" && target.anonymizationStatus === "completed") {
            alreadyAnonymized = true;
            firebaseAuthAlreadyDeleted = true;
            return;
          }
          firebaseAuthAlreadyDeleted = target.firebaseAuthDeletionStatus === "completed";
          await users.updateOne(
            { _id: targetId, role: { $ne: "superadmin" } },
            { $set: {
              accountStatus: "deletion_pending",
              plan: "basic",
              deletionRequestedAt: target.deletionRequestedAt || now,
              deletionRequestedBy: target.deletionRequestedBy || uid,
              isProfileVisible: false,
              isProfileVisibleByAdmin: false,
              updatedAt: now
            }, $unset: {
              darkFantasyAccessUntil: "",
              creatorGalleryAccessUntil: "",
              darkFantasyUnlimitedUntil: "",
              darkFantasyGalleryAccess: ""
            } },
            { session }
          );
          if (typeof target.uid === "string" && target.uid) {
            await db.collection("subscriptions").updateMany(
              { userId: targetId, status: "active" },
              { $set: { status: "revoked", revokedAt: now, revocationReason: "account_deletion" } },
              { session }
            );
            await db.collection("darkfantasyprofiles").deleteOne({ uid: target.uid }, { session });
            await db.collection("secretcommunitymemberships").deleteMany({ uid: target.uid }, { session });
            await db.collection("chatTyping").deleteMany({ uid: target.uid }, { session });
            await db.collection("pushSubscriptions").deleteMany({ uid: target.uid }, { session });
            await db.collection("videoRooms").updateMany(
              { hostUid: target.uid, status: "active" },
              { $set: { status: "ended", endedAt: now, updatedAt: now, endReason: "account_deletion" } },
              { session }
            );
            await db.collection("callSessions").updateMany(
              { $or: [{ callerUid: target.uid }, { receiverUid: target.uid }], status: { $in: ["ringing", "accepted"] } },
              { $set: { status: "cancelled", endedAt: now, updatedAt: now, endReason: "account_deletion" } },
              { session }
            );
          }
        });
        if (!targetFound) return { status: 404, body: { message: "User not found" } };
        if (alreadyAnonymized) {
          if (targetUid) await db.collection("pushSubscriptions").deleteMany({ uid: targetUid });
          return { status: 200, body: {
            message: "Account deletion and anonymization are already complete.",
            deletionStatus: "completed", firebaseAuthDeletionStatus: "completed",
            cdnAssetCleanupStatus: "completed", anonymizationStatus: "completed",
            financialAndAuditRecordsRetained: true
          } };
        }
        // RTDB membership must be revoked before deleting the Firebase identity.
        // Repeated admin DELETE requests retry this idempotent cleanup if Firebase
        // is temporarily unavailable, while the MongoDB account remains restricted.
        const realtimeConfigured = Boolean(
          this.env.FIREBASE_SERVICE_ACCOUNT_JSON && this.env.FIREBASE_DATABASE_URL
        );
        if (targetUid && (realtimeConfigured || this.env.ENABLE_FIREBASE_REALTIME_SYNC === "true")) {
          let chatRevocation;
          try {
            chatRevocation = await revokeFirebaseChatMemberships(this.env, targetUid, db);
          } catch {
            await db.collection("users").updateOne(
              { _id: targetId, accountStatus: "deletion_pending" },
              { $set: {
                chatAccessRevocationStatus: "retry_pending",
                chatAccessRevocationLastAttemptAt: new Date(),
                updatedAt: new Date()
              } }
            );
            return {
              status: 202,
              body: {
                message: "Account access is disabled. Realtime chat access revocation is pending and will be retried.",
                deletionStatus: "deletion_pending",
                chatAccessRevocationStatus: "retry_pending",
                financialAndAuditRecordsRetained: true
              }
            };
          }
          await db.collection("users").updateOne(
            { _id: targetId, accountStatus: "deletion_pending" },
            { $set: {
              chatAccessRevocationStatus: "completed",
              chatAccessRevokedRoomCount: chatRevocation.revoked,
              chatAccessRevokedAt: new Date(),
              updatedAt: new Date()
            } }
          );
        }

        if (!targetUid) {
          await db.collection("users").updateOne(
            { _id: targetId },
            { $set: { firebaseAuthDeletionStatus: "manual_review_required", updatedAt: new Date() } }
          );
          return {
            status: 202,
            body: {
              message: "Account access is disabled. Firebase identity cleanup requires manual review.",
              deletionStatus: "deletion_pending",
              firebaseAuthDeletionStatus: "manual_review_required",
              financialAndAuditRecordsRetained: true
            }
          };
        }

        const firebaseDeletion = firebaseAuthAlreadyDeleted
          ? { completed: true, configured: true }
          : await deleteFirebaseAuthIdentity(this.env, targetUid);
        if (!firebaseAuthAlreadyDeleted) {
          const firebaseStatusUpdate = {
            firebaseAuthDeletionStatus: firebaseDeletion.completed ? "completed" :
              (firebaseDeletion.configured ? "retry_pending" : "awaiting_credentials"),
            firebaseAuthDeletionLastAttemptAt: new Date(),
            updatedAt: new Date()
          };
          if (firebaseDeletion.completed) firebaseStatusUpdate.firebaseAuthDeletedAt = new Date();
          await db.collection("users").updateOne({ _id: targetId }, { $set: firebaseStatusUpdate });
        }
        if (!firebaseDeletion.completed) {
          return {
            status: 202,
            body: {
              message: "Account access is disabled. External identity cleanup remains pending.",
              deletionStatus: "deletion_pending",
              firebaseAuthDeletionStatus: firebaseDeletion.configured ? "retry_pending" : "awaiting_credentials",
              financialAndAuditRecordsRetained: true
            }
          };
        }
        return {
          status: 200,
          body: {
            message: "Account access disabled and Firebase identity revoked. Final account anonymization remains pending.",
            deletionStatus: "deletion_pending",
            firebaseAuthDeletionStatus: "completed",
            financialAndAuditRecordsRetained: true
          }
        };
      } finally {
        await session.endSession();
      }
    } catch (error) {
      if (error?.message === "SUPERADMIN_DELETE_FORBIDDEN") {
        return { status: 403, body: { message: "Superadmin accounts cannot be deleted" } };
      }
      return { status: 503, body: { message: "Unable to queue account deletion" } };
    }
  }

  async updateAdminUserPlan(uid, userId, payload = {}) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) return { status: 400, body: { message: "Invalid user ID" } };
    const plan = payload && payload.plan;
    if (!["basic", "premium", "weekly", "monthly", "yearly"].includes(plan)) return { status: 400, body: { message: "Invalid plan" } };
    try {
      const { ObjectId } = await import("mongodb");
      const result = await this.getDatabase(await this.getClient()).collection("users").findOneAndUpdate(
        { _id: new ObjectId(userId), role: { $ne: "superadmin" } },
        { $set: { plan, updatedAt: new Date() } },
        { returnDocument: "after", projection: { password: 0, lastLoginIp: 0 } }
      );
      if (!result) return { status: 404, body: { message: "User not found or cannot be modified" } };
      return { status: 200, body: result };
    } catch {
      return { status: 503, body: { message: "Unable to update user plan" } };
    }
  }

  async getAdminDashboardStats(uid) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    try {
      const db = this.getDatabase(await this.getClient());
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [totalUsers, newUsers, activeUsers, pendingReports] = await Promise.all([
        db.collection("users").countDocuments({}),
        db.collection("users").countDocuments({ createdAt: { $gte: since } }),
        db.collection("users").countDocuments({ lastActiveAt: { $gte: since } }),
        db.collection("reports").countDocuments({ status: "pending_review" })
      ]);
      return { status: 200, body: { totalUsers, newUsers, activeUsers, pendingReports } };
    } catch {
      return { status: 503, body: { message: "Unable to load dashboard statistics" } };
    }
  }

  async getAdminPurchases(uid, status = "all") {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (status !== "all" && !["pending", "completed", "active", "cancelled", "expired", "rejected", "refund_required", "refunded"].includes(status)) return { status: 400, body: { message: "Invalid purchase status" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const match = status === "all" ? {} : { status };
      const lookupUser = [
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $project: { "user.password": 0, "user.lastLoginIp": 0 } }
      ];
      const [purchases, subscriptions] = await Promise.all([
        db.collection("purchases").aggregate([
          { $match: match }, { $sort: { createdAt: -1 } }, { $limit: 500 },
          ...lookupUser
        ]).toArray(),
        db.collection("subscriptions").aggregate([
          { $match: match }, { $sort: { paidLateAt: -1, createdAt: -1 } }, { $limit: 500 },
          ...lookupUser
        ]).toArray()
      ]);
      // Show the complete gateway transaction history, including subscriptions.
      // Late successful callbacks can place a cancelled subscription into the
      // refund queue, so subscription records must be visible for every filter.
      const records = [
        ...purchases.map(record => ({ ...record, transactionType: "store_purchase" })),
        ...subscriptions.map(record => ({ ...record, transactionType: "subscription" }))
      ].sort((a, b) => new Date(b.paidLateAt || b.createdAt || 0) - new Date(a.paidLateAt || a.createdAt || 0)).slice(0, 500);
      return { status: 200, body: records.map(p => {
        const safeUser = p.user ? { ...p.user } : null;
        if (safeUser && access.role !== "superadmin") stripPrivateContactFields(safeUser);
        return { ...p, userId: safeUser };
      }) };
    } catch {
      return { status: 503, body: { message: "Unable to load purchases" } };
    }
  }

  async recordAdminRefund(uid, transactionId, transactionType, refundReference, note = "") {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof transactionId !== "string" || !/^[a-fA-F0-9]{24}$/.test(transactionId)) return { status: 400, body: { message: "Invalid transaction ID" } };
    if (!["store_purchase", "subscription"].includes(transactionType)) return { status: 400, body: { message: "Invalid transaction type" } };
    if (typeof refundReference !== "string" || refundReference.trim().length < 3 || refundReference.trim().length > 160) return { status: 400, body: { message: "A valid merchant refund reference is required" } };
    if (typeof note !== "string" || note.length > 1000) return { status: 400, body: { message: "Refund note must be 1000 characters or fewer" } };
    let outcome = { status: 503, body: { message: "Refund record unavailable; no completion was confirmed" } };
    let session;
    try {
      const client = await this.getClient();
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(client);
      const collection = db.collection(transactionType === "subscription" ? "subscriptions" : "purchases");
      session = client.startSession();
      await session.withTransaction(async () => {
        const transaction = await collection.findOne({ _id: new ObjectId(transactionId), status: "refund_required" }, { session });
        if (!transaction) { outcome = { status: 409, body: { message: "Refund review record not found or already processed" } }; throw new Error("ABORT_REFUND_RECORD"); }
        const now = new Date();
        const refundRef = refundReference.trim();
        await db.collection("auditlogs").insertOne({
          eventType: "payment_refund_recorded", actorUid: uid, targetUid: transaction.userId,
          transactionId: transaction._id, transactionType, paymentReference: transaction.paymentReference || null,
          refundReference: refundRef, note: note.trim(), outcome: "completed", createdAt: now
        }, { session });
        const changed = await collection.updateOne({ _id: transaction._id, status: "refund_required" }, { $set: {
          status: "refunded", refundReference: refundRef, refundNote: note.trim(),
          refundProcessedAt: now, refundProcessedBy: uid, updatedAt: now
        } }, { session });
        if (!changed.modifiedCount) { outcome = { status: 409, body: { message: "Refund record changed before it could be updated" } }; throw new Error("ABORT_REFUND_RECORD"); }
        outcome = { status: 200, body: { message: "Refund completion recorded", refundReference: refundRef } };
      });
      return outcome;
    } catch (error) {
      if (outcome.status === 409) return outcome;
      return { status: 503, body: { message: "Refund record unavailable; no completion was confirmed" } };
    } finally { if (session) await session.endSession().catch(() => {}); }
  }
  async getAdminPaymentReconciliation(uid) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    try {
      const db = this.getDatabase(await this.getClient());
      const [purchases, subscriptions] = await Promise.all([
        db.collection("purchases").find(
          {}, { projection: { userId: 0 } }
        ).sort({ createdAt: -1 }).limit(1000).maxTimeMS(10000).toArray(),
        db.collection("subscriptions").find(
          {}, { projection: { userId: 0 } }
        ).sort({ createdAt: -1 }).limit(1000).maxTimeMS(10000).toArray()
      ]);
      const now = new Date();
      const records = [
        ...purchases.map(record => ({ ...record, transactionType: "store_purchase" })),
        ...subscriptions.map(record => ({ ...record, transactionType: "subscription" }))
      ];
      const anomalies = [];
      const references = new Map();
      const addDuplicate = (map, value, record) => {
        if (typeof value !== "string" || !value.trim()) return;
        const key = value.trim();
        const prior = map.get(key) || [];
        prior.push({
          transactionId: String(record._id),
          transactionType: record.transactionType,
          status: record.status,
          createdAt: record.createdAt || null
        });
        map.set(key, prior);
      };
      for (const record of records) {
        const base = {
          transactionId: String(record._id),
          transactionType: record.transactionType,
          status: record.status || "unknown",
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
          paymentReference: record.paymentReference || null,
          gatewayId: record.paymentGatewayId || null,
          amount: record.itemPrice ?? record.amount ?? null,
          currency: record.currency || "LKR"
        };
        if (record.status === "pending" && record.createdAt &&
            new Date(record.createdAt).getTime() < now.getTime() - 30 * 60 * 1000) {
          anomalies.push({ ...base, reason: "stale_pending", recommendedAction: "Check provider transaction before cancelling or retrying." });
        }
        const hasPaymentReference = typeof record.paymentReference === "string" && Boolean(record.paymentReference.trim());
        const hasPaymentMethod = typeof record.paymentGatewayId === "string" && Boolean(record.paymentGatewayId.trim());
        // Older Stripe/PayHere records may legitimately predate WebXPay metadata.
        // The WebXPay gateway ID identifies the payment method, not a unique transaction.
        if (["completed", "active"].includes(record.status) && hasPaymentReference !== hasPaymentMethod) {
          anomalies.push({ ...base, reason: "partial_gateway_metadata", recommendedAction: "Compare the provider order reference and payment method metadata with the merchant statement." });
        }
        if (record.status === "refund_required") {
          anomalies.push({ ...base, reason: "refund_review_required", recommendedAction: "Verify the captured payment and process the refund through the merchant portal." });
        }
        addDuplicate(references, record.paymentReference, record);
      }
      for (const [value, matches] of references) {
        if (matches.length > 1) anomalies.push({
          reason: "duplicate_payment_reference",
          duplicateValue: value,
          transactions: matches,
          recommendedAction: "Verify whether the provider reference was reused or incorrectly attached."
        });
      }
      return {
        status: 200,
        body: {
          generatedAt: now.toISOString(),
          source: "local_mongodb_records_only",
          providerStatusQueried: false,
          scanned: { purchases: purchases.length, subscriptions: subscriptions.length, maximumPerCollection: 1000 },
          counts: {
            totalScanned: records.length,
            pending: records.filter(record => record.status === "pending").length,
            completed: records.filter(record => record.status === "completed" || record.status === "active").length,
            refundRequired: records.filter(record => record.status === "refund_required").length,
            anomalies: anomalies.length
          },
          anomalies
        }
      };
    } catch {
      return { status: 503, body: { message: "Payment reconciliation report unavailable." } };
    }
  }

  async getAdminTransactions(uid) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    try {
      const db = this.getDatabase(await this.getClient());
      const [purchases, subscriptions] = await Promise.all([
        db.collection("purchases").aggregate([
          { $sort: { createdAt: -1 } },
          { $limit: 500 },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          { $project: { "user.password": 0, "user.lastLoginIp": 0 } }
        ]).toArray(),
        db.collection("subscriptions").aggregate([
          { $sort: { createdAt: -1 } },
          { $limit: 500 },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          { $project: { "user.password": 0, "user.lastLoginIp": 0 } }
        ]).toArray()
      ]);
      const result = [
        ...purchases.map(p => ({ ...p, type: "Store Item", itemName: p.itemName, price: p.itemPrice })),
        ...subscriptions.map(s => ({ ...s, type: "Subscription", itemName: String(s.plan || "") + " Plan", price: s.amount != null ? `${s.amount} ${s.currency || "LKR"}` : (({ weekly: "800 LKR", monthly: "3000 LKR", yearly: "10000 LKR" })[s.plan] || "N/A") }))
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 500);
      const safeResult = result.map(entry => {
        const safeEntry = { ...entry };
        if (safeEntry.user && access.role !== "superadmin") {
          safeEntry.user = { ...safeEntry.user };
          stripPrivateContactFields(safeEntry.user);
        }
        return safeEntry;
      });
      return { status: 200, body: safeResult };
    } catch {
      return { status: 503, body: { message: "Unable to load transactions" } };
    }
  }

  async getAdminAnalyticsSummary(uid, params = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    let startDate;
    let endDate;
    if (params.startDate || params.endDate) {
      startDate = new Date(params.startDate);
      endDate = new Date(params.endDate);
      if (!params.startDate || !params.endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
        return { status: 400, body: { message: "Valid startDate and endDate are required together" } };
      }
    } else {
      endDate = new Date();
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };
      const [totalUsers, paidUserIds, signups, reportedUsers] = await Promise.all([
        db.collection("users").countDocuments({}),
        db.collection("subscriptions").distinct("userId", { status: "active" }),
        db.collection("users").aggregate([
          { $match: dateFilter },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]).toArray(),
        db.collection("reports").distinct("reportedUserUid")
      ]);
      const paidUsers = Array.isArray(paidUserIds) ? paidUserIds.length : 0;
      return { status: 200, body: {
        userStats: { total: totalUsers, paid: paidUsers, unpaid: Math.max(0, totalUsers - paidUsers) },
        signupsPerDay: signups,
        locations: [],
        reportedUsersCount: reportedUsers.length
      } };
    } catch {
      return { status: 503, body: { message: "Unable to load analytics summary" } };
    }
  }

  async getAdminSupportTickets(uid, params = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    const page = Number.isFinite(Number(params.page)) ? Math.max(1, Math.floor(Number(params.page))) : 1;
    const limit = Number.isFinite(Number(params.limit)) ? Math.min(100, Math.max(1, Math.floor(Number(params.limit)))) : 10;
    const allowedStatuses = ["Open", "In Progress", "Waiting for Customer", "Closed"];
    const query = {};
    if (typeof params.status === "string" && params.status) {
      if (!allowedStatuses.includes(params.status)) return { status: 400, body: { message: "Invalid ticket status" } };
      query.status = params.status;
    }
    const allowedPriorities = ["Urgent", "High", "Normal", "Low"];
    const allowedCategories = ["Account", "Payments", "Profile", "Verification", "Safety", "Technical", "Other"];
    if (typeof params.priority === "string" && params.priority) {
      if (!allowedPriorities.includes(params.priority)) return { status: 400, body: { message: "Invalid ticket priority" } };
      query.priority = params.priority;
    }
    if (typeof params.category === "string" && params.category) {
      if (!allowedCategories.includes(params.category)) return { status: 400, body: { message: "Invalid ticket category" } };
      query.category = params.category;
    }
    if (typeof params.assignment === "string" && params.assignment) {
      if (!["assigned", "unassigned"].includes(params.assignment)) {
        return { status: 400, body: { message: "Invalid assignment filter" } };
      }
      if (params.assignment === "assigned") {
        query.assignedToUid = { $exists: true, $nin: ["", null] };
      } else {
        query.$and = [...(query.$and || []), { $or: [
          { assignedToUid: { $exists: false } },
          { assignedToUid: null },
          { assignedToUid: "" }
        ] }];
      }
    }
    if (typeof params.sla === "string" && params.sla) {
      if (!["overdue", "due-soon"].includes(params.sla)) return { status: 400, body: { message: "Invalid SLA filter" } };
      const now = new Date();
      const slaClause = params.sla === "overdue"
        ? { slaDueAt: { $lt: now } }
        : { slaDueAt: { $gte: now, $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } };
      query.$and = [...(query.$and || []), slaClause, { status: { $ne: "Closed" } }];
    }
    const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
    try {
      const db = this.getDatabase(await this.getClient());
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = { $regex: escaped, $options: "i" };
        const matchingUsers = await db.collection("users").find(
          { $or: [{ name: regex }, ...(access.role === "superadmin" ? [{ email: regex }] : [])] },
          { projection: { _id: 1 } }
        ).limit(200).toArray();
        const searchClauses = [{ subject: regex }, { ticketNumber: regex }];
        if (matchingUsers.length) searchClauses.push({ userId: { $in: matchingUsers.map(user => user._id) } });
        query.$or = searchClauses;
      }
      const ticketsCollection = db.collection("supporttickets");
      const [tickets, total] = await Promise.all([
        ticketsCollection.find(query).sort({ updatedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        ticketsCollection.countDocuments(query)
      ]);
      const userIds = tickets.map(ticket => ticket.userId).filter(Boolean);
      const { ObjectId } = await import("mongodb");
      const normalizedIds = userIds.map(value => typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value) ? new ObjectId(value) : value);
      const userProjection = access.role === "superadmin" ? { name: 1, email: 1 } : { name: 1 };
      const users = normalizedIds.length ? await db.collection("users").find(
        { _id: { $in: normalizedIds } }, { projection: userProjection }
      ).toArray() : [];
      const userMap = new Map(users.map(user => [String(user._id), user]));
      const assignedUids = [...new Set(tickets.map(ticket => ticket.assignedToUid).filter(value => typeof value === "string" && value))];
      const assignedStaff = assignedUids.length ? await db.collection("users").find(
        { uid: { $in: assignedUids }, role: { $in: ["admin", "superadmin"] } },
        { projection: { uid: 1, name: 1 } }
      ).toArray() : [];
      const staffNameMap = new Map(assignedStaff.map(person => [person.uid, person.name || "Administrator"]));
      return { status: 200, body: {
        tickets: tickets.map(ticket => ({
          ...ticket,
          userId: userMap.get(String(ticket.userId)) || null,
          assignedToName: ticket.assignedToUid ? (staffNameMap.get(ticket.assignedToUid) || "Administrator") : null
        })),
        total, totalPages: Math.ceil(total / limit), currentPage: page, limit
      } };
    } catch {
      return { status: 503, body: { message: "Unable to load support tickets" } };
    }
  }

  async getAdminSupportTicket(uid, ticketId) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId)) return { status: 400, body: { message: "Invalid ticket ID" } };
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const ticket = await db.collection("supporttickets").findOne({ _id: new ObjectId(ticketId) });
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      const userProjection = access.role === "superadmin" ? { name: 1, email: 1 } : { name: 1 };
      const [user, messages, staff, history] = await Promise.all([
        db.collection("users").findOne({ _id: ticket.userId }, { projection: userProjection }),
        db.collection("ticketmessages").find({ ticketId: new ObjectId(ticketId) }).sort({ createdAt: 1 }).toArray(),
        db.collection("users").find({ role: { $in: ["admin", "superadmin"] } }, { projection: { uid: 1, name: 1, role: 1 } }).limit(100).toArray(),
        db.collection("auditlogs").find({
          ticketId: new ObjectId(ticketId),
          eventType: { $in: ["support_ticket_updated", "support_ticket_message_edited", "support_ticket_message_deleted"] }
        }).sort({ createdAt: -1 }).limit(150).toArray()
      ]);
      const senderIds = messages.map(message => message.senderId).filter(Boolean);
      const senders = senderIds.length ? await db.collection("users").find(
        { _id: { $in: senderIds } }, { projection: { name: 1 } }
      ).toArray() : [];
      const senderMap = new Map(senders.map(sender => [String(sender._id), sender]));
      return { status: 200, body: {
        ticket: { ...ticket, userId: user || null },
        staff: staff.filter(item => typeof item.uid === "string").map(({ uid, name, role }) => ({ uid, name: name || "Administrator", role })),
        history,
        messages: messages.map(message => ({ ...message, senderId: senderMap.get(String(message.senderId)) || null }))
      } };
    } catch {
      return { status: 503, body: { message: "Unable to load support ticket" } };
    }
  }

  async addAdminSupportMessage(uid, ticketId, payload = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId)) return { status: 400, body: { message: "Invalid ticket ID" } };
    if (!payload || typeof payload.message !== "string" || !payload.message.trim() || payload.message.length > 4000) {
      return { status: 400, body: { message: "A message between 1 and 4000 characters is required" } };
    }
    if (payload.isInternalNote !== undefined && typeof payload.isInternalNote !== "boolean") {
      return { status: 400, body: { message: "Invalid internal note setting" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const adminUser = await db.collection("users").findOne({ uid }, { projection: { _id: 1 } });
      if (!adminUser) return { status: 403, body: { message: "Forbidden" } };
      const ticketObjectId = new ObjectId(ticketId);
      const ticket = await db.collection("supporttickets").findOne({ _id: ticketObjectId });
      if (!ticket) return { status: 404, body: { message: "Ticket not found" } };
      const now = new Date();
      const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 5).filter(item =>
        item && typeof item.key === "string" && item.key.startsWith("support-" + ticketId + "-") &&
        typeof item.url === "string" && typeof item.name === "string" &&
        ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(item.type) &&
        Number.isFinite(Number(item.size)) && Number(item.size) > 0 && Number(item.size) <= 10 * 1024 * 1024
      ).map(item => ({ key: item.key, url: item.url, name: item.name.slice(0, 180), type: item.type, size: Number(item.size) })) : [];
      const isInternalNote = payload.isInternalNote === true;
      const message = {
        ticketId: ticketObjectId, senderId: adminUser._id, message: payload.message.trim(),
        ...(attachments.length ? { attachments } : {}),
        ...(isInternalNote ? { isInternalNote: true } : {}),
        isFromAdmin: true, createdAt: now, updatedAt: now
      };
      const inserted = await db.collection("ticketmessages").insertOne(message);
      const update = { updatedAt: now };
      if (!isInternalNote) update.status = "Waiting for Customer";
      await db.collection("supporttickets").updateOne({ _id: ticketObjectId }, { $set: update });
      return { status: 201, body: { ...message, _id: inserted.insertedId } };
    } catch {
      return { status: 503, body: { message: "Unable to add support message" } };
    }
  }

  async updateAdminSupportStatus(uid, ticketId, payload = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof ticketId !== "string" || !/^[a-fA-F0-9]{24}$/.test(ticketId)) return { status: 400, body: { message: "Invalid ticket ID" } };
    const allowedStatuses = ["Open", "In Progress", "Waiting for Customer", "Closed"];
    const allowedPriorities = ["Urgent", "High", "Normal", "Low"];
    const allowedCategories = ["Account", "Payments", "Profile", "Verification", "Safety", "Technical", "Other"];
    const slaHours = { Urgent: 1, High: 4, Normal: 24, Low: 72 };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { status: 400, body: { message: "Invalid ticket update" } };
    const changes = {};
    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!allowedStatuses.includes(payload.status)) return { status: 400, body: { message: "Invalid ticket status" } };
      changes.status = payload.status;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
      if (!allowedPriorities.includes(payload.priority)) return { status: 400, body: { message: "Invalid ticket priority" } };
      changes.priority = payload.priority;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "category")) {
      if (!allowedCategories.includes(payload.category)) return { status: 400, body: { message: "Invalid ticket category" } };
      changes.category = payload.category;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "assignedToUid")) {
      if (payload.assignedToUid !== null && (typeof payload.assignedToUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.assignedToUid))) {
        return { status: 400, body: { message: "Invalid staff assignment" } };
      }
      changes.assignedToUid = payload.assignedToUid;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "resolutionSummary")) {
      if (typeof payload.resolutionSummary !== "string" || payload.resolutionSummary.trim().length > 2000) {
        return { status: 400, body: { message: "Resolution summary must be between 1 and 2000 characters" } };
      }
      changes.resolutionSummary = payload.resolutionSummary.trim();
    }
    if (!Object.keys(changes).length) return { status: 400, body: { message: "At least one ticket field must be updated" } };
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const tickets = db.collection("supporttickets");
      const ticketObjectId = new ObjectId(ticketId);
      const current = await tickets.findOne({ _id: ticketObjectId });
      if (!current) return { status: 404, body: { message: "Ticket not found" } };
      if (Object.prototype.hasOwnProperty.call(changes, "assignedToUid") && changes.assignedToUid !== null) {
        const assignee = await db.collection("users").findOne(
          { uid: changes.assignedToUid, role: { $in: ["admin", "superadmin"] } }, { projection: { _id: 1 } }
        );
        if (!assignee) return { status: 400, body: { message: "Selected assignee is not an active administrator" } };
      }
      const now = new Date();
      const nextPriority = changes.priority || current.priority || "Normal";
      const isClosing = changes.status === "Closed";
      const isReopening = current.status === "Closed" && changes.status && changes.status !== "Closed";
      if (Object.prototype.hasOwnProperty.call(changes, "resolutionSummary") && !isClosing && current.status !== "Closed") {
        return { status: 400, body: { message: "A resolution summary can only be set when closing a ticket" } };
      }
      if (isClosing) {
        const summary = changes.resolutionSummary ?? current.resolutionSummary;
        if (typeof summary !== "string" || !summary.trim()) {
          return { status: 400, body: { message: "Add a resolution summary before closing this ticket" } };
        }
        changes.resolutionSummary = summary.trim();
        if (current.status !== "Closed") {
          changes.resolvedAt = now;
          changes.resolvedByUid = uid;
        }
      }
      if (isReopening) {
        changes.resolutionSummary = null;
        changes.resolvedAt = null;
        changes.resolvedByUid = null;
        changes.slaDueAt = new Date(now.getTime() + slaHours[nextPriority] * 60 * 60 * 1000);
      } else if (!current.slaDueAt || Object.prototype.hasOwnProperty.call(changes, "priority")) {
        changes.slaDueAt = new Date(now.getTime() + slaHours[nextPriority] * 60 * 60 * 1000);
      }
      const auditChanges = Object.entries(changes)
        .filter(([key]) => !["slaDueAt", "resolvedAt", "resolvedByUid"].includes(key))
        .map(([field, value]) => ({ field, from: current[field] ?? null, to: value }))
        .filter(item => JSON.stringify(item.from) !== JSON.stringify(item.to));
      const result = await tickets.findOneAndUpdate(
        { _id: ticketObjectId },
        { $set: { ...changes, updatedAt: now } },
        { returnDocument: "after" }
      );
      const updated = result?.value || result;
      if (!updated) return { status: 404, body: { message: "Ticket not found" } };
      if (auditChanges.length) await db.collection("auditlogs").insertOne({
        eventType: "support_ticket_updated", actorUid: uid, ticketId: ticketObjectId,
        changes: auditChanges, createdAt: now
      });
      return { status: 200, body: updated };
    } catch {
      return { status: 503, body: { message: "Unable to update support ticket" } };
    }
  }

  async getAdminLogs(uid, kind, search = "") {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (!["payment", "login", "audit"].includes(kind)) return { status: 400, body: { message: "Invalid log type" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const filter = {};
      let matchingAdmins = null;
      if (kind === "audit" && !(typeof search === "string" && search.trim())) {
        filter.adminId = { $exists: true };
      }
      if (typeof search === "string" && search.trim()) {
        const needle = search.trim().slice(0, 100);
        const escaped = needle.split("").map(ch => "\\.^$*+?()[]{}|".includes(ch) ? "\\" + ch : ch).join("");
        const userQuery = { $or: [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }] };
        if (kind === "audit") userQuery.role = { $in: ["admin", "superadmin"] };
        matchingAdmins = await db.collection("users").find(userQuery, { projection: { _id: 1, uid: 1, name: 1, email: 1, role: 1 } }).limit(500).toArray();
        if (!matchingAdmins.length) return { status: 200, body: [] };
        const userIds = matchingAdmins.map(user => user._id);
        if (kind === "audit") filter.adminId = { $in: userIds };
        else filter.userId = { $in: userIds };
      }
      const collectionName = kind === "payment" ? "subscriptions" : kind === "login" ? "loginhistories" : "auditlogs";
      const refField = kind === "audit" ? "adminId" : "userId";
      const entries = await db.collection(collectionName).aggregate([
        { $match: filter },
        { $sort: { timestamp: -1, createdAt: -1 } },
        { $limit: 500 },
        { $lookup: { from: "users", localField: refField, foreignField: "_id", as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $project: { "user.password": 0, "user.lastLoginIp": 0 } }
      ]).toArray();
      if (kind !== "audit") {
        return { status: 200, body: entries.map(entry => kind === "payment"
          ? { ...entry, userId: entry.user || null }
          : { ...entry, userId: entry.user || null }) };
      }

      // Moderation records use actorUid/targetUid, while older admin events
      // use adminId/targetId. Read both formats so moderation decisions are
      // visible in the existing admin audit history.
      const moderationFilter = { eventType: "moderation_action" };
      if (matchingAdmins) moderationFilter.actorUid = { $in: matchingAdmins.map(user => user.uid).filter(Boolean) };
      const moderation = await db.collection("auditlogs").find(moderationFilter)
        .sort({ createdAt: -1 }).limit(500).toArray();
      const relatedUids = [...new Set(moderation.flatMap(item => [item.actorUid, item.targetUid]).filter(Boolean))];
      const relatedUsers = relatedUids.length
        ? await db.collection("users").find({ uid: { $in: relatedUids } }, {
            projection: { uid: 1, name: 1, role: 1 }
          }).toArray()
        : [];
      const usersByUid = new Map(relatedUsers.map(user => [user.uid, user]));
      const moderationRows = moderation.map(item => ({
        ...item,
        adminId: usersByUid.get(item.actorUid) || null,
        action: item.action || item.eventType,
        targetType: "user",
        targetId: item.targetUid || "",
        timestamp: item.timestamp || item.createdAt
      }));
      return {
        status: 200,
        body: [...entries.map(entry => ({ ...entry, adminId: entry.user || null })), ...moderationRows]
          .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
          .slice(0, 500)
      };
    } catch {
      return { status: 503, body: { message: "Unable to load administrative logs" } };
    }
  }


  async handleVideoRooms(uid, action, roomId, payload = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const rooms = db.collection("videoRooms");
      const now = new Date();
      if (action === "earnings") {
        const [aggregateRows, earnings] = await Promise.all([
          db.collection("creatorEarnings").aggregate([
            { $match: { creatorUid: uid } },
            { $group: {
              _id: null,
              grossLkr: { $sum: "$grossAmount" },
              pendingReviewLkr: { $sum: { $cond: [{ $eq: ["$status", "pending_review"] }, "$creatorAmount", 0] } },
              approvedLkr: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$creatorAmount", 0] } },
              paidLkr: { $sum: { $cond: [{ $eq: ["$payoutStatus", "paid"] }, "$creatorAmount", 0] } }
            } }
          ]).toArray(),
          db.collection("creatorEarnings").find({ creatorUid: uid }).sort({ createdAt: -1 }).limit(100).toArray()
        ]);
        const totals = aggregateRows[0] || { grossLkr: 0, pendingReviewLkr: 0, approvedLkr: 0, paidLkr: 0 };
        return { status: 200, body: { currency: "LKR", totals, earnings: earnings.map(item => ({
          roomId: item.roomId, grossAmount: item.grossAmount, creatorAmount: item.creatorAmount,
          platformAmount: item.platformAmount, status: item.status, payoutStatus: item.payoutStatus, createdAt: item.createdAt
        })) } };
      }
      if (action === "create") {
        const mode = payload.mode, visibility = payload.visibility, capacity = Number(payload.capacity);
        const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 80) : "";
        const ticketPriceLkr = payload.ticketPriceLkr === undefined ? 0 : Number(payload.ticketPriceLkr);
        if (!Number.isInteger(ticketPriceLkr) || ![0, 500, 1000, 2000, 5000].includes(ticketPriceLkr) ||
            (ticketPriceLkr > 0 && (mode !== "broadcast" || visibility !== "listed"))) {
          return { status: 400, body: { error: "Paid tickets are available only for listed broadcasts, at supported LKR prices." } };
        }
        if (!["private", "group", "broadcast"].includes(mode) || !["invite", "listed"].includes(visibility) ||
            !Number.isInteger(capacity) || (mode === "private" && (capacity !== 2 || visibility !== "invite")) ||
            (mode === "group" && (capacity < 3 || capacity > 6)) ||
            (mode === "broadcast" && ![25, 50, 100].includes(capacity))) return { status: 400, body: { error: "Invalid room mode, visibility, or capacity." } };
        const user = await db.collection("users").findOne({ uid }, { projection: { name: 1, displayName: 1, accountStatus: 1 } });
        if (!user || isAccountRestricted(user, now)) return { status: 403, body: { error: "This account cannot host a Video Room." } };
        // Lazily end expired rooms so they do not consume the host active-room quota.
        await rooms.updateMany({ status: "active", expiresAt: { $lte: now } }, { $set: { status: "ended", endedAt: now, updatedAt: now } });
        if (await rooms.countDocuments({ hostUid: uid, status: "active" }) >= 2) return { status: 429, body: { error: "You already have the maximum number of active rooms." } };
        const room = {
          roomId: crypto.randomUUID(), hostUid: uid,
          hostDisplayName: String(user.displayName || user.name || "Host").slice(0, 80),
          title: title || (mode === "private" ? "Private individual show" : mode === "group" ? "Interactive group room" : "Live broadcast"),
          mode, visibility, capacity, ticketPriceLkr, status: "active",
          participants: [{ uid, role: "host", joinedAt: now, mediaPublishingAllowed: true }],
          mediaStatus: "not_connected",
          bandwidthProfile: mode === "private" ? "adaptive-p2p" : mode === "group" ? "low-bitrate-sfu" : "broadcast-sfu",
          createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000)
        };
        await rooms.insertOne(room);
        return { status: 201, body: { room: { roomId: room.roomId, title: room.title, mode, visibility, capacity, ticketPriceLkr, status: room.status, participantCount: 1, isHost: true, mediaReady: false, bandwidthProfile: room.bandwidthProfile, createdAt: now, expiresAt: room.expiresAt }, mediaReady: false, message: "Room created. Live media is not connected until a media transport is configured." } };
      }
      if (action === "list") {
        // Expire stale active rooms before listing. This also prevents expired rooms
        // from remaining visible just because a scheduled cleanup has not run.
        await rooms.updateMany({ status: "active", expiresAt: { $lte: now } }, { $set: { status: "ended", endedAt: now, updatedAt: now } });
        const found = await rooms.find({ $or: [{ hostUid: uid }, { "participants.uid": uid }, { visibility: "listed", status: "active" }] }).sort({ updatedAt: -1 }).limit(50).toArray();
        const listedRooms = await Promise.all(found.map(async room => {
          const isHost = room.hostUid === uid;
          const ticketPriceLkr = Number(room.ticketPriceLkr) || 0;
          const ticket = !isHost && ticketPriceLkr > 0
            ? await db.collection("videoRoomTickets").findOne({ roomId: room.roomId, viewerUid: uid, status: "paid" }, { projection: { _id: 1 } })
            : null;
          return {
            roomId: room.roomId, hostUid: room.hostUid, hostDisplayName: room.hostDisplayName,
            title: room.title, mode: room.mode, visibility: room.visibility, capacity: room.capacity, ticketPriceLkr,
            status: room.status, participantCount: (room.participants || []).length,
            createdAt: room.createdAt, expiresAt: room.expiresAt,
            isHost, hasTicket: isHost || ticketPriceLkr <= 0 || Boolean(ticket),
            isParticipant: (room.participants || []).some(p => p.uid === uid),
            mediaReady: room.mediaStatus === "ready", bandwidthProfile: room.bandwidthProfile
          };
        }));
        return { status: 200, body: { rooms: listedRooms } };
      }
      if (!["join", "leave", "end"].includes(action) || typeof roomId !== "string" || roomId.length > 64) return { status: 400, body: { error: "Invalid room action." } };
      const room = await rooms.findOne({ roomId, status: "active" });
      if (!room || (room.expiresAt && new Date(room.expiresAt) < now)) return { status: 404, body: { error: "Active room not found." } };
      const members = Array.isArray(room.participants) ? room.participants : [];
      const isMember = members.some(member => member.uid === uid);
      if (action === "join") {
        if (room.ticketPriceLkr > 0 && room.hostUid !== uid && !isMember) {
          const ticket = await db.collection("videoRoomTickets").findOne({ roomId, viewerUid: uid, status: "paid" });
          if (!ticket) return { status: 402, body: { error: "Purchase a ticket through WebXPay to join this live show.", paymentRequired: true, ticketPriceLkr: room.ticketPriceLkr, currency: "LKR" } };
        }
        if (room.visibility !== "listed" && room.hostUid !== uid && !isMember) return { status: 403, body: { error: "This room is invite-only." } };
        if (!isMember && members.length >= room.capacity) return { status: 409, body: { error: "This room is full." } };
        if (room.mode === "private" && room.hostUid !== uid && !isMember) return { status: 403, body: { error: "Private shows require a direct invitation." } };
        if (!isMember) {
          const joined = await rooms.updateOne({
            roomId, status: "active", "participants.uid": { $ne: uid },
            $expr: { $lt: [{ $size: { $ifNull: ["$participants", []] } }, "$capacity"] }
          }, {
            $push: { participants: { uid, role: room.mode === "broadcast" ? "viewer" : "participant", joinedAt: now, mediaPublishingAllowed: false } },
            $set: { updatedAt: now }
          });
          if (!joined.modifiedCount) return { status: 409, body: { error: "This room is full or no longer accepting participants." } };
        }
      } else if (action === "leave") {
        if (!isMember) return { status: 403, body: { error: "You are not a member of this room." } };
        if (room.hostUid === uid) await rooms.updateOne({ roomId, status: "active" }, { $set: { status: "ended", endedAt: now, updatedAt: now } });
        else await rooms.updateOne({ roomId, status: "active" }, { $pull: { participants: { uid } }, $set: { updatedAt: now } });
      } else {
        if (room.hostUid !== uid) return { status: 403, body: { error: "Only the host can end this room." } };
        await rooms.updateOne({ roomId, status: "active" }, { $set: { status: "ended", endedAt: now, updatedAt: now } });
      }
      const updated = await rooms.findOne({ roomId });
      return { status: 200, body: { room: updated ? { roomId: updated.roomId, title: updated.title, mode: updated.mode, visibility: updated.visibility, capacity: updated.capacity, ticketPriceLkr: Number(updated.ticketPriceLkr) || 0, status: updated.status, participantCount: (updated.participants || []).length, isHost: updated.hostUid === uid, isParticipant: (updated.participants || []).some(p => p.uid === uid), mediaReady: updated.mediaStatus === "ready", bandwidthProfile: updated.bandwidthProfile } : null, mediaReady: false } };
    } catch (error) {
      console.error("Video Room operation failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Video Rooms service unavailable" } };
    }
  }

  parseChatRoom(roomId) {
    if (typeof roomId !== "string" || roomId.length > 260 || roomId.length < 3) return null;
    return roomId;
  }

  async createCall(uid, payload) {
    const { roomId, receiverUid, type, offer } = payload || {};
    if (typeof uid !== "string" || !uid || typeof receiverUid !== "string" || !receiverUid ||
        receiverUid === uid || typeof roomId !== "string" || roomId.length < 3 || roomId.length > 260 ||
        !["audio", "video"].includes(type) || !offer || offer.type !== "offer" ||
        typeof offer.sdp !== "string" || offer.sdp.length > 200000) {
      return { status: 400, body: { error: "Invalid call request" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const [caller, receiver] = await Promise.all([
        users.findOne({ uid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1, accountStatus: 1, deletionRequestedAt: 1 } }),
        users.findOne({ uid: receiverUid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1, accountStatus: 1, deletionRequestedAt: 1 } })
      ]);
      if (!caller || !receiver) return { status: 404, body: { error: "Call participant not found" } };
      const now = new Date();
      if (isAccountRestricted(caller, now) || isAccountRestricted(receiver, now) ||
          (Array.isArray(caller.blocked) && caller.blocked.includes(receiverUid)) ||
          (Array.isArray(receiver.blocked) && receiver.blocked.includes(uid)) ||
          await this.isChatMatchInactive(db, uid, receiverUid)) {
        return { status: 403, body: { error: "Calling is unavailable for this conversation" } };
      }
      const calls = db.collection("callSessions");
      // A user can participate in only one live call at a time, even if
      // another conversation attempts to call them concurrently.
      const active = await calls.findOne({
        status: { $in: ["ringing", "accepted"] },
        $or: [
          { callerUid: uid }, { receiverUid: uid },
          { callerUid: receiverUid }, { receiverUid: receiverUid }
        ]
      }, { projection: { _id: 1 } });
      if (active) return { status: 409, body: { error: "One of the participants is already in an active call" } };

      // Chat room IDs are opaque and must not be reconstructed from UIDs.
      // Resolve the peer from a persisted message in this exact room, then
      // require that it is the intended receiver before creating a call.
      const conversation = await db.collection("chatmessages").findOne({
        roomId,
        $or: [{ senderUid: uid }, { receiverUid: uid }]
      }, { projection: { senderUid: 1, receiverUid: 1 } });
      const prefix = uid + "-";
      const suffix = "-" + uid;
      const roomPeerUid = conversation
        ? (conversation.senderUid === uid ? conversation.receiverUid : conversation.senderUid)
        : roomId.startsWith(prefix)
          ? roomId.slice(prefix.length)
          : roomId.endsWith(suffix) ? roomId.slice(0, -suffix.length) : null;
      if (roomPeerUid !== receiverUid) {
        return { status: 403, body: { error: "Calling is unavailable for this conversation" } };
      }
      if (!conversation) {
        // A newly matched pair may call before exchanging its first message.
        // Do not allow a room-shaped string alone to grant calling access.
        const match = await db.collection("matches").findOne({
          $or: [
            { user1Uid: uid, user2Uid: receiverUid },
            { user1Uid: receiverUid, user2Uid: uid }
          ]
        }, { projection: { status: 1 } });
        if (!match || match.status !== "matched") {
          return { status: 403, body: { error: "Calling is unavailable for this conversation" } };
        }
      }
      const call = {
        roomId, callerUid: uid, receiverUid, type, status: "ringing",
        offer: { type: "offer", sdp: offer.sdp }, answer: null, signals: [],
        createdAt: now, updatedAt: now,
        callerLastSeenAt: now, receiverLastSeenAt: now
      };
      const inserted = await calls.insertOne(call);
      call._id = inserted.insertedId;
      return { status: 201, body: call };
    } catch (error) {
      console.error("Call creation failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to start call" } };
    }
  }

  async getIncomingCall(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const calls = db.collection("callSessions");
      const now = new Date();
      const staleBefore = new Date(now.getTime() - 45000);
      if (typeof calls.find === "function") {
        const expiredCalls = await calls.find({
          receiverUid: uid, status: "ringing", createdAt: { $lt: staleBefore }
        }).toArray();
        for (const expiredCall of expiredCalls) {
          const expired = await calls.updateOne(
            { _id: expiredCall._id, status: "ringing" },
            { $set: { status: "missed", endReason: "no_answer", endedAt: now, updatedAt: now } }
          );
          if (expired.modifiedCount === 1) {
            await db.collection("notifications").insertOne({
              recipientUid: uid,
              senderUid: expiredCall.callerUid,
              type: "missed_call",
              callType: expiredCall.type === "video" ? "video" : "voice",
              callId: String(expiredCall._id),
              roomId: expiredCall.roomId,
              status: "pending",
              createdAt: now,
              updatedAt: now
            });
          }
        }
      } else {
        await calls.updateMany(
          { receiverUid: uid, status: "ringing", createdAt: { $lt: staleBefore } },
          { $set: { status: "missed", endReason: "no_answer", endedAt: now, updatedAt: now } }
        );
      }
      const call = await calls.findOne(
        { receiverUid: uid, status: "ringing", createdAt: { $gte: staleBefore } },
        { sort: { createdAt: -1 } }
      );
      if (!call) return { status: 200, body: { call: null } };
      if (await this.isCallPairUnavailable(db, uid, call.callerUid)) {
        await calls.updateOne({ _id: call._id, status: "ringing" }, {
          $set: { status: "ended", endedAt: now, updatedAt: now, endReason: "conversation_unavailable" }
        });
        return { status: 200, body: { call: null } };
      }
      await calls.updateOne(
        { _id: call._id, status: "ringing" },
        { $set: { receiverLastSeenAt: now } }
      );
      const caller = await db.collection("users").findOne(
        { uid: call.callerUid },
        { projection: { _id: 0, name: 1 } }
      );
      const safeCall = { ...call, callerName: caller?.name || "Someone" };
      delete safeCall.signals;
      return { status: 200, body: { call: safeCall } };
    } catch (error) {
      console.error("Incoming call lookup failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to retrieve incoming call" } };
    }
  }

  async getCallHistory(uid, roomId) {
    if (typeof uid !== "string" || !uid || typeof roomId !== "string" ||
        roomId.length > 260 || roomId.length < 3) {
      return { status: 400, body: { error: "Invalid call room" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const callsCollection = db.collection("callSessions");
      const staleBefore = new Date(Date.now() - 45000);
      await callsCollection.updateMany(
        { roomId, status: "ringing", createdAt: { $lt: staleBefore },
          $or: [{ callerUid: uid }, { receiverUid: uid }] },
        { $set: { status: "missed", endReason: "no_answer", endedAt: new Date(), updatedAt: new Date() } }
      );
      const calls = await callsCollection.find({
        roomId, $or: [{ callerUid: uid }, { receiverUid: uid }]
      }).sort({ createdAt: -1 }).limit(30).toArray();
      if (calls.length) {
        const latest = calls[0];
        const otherUid = latest.callerUid === uid ? latest.receiverUid : latest.callerUid;
        if (await this.isCallPairUnavailable(db, uid, otherUid)) {
          return { status: 403, body: { error: "Call history is unavailable for this conversation" } };
        }
      }
      return { status: 200, body: { calls: calls.map(call => {
        const safe = { ...call };
        delete safe.offer;
        delete safe.answer;
        delete safe.signals;
        return safe;
      }) } };
    } catch (error) {
      console.error("Call history lookup failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to retrieve call history" } };
    }
  }

  async getCallState(uid, roomId) {
    if (typeof uid !== "string" || !uid || typeof roomId !== "string" ||
        roomId.length > 260 || roomId.length < 3) {
      return { status: 400, body: { error: "Invalid call room" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const calls = db.collection("callSessions");
      let call = await calls.findOne({
        roomId, status: { $in: ["ringing", "accepted"] },
        $or: [{ callerUid: uid }, { receiverUid: uid }]
      }, { sort: { createdAt: -1 } });
      if (call) {
        const now = new Date();
        const otherUid = call.callerUid === uid ? call.receiverUid : call.callerUid;
        if (await this.isCallPairUnavailable(db, uid, otherUid)) {
          await calls.updateOne({ _id: call._id, status: { $in: ["ringing", "accepted"] } }, {
            $set: { status: "ended", endedAt: now, updatedAt: now, endReason: "conversation_unavailable" }
          });
          return { status: 200, body: { call: null, signals: [] } };
        }
        const heartbeatField = call.callerUid === uid ? "callerLastSeenAt" : "receiverLastSeenAt";
        const otherHeartbeatField = call.callerUid === uid ? "receiverLastSeenAt" : "callerLastSeenAt";
        await calls.updateOne(
          { _id: call._id, status: { $in: ["ringing", "accepted"] } },
          { $set: { [heartbeatField]: now } }
        );
        call[heartbeatField] = now;

        if (call.status === "ringing" && now.getTime() - new Date(call.createdAt).getTime() > 45000) {
          await calls.updateOne({ _id: call._id, status: "ringing" }, {
            $set: { status: "missed", endedAt: now, updatedAt: now }
          });
          call = null;
        } else if (call.status === "accepted") {
          // Each participant renews their own lease through the existing poll.
          // If the other browser closes or loses connectivity, the session is
          // released instead of blocking all future calls indefinitely.
          const otherSeen = call[otherHeartbeatField] || call.connectedAt || call.updatedAt || call.createdAt;
          const otherSeenAt = new Date(otherSeen).getTime();
          if (!Number.isFinite(otherSeenAt) || now.getTime() - otherSeenAt > 90000) {
            await calls.updateOne({ _id: call._id, status: "accepted" }, {
              $set: { status: "ended", endedAt: now, updatedAt: now, endReason: "participant_timeout" }
            });
            call = null;
          }
        }
      }
      if (!call) return { status: 200, body: { call: null, signals: [] } };
      const signals = (Array.isArray(call.signals) ? call.signals : [])
        .filter(signal => signal && signal.toUid === uid);
      const safeCall = { ...call };
      delete safeCall.signals;
      return { status: 200, body: { call: safeCall, signals } };
    } catch (error) {
      console.error("Call state lookup failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to retrieve call state" } };
    }
  }

  async sendCallSignal(uid, payload) {
    const { callId, candidate, description } = payload || {};
    const validCandidate = candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
      typeof candidate.candidate === "string" && candidate.candidate.length <= 10000 &&
      (candidate.sdpMid == null || (typeof candidate.sdpMid === "string" && candidate.sdpMid.length <= 256)) &&
      (candidate.sdpMLineIndex == null || (Number.isInteger(candidate.sdpMLineIndex) &&
        candidate.sdpMLineIndex >= 0 && candidate.sdpMLineIndex <= 65535)) &&
      (candidate.usernameFragment == null || (typeof candidate.usernameFragment === "string" &&
        candidate.usernameFragment.length <= 256));
    const validDescription = description && typeof description === "object" &&
      ["offer", "answer"].includes(description.type) &&
      typeof description.sdp === "string" && description.sdp.length <= 200000;
    if (typeof callId !== "string" || !/^[a-fA-F0-9]{24}$/.test(callId) ||
        Number(Boolean(validCandidate)) + Number(Boolean(validDescription)) !== 1) {
      return { status: 400, body: { error: "Invalid call signal" } };
    }
    // Persist only the ICECandidateInit fields used by WebRTC. Never copy
    // arbitrary client properties into the shared call document.
    const normalizedCandidate = validCandidate ? {
      candidate: candidate.candidate,
      ...(candidate.sdpMid == null ? {} : { sdpMid: candidate.sdpMid }),
      ...(candidate.sdpMLineIndex == null ? {} : { sdpMLineIndex: candidate.sdpMLineIndex }),
      ...(candidate.usernameFragment == null ? {} : { usernameFragment: candidate.usernameFragment })
    } : null;
    const signalData = validCandidate
      ? { candidate: normalizedCandidate }
      : { description: { type: description.type, sdp: description.sdp } };
    try {
      const db = this.getDatabase(await this.getClient());
      const { ObjectId } = await import("mongodb");
      const calls = db.collection("callSessions");
      const call = await calls.findOne({ _id: new ObjectId(callId), status: { $in: ["ringing", "accepted"] } });
      if (!call) return { status: 404, body: { error: "Active call not found" } };
      let toUid;
      if (call.callerUid === uid) toUid = call.receiverUid;
      else if (call.receiverUid === uid) toUid = call.callerUid;
      else return { status: 403, body: { error: "Not a participant in this call" } };
      if (await this.isCallPairUnavailable(db, uid, toUid)) {
        await calls.updateOne({ _id: call._id, status: { $in: ["ringing", "accepted"] } }, {
          $set: { status: "ended", endedAt: new Date(), updatedAt: new Date(), endReason: "conversation_unavailable" }
        });
        return { status: 403, body: { error: "Calling is unavailable for this conversation" } };
      }

      // Keep only the most recent signaling candidates. ICE can emit several
      // candidates per peer and the same call document is polled repeatedly.
      // A lifetime counter caused otherwise healthy long-running calls to hit
      // a permanent 429 once 300 candidates had accumulated.
      await calls.updateOne(
        { _id: call._id, status: { $in: ["ringing", "accepted"] },
          $or: [{ callerUid: uid }, { receiverUid: uid }] },
        { $push: { signals: {
          $each: [{ signalId: crypto.randomUUID(), fromUid: uid, toUid, ...signalData, createdAt: new Date() }],
          $slice: -300
        } }, $set: { updatedAt: new Date() } }
      );
      return { status: 200, body: { success: true } };
    } catch (error) {
      console.error("Call signaling failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to send call signal" } };
    }
  }

  async updateCall(uid, payload) {
    const { callId, action, answer } = payload || {};
    if (typeof callId !== "string" || !/^[a-fA-F0-9]{24}$/.test(callId) ||
        !["accept", "decline", "end"].includes(action) ||
        (action === "accept" && (!answer || answer.type !== "answer" ||
          typeof answer.sdp !== "string" || answer.sdp.length > 200000))) {
      return { status: 400, body: { error: "Invalid call action" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const { ObjectId } = await import("mongodb");
      const calls = db.collection("callSessions");
      const call = await calls.findOne({ _id: new ObjectId(callId) });
      if (!call) return { status: 404, body: { error: "Call not found" } };
      if (call.callerUid !== uid && call.receiverUid !== uid) {
        return { status: 403, body: { error: "Not a participant in this call" } };
      }
      const otherUid = call.callerUid === uid ? call.receiverUid : call.callerUid;
      if (await this.isCallPairUnavailable(db, uid, otherUid)) {
        await calls.updateOne({ _id: call._id, status: { $in: ["ringing", "accepted"] } }, {
          $set: { status: "ended", endedAt: new Date(), updatedAt: new Date(), endReason: "conversation_unavailable" }
        });
        return { status: 403, body: { error: "Calling is unavailable for this conversation" } };
      }
      if (!["ringing", "accepted"].includes(call.status)) {
        return { status: 200, body: { call, alreadyFinished: true } };
      }
      if (action !== "end" && uid !== call.receiverUid) {
        return { status: 403, body: { error: "Only the recipient can accept or decline a call" } };
      }
      const next = action === "accept" ? "accepted" : action === "decline" ? "declined" : "ended";
      const now = new Date();
      const set = { status: next, updatedAt: now };
      if (action === "accept") {
        set.answer = { type: "answer", sdp: answer.sdp };
        set.connectedAt = now;
        set.callerLastSeenAt = now;
        set.receiverLastSeenAt = now;
      } else {
        set.endedAt = now;
        set.endedByUid = uid;
        if (action === "decline") {
          set.endReason = "declined";
        } else if (call.status === "accepted") {
          set.endReason = "completed";
          const connectedAt = new Date(call.connectedAt || call.updatedAt || call.createdAt).getTime();
          set.durationSeconds = Number.isFinite(connectedAt) ? Math.max(0, Math.floor((now.getTime() - connectedAt) / 1000)) : 0;
        } else {
          set.endReason = "cancelled";
        }
      }
      await calls.updateOne(
        { _id: call._id, status: { $in: ["ringing", "accepted"] } },
        { $set: set }
      );
      const updated = await calls.findOne({ _id: call._id });
      if (updated) delete updated.signals;
      return { status: 200, body: { call: updated } };
    } catch (error) {
      console.error("Call update failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to update call" } };
    }
  }

  async isChatMatchInactive(db, uid, otherUid) {
    const matches = db.collection("matches");
    // Lightweight test doubles sometimes route unknown collection names to
    // their chatmessages stub. Do not mistake that fallback for a match store.
    if (matches === db.collection("chatmessages") || typeof matches.findOne !== "function") return false;
    const match = await matches.findOne({
      $or: [
        { user1Uid: uid, user2Uid: otherUid },
        { user1Uid: otherUid, user2Uid: uid }
      ]
    }, { projection: { status: 1 } });
    // A missing match record is treated as a legacy conversation. Once a
    // pair has a match record, only its active "matched" state grants access.
    return Boolean(match && typeof match.status === "string" && match.status !== "matched");
  }

  async isCallPairUnavailable(db, uid, otherUid) {
    if (typeof uid !== "string" || !uid || typeof otherUid !== "string" || !otherUid || uid === otherUid) return true;
    const users = db.collection("users");
    const [viewer, other] = await Promise.all([
      users.findOne({ uid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }),
      users.findOne({ uid: otherUid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } })
    ]);
    const now = new Date();
    if (!viewer || !other || isAccountRestricted(viewer, now) || isAccountRestricted(other, now) ||
        (Array.isArray(viewer.blocked) && viewer.blocked.includes(otherUid)) ||
        (Array.isArray(other.blocked) && other.blocked.includes(uid))) return true;
    return this.isChatMatchInactive(db, uid, otherUid);
  }

  async isChatPairUnavailable(db, uid, roomId) {
    const messages = db.collection("chatmessages");
    const conversation = await messages.findOne({
      roomId,
      $or: [{ senderUid: uid }, { receiverUid: uid }]
    }, { projection: { senderUid: 1, receiverUid: 1 } });
    if (!conversation) return true;
    const otherUid = conversation.senderUid === uid ? conversation.receiverUid : conversation.senderUid;
    if (typeof otherUid !== "string" || !otherUid || otherUid === uid) return true;
    return this.isCallPairUnavailable(db, uid, otherUid);
  }

  async getChatHistory(uid, roomId, limit = 50, skip = 0, after = null, before = null) {
    if (!this.parseChatRoom(roomId) || typeof uid !== "string" || !uid) return { status: 400, body: { error: "Invalid room ID" } };
    limit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
    skip = Number.isInteger(skip) ? Math.max(0, Math.min(skip, 100000)) : 0;
    // Worker-to-Durable-Object requests cross a JSON boundary, which
    // serializes Date values as ISO strings. Normalize the cursor timestamp
    // before validating it so incremental history works in the deployed path.
    if (after && typeof after.timestamp === "string") {
      after = { ...after, timestamp: new Date(after.timestamp) };
    }
    if (before && typeof before.timestamp === "string") {
      before = { ...before, timestamp: new Date(before.timestamp) };
    }
    const validCursor = cursor => !cursor || (
      cursor.timestamp instanceof Date &&
      !Number.isNaN(cursor.timestamp.getTime()) &&
      typeof cursor.id === "string" &&
      /^[a-fA-F0-9]{24}$/.test(cursor.id)
    );
    if (!validCursor(after) || !validCursor(before) || (after && before)) {
      return { status: 400, body: { error: "Invalid message cursor" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: {
        role: 1, blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1
      } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      if (user.role !== "superadmin" && isAccountRestricted(user)) {
        return { status: 403, body: { error: "Messaging is unavailable for this account" } };
      }
      let query = { roomId };
      if (user.role !== "superadmin") {
        const participantQuery = { roomId, $or: [{ senderUid: uid }, { receiverUid: uid }] };
        const conversation = await db.collection("chatmessages").findOne(
          participantQuery,
          { projection: { senderUid: 1, receiverUid: 1 } }
        );

        if (conversation) {
          const otherUid = conversation.senderUid === uid ? conversation.receiverUid : conversation.senderUid;
          if (await this.isCallPairUnavailable(db, uid, otherUid)) {
            return { status: 403, body: { error: "Chat history is unavailable for this conversation." } };
          }
          query = participantQuery;
        } else {
          // A new mutual match has no persisted chat message yet. Resolve the
          // peer only from an exact authenticated UID boundary, then require
          // an active match and both accounts to remain eligible. This allows
          // the first message without granting access to arbitrary room IDs.
          const prefix = uid + "-";
          const suffix = "-" + uid;
          const otherUid = roomId.startsWith(prefix)
            ? roomId.slice(prefix.length)
            : roomId.endsWith(suffix) ? roomId.slice(0, -suffix.length) : "";
          if (!otherUid || otherUid === uid || otherUid.length > 128) {
            return { status: 403, body: { error: "Unauthorized to view this chat history." } };
          }
          const match = await db.collection("matches").findOne({
            $or: [
              { user1Uid: uid, user2Uid: otherUid },
              { user1Uid: otherUid, user2Uid: uid }
            ]
          }, { projection: { status: 1 } });
          if (!match || match.status !== "matched" ||
              await this.isCallPairUnavailable(db, uid, otherUid)) {
            return { status: 403, body: { error: "Chat history is unavailable for this conversation." } };
          }
          query = {
            roomId,
            $or: [
              { senderUid: uid, receiverUid: otherUid },
              { senderUid: otherUid, receiverUid: uid }
            ]
          };
        }
      }
      let messages;
      if (after || before) {
        // Stable (timestamp, ObjectId) cursors prevent gaps and duplicates
        // when messages share timestamps or new messages arrive during paging.
        const { ObjectId } = await import("mongodb");
        const cursor = after || before;
        const operator = after ? "$gt" : "$lt";
        query = {
          ...query,
          $and: [
            ...(query.$or ? [{ $or: query.$or }] : []),
            { $or: [
              { timestamp: { [operator]: cursor.timestamp } },
              { timestamp: cursor.timestamp, _id: { [operator]: new ObjectId(cursor.id) } }
            ] }
          ]
        };
        messages = await db.collection("chatmessages").find(query)
          .sort({ timestamp: after ? 1 : -1, _id: after ? 1 : -1 })
          .limit(limit).maxTimeMS(10000).toArray();
        if (before) messages.reverse();
      } else {
        // Initial page selects the newest messages and returns them chronologically.
        messages = await db.collection("chatmessages").find(query)
          .sort({ timestamp: -1, _id: -1 }).skip(skip).limit(limit).maxTimeMS(10000).toArray();
        messages.reverse();
      }
      // Expose Mongo ObjectIds as stable 24-character hex strings. BSON's
      // JSON representation can vary by driver/serializer, but the public
      // cursor contract must always be a plain string.
      const publicMessageFields = [
        "roomId", "senderUid", "receiverUid", "messageContent", "timestamp",
        "status", "deliveredAt", "readAt", "clientMessageId", "editedAt", "deletedAt"
      ];
      const serializedMessages = messages.map(message => {
        const safeMessage = {};
        for (const field of publicMessageFields) {
          if (message[field] !== undefined) safeMessage[field] = message[field];
        }
        safeMessage._id = typeof message._id?.toHexString === "function"
          ? message._id.toHexString()
          : String(message._id);
        return safeMessage;
      });
      return { status: 200, body: { messages: serializedMessages } };
    } catch {
      return { status: 503, body: { error: "Chat history unavailable" } };
    }
  }

  async getChatConversations(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const chatMessages = db.collection("chatmessages");
      // These compound indexes support each side of the participant OR query
      // and keep newest-message ordering efficient as chat history grows.
      // Index creation is non-blocking so a DDL lock cannot stall inbox reads.
      if (!this.chatConversationIndexesPromise && typeof chatMessages.createIndex === "function") {
        this.chatConversationIndexesPromise = Promise.all([
          chatMessages.createIndex(
            { senderUid: 1, timestamp: -1, _id: -1 },
            { name: "chat_sender_inbox_latest" }
          ),
          chatMessages.createIndex(
            { receiverUid: 1, timestamp: -1, _id: -1 },
            { name: "chat_receiver_inbox_latest" }
          ),
          // Inbox polling also groups all non-read messages by room. This
          // index narrows that scan to the recipient and keeps room/status
          // fields adjacent for the aggregation.
          chatMessages.createIndex(
            { receiverUid: 1, roomId: 1, status: 1 },
            { name: "chat_receiver_unread_room_status" }
          ),
          // Account suspension/deletion revocation also enumerates legacy rooms
          // by participant UID. These indexes keep that cleanup bounded.
          chatMessages.createIndex(
            { senderUid: 1, roomId: 1 },
            { name: "chat_sender_room_membership" }
          ),
          chatMessages.createIndex(
            { receiverUid: 1, roomId: 1 },
            { name: "chat_receiver_room_membership" }
          )
        ]).catch((error) => {
          this.chatConversationIndexesPromise = null;
          console.error("MongoDB chat inbox index creation failed", {
            name: error && typeof error.name === "string" ? error.name : "Error",
            message: error && typeof error.message === "string" ? error.message.slice(0, 200) : undefined
          });
        });
      }
      const [user, messages, unreadCounts] = await Promise.all([
        db.collection("users").findOne({ uid }, { projection: {
          _id: 1, uid: 1, blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1
        } }),
        chatMessages.aggregate([
          { $match: { $or: [{ senderUid: uid }, { receiverUid: uid }] } },
          { $sort: { timestamp: -1, _id: -1 } },
          { $group: { _id: "$roomId", lastMessage: { $first: "$$ROOT" } } },
          { $replaceRoot: { newRoot: "$lastMessage" } },
          { $sort: { timestamp: -1, _id: -1 } }
        ], { maxTimeMS: 10000 }).toArray(),
        chatMessages.aggregate([
          { $match: { receiverUid: uid, status: { $ne: "read" } } },
          { $group: { _id: "$roomId", unreadCount: { $sum: 1 } } }
        ], { maxTimeMS: 10000 }).toArray()
      ]);
      if (!user) return { status: 404, body: { error: "User not found" } };
      if (isAccountRestricted(user)) return { status: 403, body: { error: "Messaging is unavailable for this account" } };
      const unreadCountByRoom = new Map(unreadCounts.map(item => [item._id, item.unreadCount]));
      const latestByRoom = new Map();
      for (const message of messages) {
        if (typeof message.roomId !== "string" || latestByRoom.has(message.roomId)) continue;
        const otherUid = message.senderUid === uid ? message.receiverUid : message.senderUid;
        if (typeof otherUid !== "string" || !otherUid || otherUid === uid) continue;
        latestByRoom.set(message.roomId, { otherUid, lastMessage: message });
      }
      // Fetch all counterpart profiles in one query instead of issuing one
      // sequential MongoDB round trip per conversation.
      const otherUids = [...new Set([...latestByRoom.values()].map(item => item.otherUid))];
      const otherUsers = otherUids.length
        ? await db.collection("users").find(
            { uid: { $in: otherUids } },
            { projection: { password: 0, lastLoginIp: 0, email: 0, mobileNumber: 0, location: 0, lastLoginDevice: 0 } }
          ).toArray()
        : [];
      const usersByUid = new Map(otherUsers.map(otherUser => [otherUser.uid, otherUser]));
      const conversations = [];
      for (const [roomId, item] of latestByRoom) {
        const otherUser = usersByUid.get(item.otherUid);
        if (!otherUser || isAccountRestricted(otherUser) ||
            (Array.isArray(user.blocked) && user.blocked.includes(item.otherUid)) ||
            (Array.isArray(otherUser.blocked) && otherUser.blocked.includes(uid)) ||
            await this.isChatMatchInactive(db, uid, item.otherUid)) continue;
        conversations.push({
          roomId,
          otherUser: sanitizePublicProfile(otherUser),
          lastMessage: (() => {
            const safeMessage = {};
            for (const field of [
              "roomId", "senderUid", "receiverUid", "messageContent", "timestamp",
              "status", "deliveredAt", "readAt", "clientMessageId", "editedAt", "deletedAt"
            ]) {
              if (item.lastMessage[field] !== undefined) safeMessage[field] = item.lastMessage[field];
            }
            safeMessage._id = typeof item.lastMessage._id?.toHexString === "function"
              ? item.lastMessage._id.toHexString()
              : String(item.lastMessage._id);
            return safeMessage;
          })(),
          unreadCount: unreadCountByRoom.get(roomId) || 0
        });
      }
      return { status: 200, body: conversations };
    } catch (error) {
      console.error("Chat conversations query failed", {
        name: error && typeof error.name === "string" ? error.name : "Error",
        message: error && typeof error.message === "string" ? error.message.slice(0, 200) : undefined
      });
      return { status: 503, body: { error: "Chat conversations unavailable" } };
    }
  }

  async updateTypingStatus(uid, payload) {
    const { roomId, isTyping } = payload || {};
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId) ||
        typeof isTyping !== "boolean") {
      return { status: 400, body: { error: "Invalid typing status" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const conversation = await db.collection("chatmessages").findOne(
        { roomId, $or: [{ senderUid: uid }, { receiverUid: uid }] },
        { projection: { senderUid: 1, receiverUid: 1 } }
      );
      if (!conversation) return { status: 403, body: { error: "Not a participant in this conversation" } };
      const otherUid = conversation.senderUid === uid
        ? conversation.receiverUid
        : conversation.receiverUid === uid ? conversation.senderUid : null;
      if (!otherUid) return { status: 403, body: { error: "Not a participant in this conversation" } };
      const [currentUser, otherUser] = await Promise.all([
        db.collection("users").findOne({ uid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }),
        db.collection("users").findOne({ uid: otherUid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } })
      ]);
      if (!currentUser || !otherUser || isAccountRestricted(currentUser) || isAccountRestricted(otherUser) ||
          (Array.isArray(currentUser.blocked) && currentUser.blocked.includes(otherUid)) ||
          (Array.isArray(otherUser.blocked) && otherUser.blocked.includes(uid)) ||
          await this.isChatMatchInactive(db, uid, otherUid)) {
        return { status: 403, body: { error: "Typing status is unavailable for this conversation" } };
      }
      const now = new Date();
      await db.collection("chatTyping").updateOne(
        { roomId, uid },
        { $set: { roomId, uid, isTyping, updatedAt: now } },
        { upsert: true }
      );
      return { status: 200, body: { success: true } };
    } catch {
      return { status: 503, body: { error: "Typing status unavailable" } };
    }
  }

  async getTypingStatus(uid, roomId) {
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId)) {
      return { status: 400, body: { error: "Invalid chat room" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const conversation = await db.collection("chatmessages").findOne(
        { roomId, $or: [{ senderUid: uid }, { receiverUid: uid }] },
        { projection: { senderUid: 1, receiverUid: 1 } }
      );
      if (!conversation) return { status: 403, body: { error: "Not a participant in this conversation" } };
      const otherUid = conversation.senderUid === uid
        ? conversation.receiverUid
        : conversation.receiverUid === uid ? conversation.senderUid : null;
      if (!otherUid) return { status: 403, body: { error: "Not a participant in this conversation" } };
      const [currentUser, otherUser] = await Promise.all([
        db.collection("users").findOne({ uid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } }),
        db.collection("users").findOne({ uid: otherUid }, { projection: { blocked: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1 } })
      ]);
      if (!currentUser || !otherUser || isAccountRestricted(currentUser) || isAccountRestricted(otherUser) ||
          (Array.isArray(currentUser.blocked) && currentUser.blocked.includes(otherUid)) ||
          (Array.isArray(otherUser.blocked) && otherUser.blocked.includes(uid)) ||
          await this.isChatMatchInactive(db, uid, otherUid)) {
        return { status: 403, body: { error: "Typing status is unavailable for this conversation" } };
      }
      const presence = await db.collection("chatTyping").findOne({ roomId, uid: otherUid });
      const typing = Boolean(presence?.isTyping && Date.now() - new Date(presence.updatedAt).getTime() < 5000);
      return { status: 200, body: { isTyping: typing } };
    } catch {
      return { status: 503, body: { error: "Typing status unavailable" } };
    }
  }

  async markChatDelivered(uid, payload) {
    const { roomId, messageIds } = payload || {};
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId) || !Array.isArray(messageIds) || messageIds.length > 100) {
      return { status: 400, body: { error: "Invalid delivery receipt" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const ids = messageIds.filter(id => typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id)).map(id => new ObjectId(id));
      if (!ids.length) return { status: 200, body: { deliveredCount: 0 } };
      const db = this.getDatabase(await this.getClient());
      if (await this.isChatPairUnavailable(db, uid, roomId)) {
        return { status: 403, body: { error: "Chat receipts are unavailable for this conversation" } };
      }
      const messages = db.collection("chatmessages");
      const result = await messages.updateMany(
        { _id: { $in: ids }, roomId, receiverUid: uid, status: "sent" },
        { $set: { status: "delivered", deliveredAt: new Date() } }
      );
      const syncedMessages = await messages.find(
        { _id: { $in: ids }, roomId, receiverUid: uid, status: "delivered" },
        { projection: { _id: 1 } }
      ).toArray();
      return {
        status: 200,
        body: {
          deliveredCount: result.modifiedCount,
          updatedMessageIds: syncedMessages.map(message => String(message._id))
        }
      };
    } catch {
      return { status: 503, body: { error: "Could not mark messages as delivered" } };
    }
  }

  async markChatRead(uid, payload) {
    const { roomId, messageIds } = payload || {};
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId) ||
        !Array.isArray(messageIds) || messageIds.length > 100) {
      return { status: 400, body: { error: "Invalid read receipt" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const ids = messageIds
        .filter(id => typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id))
        .map(id => new ObjectId(id));
      if (!ids.length) return { status: 200, body: { readCount: 0 } };
      const db = this.getDatabase(await this.getClient());
      if (await this.isChatPairUnavailable(db, uid, roomId)) {
        return { status: 403, body: { error: "Chat receipts are unavailable for this conversation" } };
      }
      const now = new Date();
      const messages = db.collection("chatmessages");
      const result = await messages.updateMany(
        { _id: { $in: ids }, roomId, receiverUid: uid, status: { $in: ["sent", "delivered"] } },
        { $set: { status: "read", deliveredAt: now, readAt: now } }
      );
      const syncedMessages = await messages.find(
        { _id: { $in: ids }, roomId, receiverUid: uid, status: "read" },
        { projection: { _id: 1 } }
      ).toArray();
      return {
        status: 200,
        body: {
          readCount: result.modifiedCount,
          updatedMessageIds: syncedMessages.map(message => String(message._id))
        }
      };
    } catch {
      return { status: 503, body: { error: "Could not mark messages as read" } };
    }
  }

  async createChatMessage(uid, payload) {
    const { roomId, receiverUid, messageContent, clientMessageId } = payload || {};
    if (typeof uid !== "string" || !uid || typeof receiverUid !== "string" || !receiverUid ||
        receiverUid === uid || typeof roomId !== "string" ||
        ![uid + "-" + receiverUid, receiverUid + "-" + uid].includes(roomId) ||
        typeof messageContent !== "string" || !messageContent.trim() || messageContent.length > 5000 ||
        (clientMessageId !== undefined && (typeof clientMessageId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)))) {
      return { status: 400, body: { error: "Invalid roomId, receiverUid, messageContent, or clientMessageId" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const messages = db.collection("chatmessages");
      const [sender, receiver] = await Promise.all([
        users.findOne({ uid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1, accountStatus: 1, deletionRequestedAt: 1 } }),
        users.findOne({ uid: receiverUid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1, accountStatus: 1, deletionRequestedAt: 1 } })
      ]);
      if (!sender || !receiver) return { status: 404, body: { error: "Chat participant not found" } };
      const now = new Date();
      if (isAccountRestricted(sender, now) || isAccountRestricted(receiver, now)) {
        return { status: 403, body: { error: "Messaging is unavailable for this account" } };
      }
      if ((Array.isArray(sender.blocked) && sender.blocked.includes(receiverUid)) ||
          (Array.isArray(receiver.blocked) && receiver.blocked.includes(uid))) {
        return { status: 403, body: { error: "Messaging is unavailable for this conversation" } };
      }

      // New conversations require a mutual match, as on Tinder and Bumble.
      // Existing legacy conversations remain usable after migration, provided
      // at least one message already exists between these exact participants.
      const matchRecord = await db.collection("matches").findOne({
        $or: [
          { user1Uid: uid, user2Uid: receiverUid },
          { user1Uid: receiverUid, user2Uid: uid }
        ]
      }, { projection: { _id: 1, status: 1 } });
      if (matchRecord && matchRecord.status !== "matched") {
        return { status: 403, body: { error: "This conversation has ended." } };
      }
      const mutualMatch = matchRecord?.status === "matched";
      if (!mutualMatch) {
        const existingConversation = await messages.findOne({
          roomId,
          $or: [
            { senderUid: uid, receiverUid },
            { senderUid: receiverUid, receiverUid: uid }
          ]
        }, { projection: { _id: 1 } });
        if (!existingConversation) {
          return { status: 403, body: { error: "You can message this person after you match." } };
        }
      }

      if (clientMessageId) {
        // The unique partial index makes retries safe even if the original request
        // committed but its HTTP response was lost, including concurrent retries.
        if (!this.chatMessageIdIndexPromise) {
          this.chatMessageIdIndexPromise = messages.createIndex(
            { senderUid: 1, clientMessageId: 1 },
            {
              name: "chat_sender_client_message_unique",
              unique: true,
              partialFilterExpression: { clientMessageId: { $type: "string" } }
            }
          ).catch((error) => {
            this.chatMessageIdIndexPromise = null;
            throw error;
          });
        }
        await this.chatMessageIdIndexPromise;
        const existing = await messages.findOne({ senderUid: uid, clientMessageId });
        if (existing) {
          if (existing.roomId !== roomId || existing.receiverUid !== receiverUid ||
              existing.messageContent !== messageContent.trim()) {
            return { status: 409, body: { error: "This message retry key was already used for different content" } };
          }
          return { status: 200, body: existing };
        }
      }

      const message = {
        roomId, senderUid: uid, receiverUid, messageContent: messageContent.trim(),
        timestamp: now, status: "sent",
        ...(clientMessageId ? { clientMessageId } : {})
      };
      try {
        const inserted = await messages.insertOne(message);
        message._id = inserted.insertedId;
        return { status: 201, body: message };
      } catch (insertError) {
        if (clientMessageId && insertError?.code === 11000) {
          const existing = await messages.findOne({ senderUid: uid, clientMessageId });
          if (existing && existing.roomId === roomId && existing.receiverUid === receiverUid &&
              existing.messageContent === messageContent.trim()) {
            return { status: 200, body: existing };
          }
          if (existing) return { status: 409, body: { error: "This message retry key was already used for different content" } };
        }
        throw insertError;
      }
    } catch {
      return { status: 503, body: { error: "Unable to send chat message" } };
    }
  }

  async updateChatMessage(uid, messageId, payload = {}) {
    if (typeof messageId !== "string" || !/^[a-fA-F0-9]{24}$/.test(messageId) ||
        typeof payload.messageContent !== "string" || !payload.messageContent.trim() || payload.messageContent.trim().length > 5000) {
      return { status: 400, body: { error: "A valid message ID and message content are required" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const { ObjectId } = await import("mongodb");
      const actor = await db.collection("users").findOne({ uid }, { projection: {
        role: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1
      } });
      if (!actor) return { status: 404, body: { error: "User not found" } };
      const isAdmin = ["admin", "superadmin"].includes(actor.role);
      if (!isAdmin && isAccountRestricted(actor)) return { status: 403, body: { error: "Messaging is unavailable for this account" } };
      const messages = db.collection("chatmessages");
      const id = new ObjectId(messageId);
      const message = await messages.findOne({ _id: id });
      if (!message || message.deletedAt) return { status: 404, body: { error: "Message not found" } };
      if (!isAdmin && message.senderUid !== uid) return { status: 403, body: { error: "You can only edit your own messages" } };
      if (!isAdmin && await this.isChatPairUnavailable(db, uid, message.roomId)) {
        return { status: 403, body: { error: "This conversation is no longer available" } };
      }
      if (!isAdmin && Date.now() - new Date(message.timestamp).getTime() > 15 * 60 * 1000) return { status: 403, body: { error: "Messages can only be edited within 15 minutes of sending" } };
      const now = new Date();
      await db.collection("auditlogs").insertOne({ eventType: "chat_message_edited", actorUid: uid, actorType: isAdmin ? "admin" : "customer", messageId: id, roomId: message.roomId, previousMessage: message.messageContent, updatedMessage: payload.messageContent.trim(), createdAt: now });
      const updateResult = await messages.updateOne(
        { _id: id, deletedAt: { $exists: false } },
        { $set: { messageContent: payload.messageContent.trim(), editedAt: now, editedByUid: uid, updatedAt: now } }
      );
      if (!updateResult.matchedCount) return { status: 409, body: { error: "Message changed before the edit could be saved" } };
      return { status: 200, body: { ...message, messageContent: payload.messageContent.trim(), editedAt: now, editedByUid: uid } };
    } catch { return { status: 503, body: { error: "Unable to edit chat message" } }; }
  }

  async deleteChatMessage(uid, messageId) {
    if (typeof messageId !== "string" || !/^[a-fA-F0-9]{24}$/.test(messageId)) return { status: 400, body: { error: "Invalid message ID" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const { ObjectId } = await import("mongodb");
      const actor = await db.collection("users").findOne({ uid }, { projection: {
        role: 1, accountStatus: 1, suspendedUntil: 1, deletionRequestedAt: 1
      } });
      if (!actor) return { status: 404, body: { error: "User not found" } };
      const isAdmin = ["admin", "superadmin"].includes(actor.role);
      if (!isAdmin && isAccountRestricted(actor)) return { status: 403, body: { error: "Messaging is unavailable for this account" } };
      const messages = db.collection("chatmessages");
      const id = new ObjectId(messageId);
      const message = await messages.findOne({ _id: id });
      if (!message || message.deletedAt) return { status: 404, body: { error: "Message not found" } };
      if (!isAdmin && message.senderUid !== uid) return { status: 403, body: { error: "You can only delete your own messages" } };
      if (!isAdmin && await this.isChatPairUnavailable(db, uid, message.roomId)) {
        return { status: 403, body: { error: "This conversation is no longer available" } };
      }
      if (!isAdmin && Date.now() - new Date(message.timestamp).getTime() > 60 * 60 * 1000) return { status: 403, body: { error: "Messages can only be deleted within one hour of sending" } };
      const now = new Date();
      await db.collection("auditlogs").insertOne({ eventType: "chat_message_deleted", actorUid: uid, actorType: isAdmin ? "admin" : "customer", messageId: id, roomId: message.roomId, previousMessage: message.messageContent, createdAt: now });
      const updateResult = await messages.updateOne(
        { _id: id, deletedAt: { $exists: false } },
        { $set: { messageContent: "This message was deleted.", deletedAt: now, deletedByUid: uid, updatedAt: now } }
      );
      if (!updateResult.matchedCount) return { status: 409, body: { error: "Message changed before deletion could be saved" } };
      return {
        status: 200,
        body: {
          success: true,
          messageId,
          message: { ...message, messageContent: "This message was deleted.", deletedAt: now, deletedByUid: uid }
        }
      };
    } catch { return { status: 503, body: { error: "Unable to delete chat message" } }; }
  }


  async submitPhotoVerification(uid, payload) {
    if (typeof uid !== "string" || !uid || !payload || payload.consent !== true ||
        typeof payload.videoBase64 !== "string" || payload.videoBase64.length < 1000 ||
        payload.videoBase64.length > 4_500_000 ||
        !["video/webm", "video/mp4"].includes(payload.mimeType) ||
        !["turn_left", "turn_right", "smile", "look_up"].includes(payload.challenge)) {
      return { status: 400, body: { error: "A valid consented selfie video and challenge are required." } };
    }
    const secret = String(this.env.VERIFICATION_ENCRYPTION_KEY || "");
    if (!/^[a-f0-9]{64}$/i.test(secret)) {
      return { status: 503, body: { error: "Photo verification is not configured securely. Please contact support." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const user = await users.findOne({ uid }, { projection: { uid: 1, isVerified: 1, photos: 1 } });
      if (!user) return { status: 404, body: { error: "User not found." } };
      if (!Array.isArray(user.photos) || user.photos.length === 0) return { status: 400, body: { error: "Add at least one profile photo before requesting verification." } };
      if (user.isVerified === true) return { status: 409, body: { error: "Your profile is already verified." } };
      const verifications = db.collection("photoVerifications");
      if (typeof verifications.createIndex === "function") {
        await verifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "photo_verification_ttl" });
      }
      const pending = await verifications.findOne({ uid, status: "pending_review" }, { projection: { _id: 1 } });
      if (pending) return { status: 409, body: { error: "You already have a verification waiting for review." } };
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.videoBase64)) return { status: 400, body: { error: "Invalid video encoding." } };
      const binary = Uint8Array.from(atob(payload.videoBase64), char => char.charCodeAt(0));
      if (binary.byteLength > 3_145_728) return { status: 413, body: { error: "Verification video must be 3 MB or smaller." } };
      // Browser inference is an untrusted advisory signal. Never use it to approve or reject.
      const clientAssessment = payload.clientAssessment && typeof payload.clientAssessment === "object"
        ? payload.clientAssessment : {};
      const safeCount = value => Number.isInteger(value) && value >= 0 ? Math.min(value, 10) : 0;
      const candidateDistance = clientAssessment.bestDistance;
      const framesAnalyzed = safeCount(clientAssessment.framesAnalyzed);
      const framesWithFace = Math.min(safeCount(clientAssessment.framesWithFace), framesAnalyzed);
      const profilePhotosCompared = Math.min(safeCount(clientAssessment.profilePhotosCompared), 6);
      const hasAssessment = clientAssessment.status === "assessed" && framesAnalyzed > 0 &&
        framesWithFace > 0 && profilePhotosCompared > 0 && typeof candidateDistance === "number" &&
        Number.isFinite(candidateDistance) && candidateDistance >= 0 && candidateDistance <= 2;
      const automatedAssessment = {
        engine: "@vladmandic/face-api",
        engineVersion: "1.7.15",
        source: "user_browser_untrusted",
        status: hasAssessment ? "client_assessed" : "unavailable",
        framesAnalyzed,
        framesWithFace,
        profilePhotosCompared,
        bestDistance: hasAssessment ? candidateDistance : null,
        challengeAssessment: "not_verified",
        livenessAssessment: "not_verified",
        assessedAt: new Date()
      };
      const keyBytes = Uint8Array.from(secret.match(/.{2}/g), pair => parseInt(pair, 16));
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(uid) }, key, binary);
      const base64 = bytes => { const view = new Uint8Array(bytes); let binary = ""; for (let offset = 0; offset < view.length; offset += 0x8000) binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000)); return btoa(binary); };
      const now = new Date();
      const document = {
        uid, status: "pending_review", challenge: payload.challenge, mimeType: payload.mimeType,
        automatedAssessment,
        encryptedVideo: base64(ciphertext), iv: base64(iv), encryption: "AES-256-GCM",
        consentedAt: now, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      };
      const result = await verifications.insertOne(document);
      return { status: 201, body: { success: true, verificationId: String(result.insertedId), status: document.status } };
    } catch (error) {
      console.error("Photo verification submission failed", { message: String(error?.message || error).slice(0, 180) });
      return { status: 503, body: { error: "Could not submit photo verification." } };
    }
  }

  async withdrawPhotoVerification(uid) {
    try {
      const db = this.getDatabase(await this.getClient());
      const result = await db.collection("photoVerifications").deleteMany({ uid, status: "pending_review" });
      return { status: 200, body: { success: true, withdrawn: result.deletedCount > 0 } };
    } catch {
      return { status: 503, body: { error: "Could not withdraw the verification request." } };
    }
  }

  async getPhotoVerificationStatus(uid) {
    try {
      const db = this.getDatabase(await this.getClient());
      const record = await db.collection("photoVerifications").findOne(
        { uid }, { sort: { createdAt: -1 }, projection: { status: 1, createdAt: 1, reviewedAt: 1, reviewReason: 1 } }
      );
      return { status: 200, body: record ? {
        status: record.status, submittedAt: record.createdAt, reviewedAt: record.reviewedAt || null,
        reviewReason: record.reviewReason || null
      } : { status: "not_submitted" } };
    } catch {
      return { status: 503, body: { error: "Verification status is unavailable." } };
    }
  }

  async listPhotoVerificationsForAdmin(uid) {
    try {
      const db = this.getDatabase(await this.getClient());
      const admin = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
      if (!admin || admin.role !== "superadmin") return { status: 403, body: { error: "Superadmin access is required." } };
      const records = await db.collection("photoVerifications").find(
        { status: "pending_review" },
        { projection: { encryptedVideo: 0, iv: 0 } }
      ).sort({ createdAt: 1 }).limit(50).toArray();
      const uids = [...new Set(records.map(item => item.uid))];
      const users = uids.length ? await db.collection("users").find(
        { uid: { $in: uids } }, { projection: { uid: 1, name: 1, photos: 1, age: 1, isVerified: 1 } }
      ).toArray() : [];
      const byUid = new Map(users.map(user => [user.uid, user]));
      return { status: 200, body: records.map(item => ({
        id: String(item._id), uid: item.uid, challenge: item.challenge, mimeType: item.mimeType,
        createdAt: item.createdAt, automatedAssessment: item.automatedAssessment || null, user: byUid.get(item.uid) || null
      })) };
    } catch {
      return { status: 503, body: { error: "Verification queue is unavailable." } };
    }
  }

  async getPhotoVerificationEvidenceForAdmin(uid, verificationId) {
    try {
      const db = this.getDatabase(await this.getClient());
      const admin = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
      if (!admin || admin.role !== "superadmin") return { status: 403, body: { error: "Superadmin access is required." } };
      const { ObjectId } = await import("mongodb");
      if (!/^[a-f0-9]{24}$/i.test(String(verificationId))) return { status: 400, body: { error: "Invalid verification ID." } };
      const record = await db.collection("photoVerifications").findOne({ _id: new ObjectId(verificationId), status: "pending_review" });
      if (!record) return { status: 404, body: { error: "Pending verification not found." } };
      const secret = String(this.env.VERIFICATION_ENCRYPTION_KEY || "");
      if (!/^[a-f0-9]{64}$/i.test(secret)) return { status: 503, body: { error: "Verification decryption is not configured." } };
      const keyBytes = Uint8Array.from(secret.match(/.{2}/g), pair => parseInt(pair, 16));
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
      const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(record.iv), additionalData: new TextEncoder().encode(record.uid) }, key, fromBase64(record.encryptedVideo));
      const clearBytes = new Uint8Array(clear);
      let binary = "";
      for (let offset = 0; offset < clearBytes.length; offset += 0x8000) binary += String.fromCharCode(...clearBytes.subarray(offset, offset + 0x8000));
      const base64 = btoa(binary);
      const user = await db.collection("users").findOne({ uid: record.uid }, { projection: { uid: 1, name: 1, photos: 1, age: 1 } });
      return { status: 200, body: { id: String(record._id), uid: record.uid, challenge: record.challenge, mimeType: record.mimeType, videoBase64: base64, user } };
    } catch {
      return { status: 503, body: { error: "Verification evidence could not be decrypted." } };
    }
  }

  async reviewPhotoVerification(uid, verificationId, payload) {
    if (!["approve", "reject"].includes(payload?.action)) return { status: 400, body: { error: "Choose approve or reject." } };
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
    if (payload.action === "reject" && reason.length < 5) return { status: 400, body: { error: "A rejection reason of at least 5 characters is required." } };
    try {
      const db = this.getDatabase(await this.getClient());
      const admin = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
      if (!admin || admin.role !== "superadmin") return { status: 403, body: { error: "Superadmin access is required." } };
      const { ObjectId } = await import("mongodb");
      if (!/^[a-f0-9]{24}$/i.test(String(verificationId))) return { status: 400, body: { error: "Invalid verification ID." } };
      const collection = db.collection("photoVerifications");
      const record = await collection.findOne({ _id: new ObjectId(verificationId), status: "pending_review" }, { projection: { uid: 1 } });
      if (!record) return { status: 404, body: { error: "Pending verification not found or already reviewed." } };
      if (payload.action === "approve") {
        const targetUser = await db.collection("users").findOne({ uid: record.uid }, { projection: { photos: 1 } });
        if (!Array.isArray(targetUser?.photos) || targetUser.photos.length === 0) {
          return { status: 409, body: { error: "The user must have at least one profile photo before verification can be approved." } };
        }
      }
      const now = new Date();
      const result = await collection.updateOne(
        { _id: new ObjectId(verificationId), status: "pending_review" },
        { $set: { status: payload.action === "approve" ? "approved" : "rejected", reviewedAt: now, reviewedBy: uid, reviewReason: reason }, $unset: { encryptedVideo: "", iv: "" } }
      );
      if (!result.modifiedCount) return { status: 409, body: { error: "This verification was already reviewed." } };
      if (payload.action === "approve") {
        await db.collection("users").updateOne(
          { uid: record.uid },
          { $set: { isVerified: true, faceVerified: true, verifiedAt: now, updatedAt: now } }
        );
      }
      return { status: 200, body: { success: true, status: payload.action === "approve" ? "approved" : "rejected" } };
    } catch {
      return { status: 503, body: { error: "Could not update verification review." } };
    }
  }


  async savePushSubscription(uid, subscription) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        !subscription || typeof subscription !== "object" || Array.isArray(subscription) ||
        typeof subscription.endpoint !== "string" || subscription.endpoint.length > 2048 ||
        !subscription.keys || typeof subscription.keys !== "object" || Array.isArray(subscription.keys) ||
        typeof subscription.keys.p256dh !== "string" || typeof subscription.keys.auth !== "string" ||
        (subscription.expirationTime !== undefined && subscription.expirationTime !== null &&
          (typeof subscription.expirationTime !== "number" || !Number.isFinite(subscription.expirationTime) ||
            subscription.expirationTime <= Date.now()))) {
      return { status: 400, body: { error: "Invalid push subscription" } };
    }
    let endpoint;
    try { endpoint = new URL(subscription.endpoint); }
    catch { return { status: 400, body: { error: "Invalid push endpoint" } }; }
    const host = endpoint.hostname.toLowerCase();
    const allowedHost = host === "fcm.googleapis.com" || host === "web.push.apple.com" ||
      host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".notify.windows.com");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port ||
        !allowedHost || !/^[A-Za-z0-9_-]{80,120}$/.test(subscription.keys.p256dh) ||
        !/^[A-Za-z0-9_-]{20,40}$/.test(subscription.keys.auth)) {
      return { status: 400, body: { error: "Unsupported or invalid push subscription" } };
    }
    try {
      const collection = this.getDatabase(await this.getClient()).collection("pushSubscriptions");
      await collection.updateOne(
        { uid, endpoint: endpoint.toString() },
        { $set: { uid, endpoint: endpoint.toString(), expirationTime: subscription.expirationTime || null,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      return { status: 201, body: { success: true } };
    } catch { return { status: 503, body: { error: "Could not save push subscription" } }; }
  }

  async removePushSubscription(uid, endpointValue) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        typeof endpointValue !== "string" || endpointValue.length > 2048) {
      return { status: 400, body: { error: "Invalid push subscription" } };
    }
    try {
      const endpoint = new URL(endpointValue);
      const result = await this.getDatabase(await this.getClient()).collection("pushSubscriptions")
        .deleteOne({ uid, endpoint: endpoint.toString() });
      return { status: 200, body: { success: true, removed: result.deletedCount > 0 } };
    } catch { return { status: 503, body: { error: "Could not remove push subscription" } }; }
  }

  async getPushSubscriptions(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const pushSubscriptions = db.collection("pushSubscriptions");
      const now = Date.now();
      // Browser subscriptions can expire without sending a final 404/410.
      // Prune them before selecting delivery targets to avoid repeated failures.
      await pushSubscriptions.deleteMany({ uid, expirationTime: { $ne: null, $lte: now } });
      const [subscriptions, user] = await Promise.all([
        pushSubscriptions.find({ uid, $or: [{ expirationTime: null }, { expirationTime: { $gt: now } }] })
          .sort({ updatedAt: -1 }).limit(10).toArray(),
        db.collection("users").findOne({ uid }, { projection: { notificationPreferences: 1, _id: 0 } })
      ]);
      if (!user) return { status: 404, body: { error: "User not found" } };
      return { status: 200, body: {
        subscriptions: subscriptions.map(item => ({ endpoint: item.endpoint, expirationTime: item.expirationTime || null, keys: item.keys })),
        preferences: this.normalizeNotificationPreferences(user.notificationPreferences)
      } };
    } catch { return { status: 503, body: { error: "Push subscriptions unavailable" } }; }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    // All authenticated Durable Object operations pass this account-state gate.
    // Cloning preserves the request body for the route handler below.
    const guardBody = await request.clone().json().catch(() => null);
    const authenticatedUid = guardBody?.claims?.sub;
    if (typeof authenticatedUid === "string" && authenticatedUid && guardBody?.claims?.role !== "superadmin") {
      // Enforce verified email and account restrictions centrally so a
      // suspended or unverified identity cannot use a less restrictive route.
      // Firebase phone sign-in proves control of a phone number rather than an
      // email address. It is therefore allowed only for an already-provisioned
      // account; phone sign-in must not create a new profile implicitly.
      const claims = guardBody.claims;
      const phoneSignIn = claims.firebase?.sign_in_provider === "phone" &&
        typeof claims.phone_number === "string" &&
        /^\+[1-9][0-9]{7,14}$/.test(claims.phone_number);
      if (claims.email_verified !== true && !phoneSignIn) {
        return json({ error: "Email verification is required to use this service." }, 403);
      }
      try {
        const account = await this.getDatabase(await this.getClient()).collection("users").findOne(
          { uid: authenticatedUid },
          { projection: { accountStatus: 1, deletionRequestedAt: 1, suspendedUntil: 1 } }
        );
        if (phoneSignIn && !account) {
          return json({ error: "Phone sign-in is available only for existing accounts." }, 403);
        }
        // Restricted users may still retrieve their own portable account data.
        // All other account operations continue to fail closed.
        if (account && isAccountRestricted(account) && url.pathname !== "/internal/user-data-export") {
          return json({ error: "This account is unavailable." }, 403);
        }
      } catch {
        return json({ error: "Account status could not be verified." }, 503);
      }
    }

    if (url.pathname === "/internal/scheduled-expirations") {
      const body = await request.json().catch(() => ({}));
      const scope = body && body.scope ? body.scope : "all";
      if (!["all", "trials", "subscriptions"].includes(scope)) return json({ error: "Invalid expiration scope" }, 400);
      const result = await this.runScheduledExpirations(new Date(), scope);
      return json(result);
    }

    if (url.pathname.startsWith("/internal/dark-fantasy/communities/")) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Unauthorized" }, 401);
      const action = url.pathname.split("/").pop();
      if (!["list", "detail", "join", "posts", "create-post", "comment", "reaction", "decision", "requests"].includes(action)) return json({ error: "Not found" }, 404);
      const result = await this.secretCommunityAction(body.claims.sub, action, { ...body, claimsRole: body.claims.role });
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/dark-fantasy/status" ||
        url.pathname === "/internal/dark-fantasy/profile" ||
        url.pathname === "/internal/dark-fantasy/discover") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Unauthorized" }, 401);
      let result;
      if (url.pathname === "/internal/dark-fantasy/status") result = await this.getDarkFantasyStatus(body.claims.sub);
      else if (url.pathname === "/internal/dark-fantasy/discover") result = await this.discoverDarkFantasy(body.claims.sub);
      else if (body.action === "save") result = await this.saveDarkFantasyProfile(body.claims.sub, body.payload || {});
      else if (body.action === "delete") result = await this.deleteDarkFantasyProfile(body.claims.sub);
      else result = await this.getDarkFantasyProfile(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/create-video-room-ticket") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.roomId !== "string") return json({ error: "Invalid request" }, 400);
      const result = await this.createPendingVideoRoomTicket(body.claims.sub, body.roomId);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/create-purchase" || url.pathname === "/internal/create-subscription") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      const result = url.pathname === "/internal/create-purchase"
        ? await this.createPendingPurchase(body.claims.sub, body.itemId)
        : await this.createPendingSubscription(body.claims.sub, body.plan);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/subscription-abandon") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.orderId !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.abandonPendingSubscription(body.claims.sub, body.orderId);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/webxpay-settle") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.orderId !== "string" || typeof body.statusCode !== "string") return json({ error: "Invalid request" }, 400);
      if (typeof body.reference !== "string" || !body.reference || body.reference.length > 128 ||
          typeof body.transactionDate !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(body.transactionDate) || !Number.isFinite(Date.parse(body.transactionDate)) ||
          typeof body.gatewayId !== "string" || !body.gatewayId || body.gatewayId.length > 32 ||
          typeof body.gatewayComment !== "string" || body.gatewayComment.length > 256) {
        return json({ error: "Invalid gateway transaction metadata" }, 400);
      }
      const result = await this.settleWebXPay(body.orderId, body.statusCode, body.reference, {
        transactionDate: body.transactionDate,
        gatewayId: body.gatewayId,
        gatewayComment: body.gatewayComment
      });
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/superadmin-provision") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.email !== "string") return json({ error: "Invalid request" }, 400);
      const result = await this.ensureSuperadminUser(body.email);
      return json(result.body, result.status);
    }


    if (url.pathname.startsWith("/internal/video-rooms/")) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      const action = url.pathname.slice("/internal/video-rooms/".length);
      const result = await this.handleVideoRooms(body.claims.sub, action, body.roomId, body.payload || {});
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/calls/start" ||
        url.pathname === "/internal/calls/poll" ||
        url.pathname === "/internal/calls/history" ||
        url.pathname === "/internal/calls/incoming" ||
        url.pathname === "/internal/calls/signal" ||
        url.pathname === "/internal/calls/action") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/calls/start") result = await this.createCall(body.claims.sub, body.payload);
      else if (url.pathname === "/internal/calls/poll") result = await this.getCallState(body.claims.sub, body.roomId);
      else if (url.pathname === "/internal/calls/history") result = await this.getCallHistory(body.claims.sub, body.roomId);
      else if (url.pathname === "/internal/calls/incoming") result = await this.getIncomingCall(body.claims.sub);
      else if (url.pathname === "/internal/calls/signal") result = await this.sendCallSignal(body.claims.sub, body.payload);
      else result = await this.updateCall(body.claims.sub, body.payload);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/chat/history" ||
        url.pathname === "/internal/chat/conversations" ||
        url.pathname === "/internal/chat/send" ||
        url.pathname === "/internal/chat/rollback" ||
        url.pathname === "/internal/chat/message-edit" ||
        url.pathname === "/internal/chat/message-delete" ||
        url.pathname === "/internal/chat/typing-read" ||
        url.pathname === "/internal/chat/typing-write" ||
        url.pathname === "/internal/chat/delivered" ||
        url.pathname === "/internal/chat/read") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/chat/history") {
        result = await this.getChatHistory(body.claims.sub, body.roomId, body.limit, body.skip, body.after || null, body.before || null);
      } else if (url.pathname === "/internal/chat/conversations") {
        result = await this.getChatConversations(body.claims.sub);
      } else if (url.pathname === "/internal/chat/send") {
        result = await this.createChatMessage(body.claims.sub, body.payload);
      } else if (url.pathname === "/internal/chat/typing-read") {
        result = await this.getTypingStatus(body.claims.sub, body.roomId);
      } else if (url.pathname === "/internal/chat/typing-write") {
        result = await this.updateTypingStatus(body.claims.sub, body.payload);
      } else if (url.pathname === "/internal/chat/delivered") {
        result = await this.markChatDelivered(body.claims.sub, body.payload);
      } else if (url.pathname === "/internal/chat/read") {
        result = await this.markChatRead(body.claims.sub, body.payload);
      } else if (url.pathname === "/internal/chat/message-edit") {
        result = await this.updateChatMessage(body.claims.sub, body.messageId, body.payload || {});
      } else if (url.pathname === "/internal/chat/message-delete" || url.pathname === "/internal/chat/rollback") {
        result = await this.deleteChatMessage(body.claims.sub, body.messageId);
      } else {
        result = await this.deleteChatMessage(body.claims.sub, body.messageId);
      }
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/photo-verification/submit" ||
        url.pathname === "/internal/photo-verification/status" ||
        url.pathname === "/internal/photo-verification/withdraw" ||
        url.pathname === "/internal/admin/photo-verifications" ||
        url.pathname.startsWith("/internal/admin/photo-verification/")) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      const uid = body.claims.sub;
      let result;
      if (url.pathname === "/internal/photo-verification/submit") result = await this.submitPhotoVerification(uid, body.payload);
      else if (url.pathname === "/internal/photo-verification/status") result = await this.getPhotoVerificationStatus(uid);
      else if (url.pathname === "/internal/photo-verification/withdraw") result = await this.withdrawPhotoVerification(uid);
      else if (url.pathname === "/internal/admin/photo-verifications") result = await this.listPhotoVerificationsForAdmin(uid);
      else {
        const match = url.pathname.match(/^\/internal\/admin\/photo-verification\/([a-f0-9]{24})(?:\/(evidence|action))?$/i);
        if (!match) return json({ error: "Not found" }, 404);
        result = match[2] === "evidence"
          ? await this.getPhotoVerificationEvidenceForAdmin(uid, match[1])
          : await this.reviewPhotoVerification(uid, match[1], body.payload || {});
      }
      return json(result.body, result.status);
    }


    if (url.pathname.startsWith("/internal/push/")) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/push/subscribe") result = await this.savePushSubscription(body.claims.sub, body.subscription);
      else if (url.pathname === "/internal/push/unsubscribe") result = await this.removePushSubscription(body.targetUid || body.claims.sub, body.endpoint);
      else if (url.pathname === "/internal/push/subscriptions" && typeof body.targetUid === "string") result = await this.getPushSubscriptions(body.targetUid);
      else return json({ error: "Not found" }, 404);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/ping") {
      const result = await this.ping();
      return json({ status: result.ok ? "ok" : "unavailable" }, result.ok ? 200 : 503);
    }




    if (url.pathname === "/internal/photo-upload" || url.pathname === "/internal/photo-delete" || url.pathname === "/internal/photo-delete-finalize") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ message: "Invalid request" }, 400);
      const result = url.pathname === "/internal/photo-upload"
        ? await this.addUploadedPhoto(body.claims.sub, body.photo)
        : url.pathname === "/internal/photo-delete-finalize"
          ? await this.finalizeUploadedPhotoDeletion(body.claims.sub, body.key)
          : await this.removeUploadedPhoto(body.claims.sub, body.key);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/photo-order") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || !Array.isArray(body.photos)) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.updatePhotoOrder(body.claims.sub, body.photos);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/unmatch") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.targetUid !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.unmatchUsers(body.claims.sub, body.targetUid);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/block") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          typeof body.targetUid !== "string" || typeof body.action !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.updateBlockedUser(body.claims.sub, body.targetUid, body.action);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/set-initial-password") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.newPassword !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.setInitialPassword(body.claims.sub, body.newPassword);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/undo-swipe") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.undoSwipe(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/swipe") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          typeof body.targetUid !== "string" || !["like", "pass", "superlike"].includes(body.action) ||
          (body.canonical !== undefined && typeof body.canonical !== "boolean")) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.recordSwipe(body.claims.sub, body.targetUid, body.action, body.canonical === true);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/notification-preferences") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = body.preferences === null || body.preferences === undefined
        ? await this.getNotificationPreferences(body.claims.sub)
        : await this.updateNotificationPreferences(body.claims.sub, body.preferences);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/notifications") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getNotifications(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/potential-matches") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          !body.filters || typeof body.filters !== "object" || Array.isArray(body.filters)) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getPotentialMatches(body.claims.sub, body.filters);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/confirmed-matches") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getConfirmedMatches(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/discover") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          !body.filters || typeof body.filters !== "object" || Array.isArray(body.filters)) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.discoverUsers(body.claims.sub, body.filters);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/subscriptions") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getSubscriptionHistory(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/likes") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getLikes(body.claims.sub);
      return json(result.body, result.status);
    }

    if ([
      "/internal/admin/support-tickets", "/internal/admin/support-ticket",
      "/internal/admin/support-ticket-message", "/internal/admin/support-ticket-message-edit",
      "/internal/admin/support-ticket-message-delete", "/internal/admin/support-ticket-status"
    ].includes(url.pathname)) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ message: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/admin/support-tickets") result = await this.getAdminSupportTickets(body.claims.sub, body.params || {});
      else if (url.pathname === "/internal/admin/support-ticket") result = await this.getAdminSupportTicket(body.claims.sub, body.ticketId);
      else if (url.pathname === "/internal/admin/support-ticket-message") result = await this.addAdminSupportMessage(body.claims.sub, body.ticketId, body.payload || {});
      else if (url.pathname === "/internal/admin/support-ticket-message-edit") result = await this.updateSupportTicketMessage(body.claims.sub, body.ticketId, body.messageId, body.payload || {}, true);
      else if (url.pathname === "/internal/admin/support-ticket-message-delete") result = await this.deleteSupportTicketMessage(body.claims.sub, body.ticketId, body.messageId, true);
      else result = await this.updateAdminSupportStatus(body.claims.sub, body.ticketId, body.payload || {});
      return json(result.body, result.status);
    }

    if (url.pathname.startsWith("/internal/admin/") && [
      "/internal/admin/users", "/internal/admin/user", "/internal/admin/stats",
      "/internal/admin/transactions", "/internal/admin/payment-reconciliation", "/internal/admin/analytics", "/internal/admin/user-create",
      "/internal/admin/user-update", "/internal/admin/user-delete", "/internal/admin/user-plan",
      "/internal/admin/user-deletion-assets", "/internal/admin/user-deletion-assets-finalize",
      "/internal/admin/payment-logs", "/internal/admin/login-history", "/internal/admin/audit-logs",
      "/internal/admin/purchases", "/internal/admin/purchase-action"
    ].includes(url.pathname)) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ message: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/admin/users") result = await this.getAdminUsers(body.claims.sub, body.params || {});
      else if (url.pathname === "/internal/admin/user") result = await this.getAdminUser(body.claims.sub, body.userId);
      else if (url.pathname === "/internal/admin/user-create") result = await this.createAdminUser(body.claims.sub, body.payload || {});
      else if (url.pathname === "/internal/admin/user-update") result = await this.updateAdminUser(body.claims.sub, body.userId, body.payload || {});
      else if (url.pathname === "/internal/admin/user-delete") result = await this.deleteAdminUser(body.claims.sub, body.userId);
      else if (url.pathname === "/internal/admin/user-deletion-assets") result = await this.getAdminUserDeletionAssets(body.claims.sub, body.userId);
      else if (url.pathname === "/internal/admin/user-deletion-assets-finalize") result = await this.finalizeAdminUserDeletionAssets(body.claims.sub, body.userId, body.deletedKeys);
      else if (url.pathname === "/internal/admin/user-deletion-anonymize") result = await this.finalizeAdminUserAnonymization(body.claims.sub, body.userId);
      else if (url.pathname === "/internal/admin/user-plan") result = await this.updateAdminUserPlan(body.claims.sub, body.userId, body.payload || {});
      else if (url.pathname === "/internal/admin/stats") result = await this.getAdminDashboardStats(body.claims.sub);
      else if (url.pathname === "/internal/admin/transactions") result = await this.getAdminTransactions(body.claims.sub);
      else if (url.pathname === "/internal/admin/payment-reconciliation") result = await this.getAdminPaymentReconciliation(body.claims.sub);
      else if (url.pathname === "/internal/admin/payment-logs") result = await this.getAdminLogs(body.claims.sub, "payment", body.search || "");
      else if (url.pathname === "/internal/admin/login-history") result = await this.getAdminLogs(body.claims.sub, "login", body.search || "");
      else if (url.pathname === "/internal/admin/audit-logs") result = await this.getAdminLogs(body.claims.sub, "audit", body.search || "");
      else if (url.pathname === "/internal/admin/purchases") result = await this.getAdminPurchases(body.claims.sub, body.status || "all");
      else if (url.pathname === "/internal/admin/purchase-action") {
        result = body.action === "record-refund"
          ? await this.recordAdminRefund(body.claims.sub, body.purchaseId, body.transactionType, body.refundReference, body.note || "")
          : { status: 404, body: { message: "Unsupported payment action" } };
      }
      else result = await this.getAdminAnalyticsSummary(body.claims.sub, body.params || {});
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/admin/reports" || url.pathname === "/internal/admin/report" || url.pathname === "/internal/admin/report-action") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ message: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/admin/reports") {
        result = await this.getAdminReports(body.claims.sub, body.params || {});
      } else if (url.pathname === "/internal/admin/report") {
        result = await this.getAdminReport(body.claims.sub, body.reportId);
      } else {
        result = await this.moderateReport(body.claims.sub, body.reportId, body.payload || {});
      }
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/purchase-status" || url.pathname === "/internal/subscription-status") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.id !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = url.pathname === "/internal/purchase-status"
        ? await this.getPurchaseStatus(body.claims.sub, body.id)
        : await this.getSubscriptionStatus(body.claims.sub, body.id);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/support-tickets") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || !["GET", "POST"].includes(body.action)) {
        return json({ message: "Invalid request" }, 400);
      }
      const result = body.action === "GET"
        ? await this.getSupportTickets(body.claims.sub)
        : await this.createSupportTicket(body.claims.sub, body.payload);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/support-ticket") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.ticketId !== "string") {
        return json({ message: "Invalid request" }, 400);
      }
      const result = await this.getSupportTicket(body.claims.sub, body.ticketId);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/support-ticket-feedback") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.ticketId !== "string") {
        return json({ message: "Invalid request" }, 400);
      }
      const result = await this.submitSupportTicketFeedback(body.claims.sub, body.ticketId, body.payload);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/support-ticket-message-edit" || url.pathname === "/internal/support-ticket-message-delete") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.ticketId !== "string" || typeof body.messageId !== "string") {
        return json({ message: "Invalid request" }, 400);
      }
      const result = url.pathname.endsWith("-edit")
        ? await this.updateSupportTicketMessage(body.claims.sub, body.ticketId, body.messageId, body.payload || {}, false)
        : await this.deleteSupportTicketMessage(body.claims.sub, body.ticketId, body.messageId, false);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/support-ticket-message") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.ticketId !== "string") {
        return json({ message: "Invalid request" }, 400);
      }
      const result = await this.addSupportTicketMessage(body.claims.sub, body.ticketId, body.payload);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/create-report") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || !body.payload || typeof body.payload !== "object") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.createReport(body.claims.sub, body.payload);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/public-profile") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" || typeof body.targetUid !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getUserProfile(body.targetUid, body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/users/me/location") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          !["get", "save", "delete"].includes(body.action)) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = body.action === "get"
        ? await this.getUserLocationStatus(body.claims.sub)
        : body.action === "save"
          ? await this.saveUserLocation(body.claims.sub, body.payload)
          : await this.deleteUserLocation(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/users/me/partner-link") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          !["list", "invite", "accept", "decline", "revoke"].includes(body.action)) {
        return json({ error: "Invalid partner-link request" }, 400);
      }
      const result = await this.managePartnerLink(body.claims.sub, body.action, body.payload || {});
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/users/me/desires") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string" ||
          !["get", "save", "delete"].includes(body.action)) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = body.action === "get"
        ? await this.getRelationshipPreferences(body.claims.sub)
        : body.action === "save"
          ? await this.saveRelationshipPreferences(body.claims.sub, body.payload)
          : await this.deleteRelationshipPreferences(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/user-data-export") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.claims?.sub !== "string" || !body.claims.sub) {
        return json({ error: "Unauthorized" }, 401);
      }
      const result = await this.exportUserData(body.claims.sub);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/profile") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims !== "object") return json({ error: "Invalid request" }, 400);
      const provisioned = await this.findOrCreateUserFromClaims(body.claims);
      if (!provisioned.user) return json(provisioned.body, provisioned.status);
      if (body.update !== undefined) {
        const updated = await this.updateCurrentUserProfile(body.claims.sub, body.update);
        return json(updated.body, updated.status);
      }
      const result = await this.getCurrentUserProfile(body.claims.sub);
      return json(result.body, result.status);
    }

    return json({ error: "Not found" }, 404);
  }
}
