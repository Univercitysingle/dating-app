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
    "superLikedByCurrentUser"
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

function withTimeout(promise, timeoutMs, operation) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

export class MongoDBConnection {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clientPromise = null;
    this.discoveryMatchIndexesPromise = null;
    this.subscriptionIndexMigrationPromise = null;
  }

  async getClient() {
    if (!this.env.MONGODB_URI) {
      throw new Error("MongoDB configuration is missing");
    }

    if (!this.clientPromise) {
      this.clientPromise = import("mongodb").then(({ MongoClient }) => {
        const client = new MongoClient(this.env.MONGODB_URI, {
          maxPoolSize: 1,
          minPoolSize: 0,
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
          base.pathname = base.pathname.replace(/\/+$/, "") + "/" + encoded;
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
    if (!["all", "trials", "subscriptions"].includes(scope)) throw new Error("Invalid expiration scope");
    const db = this.getDatabase(await this.getClient());
    const subscriptions = db.collection("subscriptions");
    const users = db.collection("users");
    let expiredSubscriptions = 0;
    let expiredTrialsCount = 0;
    let downgradedUsers = 0;

    // Bounded batches keep each Cron invocation within Worker execution limits.
    if (scope !== "trials") {
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
    if (scope !== "subscriptions") {
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
      if (existingByUid) return { status: 200, user: existingByUid };

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
      const user = await users.findOne({ uid }, { projection: { photos: 1 } });
      if (!user) return { status: 404, body: { message: "User not found" } };
      const photo = (user.photos || []).find(item => item.url === key);
      if (!photo) return { status: 404, body: { message: "Photo not found in profile" } };
      if ((user.photos || []).length <= 1) return { status: 400, body: { message: "You must have at least one photo." } };
      const size = Number.isFinite(photo.size) && photo.size > 0 ? photo.size : 0;
      const result = await users.updateOne(
        { uid, "photos.url": key, "photos.1": { $exists: true } },
        { $pull: { photos: { url: key } }, $inc: { totalPhotoSize: -size }, $set: { updatedAt: new Date() } }
      );
      if (!result.modifiedCount) return { status: 409, body: { message: "Photo list changed; refresh and retry" } };
      return { status: 200, body: { message: "Photo deleted successfully" } };
    } catch {
      return { status: 503, body: { message: "Photo metadata service unavailable" } };
    }
  }

  async updatePhotoOrder(uid, photos) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    if (!Array.isArray(photos)) return { status: 400, body: { error: "Invalid payload. 'photos' must be an array." } };
    if (photos.length > 6) return { status: 400, body: { error: "A maximum of 6 photos is allowed." } };
    const normalized = [];
    for (const photo of photos) {
      if (!photo || typeof photo !== "object" || Array.isArray(photo) ||
          typeof photo.url !== "string" || !photo.url || photo.url.length > 2048) {
        return { status: 400, body: { error: "Invalid photo entry." } };
      }
      const item = { url: photo.url };
      if (typeof photo.order === "number" && Number.isFinite(photo.order)) item.order = photo.order;
      if (typeof photo.size === "number" && Number.isFinite(photo.size) && photo.size >= 0) item.size = photo.size;
      if (typeof photo._id === "string" && /^[a-fA-F0-9]{24}$/.test(photo._id)) item._id = photo._id;
      normalized.push(item);
    }
    try {
      const users = this.getDatabase(await this.getClient()).collection("users");
      const result = await users.updateOne({ uid }, { $set: { photos: normalized } });
      if (!result.matchedCount) return { status: 404, body: { error: "User not found" } };
      return await this.getCurrentUserProfile(uid);
    } catch {
      return { status: 500, body: { error: "An unexpected error occurred while updating photo order." } };
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
        const current = await users.updateOne({ uid: currentUid }, { $addToSet: { blocked: targetUid } });
        if (!current.matchedCount) return { status: 404, body: { error: "Current user not found during update." } };
        const user1Uid = currentUid < targetUid ? currentUid : targetUid;
        const user2Uid = currentUid < targetUid ? targetUid : currentUid;
        await db.collection("matches").updateOne(
          { user1Uid, user2Uid },
          { $set: { status: "unmatched" }, $unset: { likedBy: "" } }
        );
        return { status: 200, body: { message: "User " + targetUid + " successfully blocked." } };
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
        users.findOne({ uid }, { projection: { blocked: 1, purchasedSuperLikes: 1, superLikes: 1 } }),
        users.findOne({ uid: targetUid }, { projection: { blocked: 1 } })
      ]);
      if (!currentUser) return { status: 404, body: { error: "Current user not found." } };
      if (!targetUser) return { status: 404, body: { error: "Target user not found." } };
      if (Array.isArray(currentUser.blocked) && currentUser.blocked.includes(targetUid)) {
        return { status: 403, body: { error: "You have blocked this user. Unblock them to swipe." } };
      }
      if (Array.isArray(targetUser.blocked) && targetUser.blocked.includes(uid)) {
        return { status: 403, body: { error: "This user has blocked you." } };
      }

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

      let match = await db.collection("matches").findOne({
        $or: [
          { user1Uid: uid, user2Uid: targetUid },
          { user1Uid: targetUid, user2Uid: uid }
        ]
      });
      const now = new Date();
      if (!match) {
        const user1Uid = canonical && uid > targetUid ? targetUid : uid;
        const user2Uid = canonical && uid > targetUid ? uid : targetUid;
        const inserted = await db.collection("matches").insertOne({
          user1Uid,
          user2Uid,
          status: action === "pass" ? "unmatched" : "pending",
          likedBy: action === "pass" ? [] : [uid],
          superLike: action === "superlike",
          createdAt: now,
          updatedAt: now
        });
        match = { _id: inserted.insertedId, user1Uid, user2Uid, status: action === "pass" ? "unmatched" : "pending", likedBy: action === "pass" ? [] : [uid], superLike: action === "superlike" };
      } else if (action === "like" || action === "superlike") {
        const update = { $addToSet: { likedBy: uid }, $set: { updatedAt: now } };
        if (action === "superlike") update.$set.superLike = true;
        await db.collection("matches").updateOne({ _id: match._id }, update);
        match = await db.collection("matches").findOne({ _id: match._id });
      } else {
        await db.collection("matches").updateOne({ _id: match._id }, { $set: { status: "unmatched", updatedAt: now } });
        match.status = "unmatched";
      }

      if (action === "like" || action === "superlike") {
        const likedBy = Array.isArray(match.likedBy) ? match.likedBy : [];
        const finalStatus = likedBy.includes(match.user1Uid) && likedBy.includes(match.user2Uid) ? "matched" : "pending";
        await db.collection("matches").updateOne({ _id: match._id }, { $set: { status: finalStatus, updatedAt: now } });
        match.status = finalStatus;
        const notificationType = finalStatus === "matched" ? "match" : action === "superlike" ? "superlike" : "like";
        await db.collection("notifications").insertOne({
          recipientUid: targetUid,
          senderUid: uid,
          type: notificationType,
          status: "pending",
          createdAt: now,
          updatedAt: now
        });
        if (finalStatus === "matched") {
          await db.collection("notifications").deleteOne({
            recipientUid: uid, senderUid: targetUid, type: { $in: ["like", "superlike"] }
          });
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
    } catch {
      return { status: 503, body: { error: "Swipe service unavailable" } };
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
    let phase = "connect-to-mongodb";
    try {
      const db = this.getDatabase(await this.getClient());
      phase = "load-current-user";
      const currentUser = await db.collection("users").findOne({ uid });
      if (!currentUser) return { status: 404, body: { error: "User not found" } };

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
        uid: { $ne: uid },
        isProfileVisible: true,
        blocked: { $ne: uid }
      };
      if (currentUser.preference && currentUser.preference !== "everyone") baseMatchQuery.gender = currentUser.preference;
      for (const key of ["sexualOrientation", "familyStatus", "relationshipGoals"]) {
        if (typeof filters[key] === "string" && filters[key].length <= 100) baseMatchQuery[key] = filters[key];
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
        Array.isArray(coordinates) && coordinates.length === 2 &&
        coordinates.every(Number.isFinite) &&
        coordinates[0] >= -180 && coordinates[0] <= 180 &&
        coordinates[1] >= -90 && coordinates[1] <= 90 &&
        !(coordinates[0] === 0 && coordinates[1] === 0);
      if (hasLocation) {
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
        {
          $facet: {
            boostedUsers: [
              { $match: { boostExpiresAt: { $gt: new Date() } } },
              { $limit: 10 }
            ],
            regularUsers: [
              { $match: { $or: [{ boostExpiresAt: { $lte: new Date() } }, { boostExpiresAt: { $exists: false } }] } },
              { $sort: { lastActiveAt: -1 } },
              { $limit: 20 }
            ]
          }
        },
        {
          $project: {
            combinedUsers: {
              $let: {
                vars: { boostedIds: { $map: { input: { $ifNull: ["$boostedUsers", []] }, as: "boostedUser", in: "$boostedUser.uid" } } },
                in: {
                  $concatArrays: [
                    "$boostedUsers",
                    {
                      $slice: [
                        {
                          $filter: {
                            input: "$regularUsers",
                            as: "regularUser",
                            cond: { $not: [{ $in: ["$regularUser.uid", { $ifNull: ["$boostedIds", []] }] }] }
                          }
                        },
                        { $max: [0, { $subtract: [20, { $size: "$boostedUsers" }] }] }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        { $unwind: "$combinedUsers" },
        { $replaceRoot: { newRoot: "$combinedUsers" } },
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
      for (const candidateUid of orderedUids) {
        const user = usersByUid.get(candidateUid);
        if (!user) continue;
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
        profile.superLikedByCurrentUser = superLikedBy.has(candidateUid);
        result.push(sanitizePublicProfile(profile));
      }
      return { status: 200, body: result };
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

  async createPendingPurchase(uid, itemId) {
    const prices = { "super-like-5": 500, "undo-swipes-5": 500, "profile-boost-1": 100 };
    const names = { "super-like-5": "5 Super Likes", "undo-swipes-5": "5 Undo Swipes", "profile-boost-1": "1 Profile Boost" };
    if (typeof uid !== "string" || !uid || uid.length > 128 || !Object.hasOwn(prices, itemId)) {
      return { status: 400, body: { error: "Invalid item ID." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found" } };
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

  async createPendingSubscription(uid, plan) {
    const prices = { weekly: 800, monthly: 3000, yearly: 10000 };
    if (typeof uid !== "string" || !uid || uid.length > 128 || !Object.hasOwn(prices, plan)) {
      return { status: 400, body: { error: "Invalid subscription plan." } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      // Atlas still has legacy unique indexes for both Stripe and PayHere
      // subscription IDs. A WebXPay pending record has neither provider ID, but
      // those indexes treat multiple nulls as duplicates. Do not require DDL
      // permissions at request time; use unique internal markers until settlement.
      const users = db.collection("users");
      const user = await users.findOne({ uid });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const active = await db.collection("subscriptions").findOne({
        userId: user._id,
        status: "active",
        endDate: { $gt: new Date() }
      }, { projection: { _id: 1 } });
      if (active) return { status: 409, body: { error: "You already have an active subscription." } };
      const now = new Date();
      const subscription = {
        userId: user._id,
        plan,
        status: "pending",
        // WebXPay does not issue Stripe or PayHere subscription IDs. Unique
        // internal markers prevent legacy unique indexes from colliding on null.
        stripeSubscriptionId: "webxpay-pending-" + crypto.randomUUID(),
        payhereSubscriptionId: "webxpay-pending-" + crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      };
      const inserted = await db.collection("subscriptions").insertOne(subscription);
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

  async settleWebXPay(orderId, statusCode, reference = "") {
    if (typeof orderId !== "string" || !/^[a-fA-F0-9]{24}$/.test(orderId) ||
        !["0", "00", "15"].includes(String(statusCode))) {
      return { status: 400, body: { error: "Invalid payment response" } };
    }
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
        const terminalStates = purchase ? ["completed", "rejected"] : ["active", "cancelled", "inactive"];
        if (terminalStates.includes(record.status)) {
          outcome = { status: 200, body: { success: true, message: "Payment already processed." } };
          return;
        }
        if (record.status !== "pending") {
          outcome = { status: 409, body: { error: "Transaction is no longer pending." } };
          return;
        }
        const now = new Date();
        const collection = purchase ? purchases : subscriptions;
        const nextStatus = success ? (purchase ? "completed" : "active") : (purchase ? "rejected" : "cancelled");
        const changed = await collection.updateOne(
          { _id: record._id, status: "pending" },
          { $set: { status: nextStatus, paymentReference: String(reference).slice(0, 128), updatedAt: now } },
          { session }
        );
        if (!changed.modifiedCount) {
          outcome = { status: 409, body: { error: "Transaction was already processed." } };
          throw new Error("PAYMENT_STATE_CHANGED");
        }
        if (!success) {
          outcome = { status: 200, body: { success: true, processed: false, status: "declined" } };
          return;
        }
        if (purchase) {
          const userUpdate = {};
          if (purchase.itemId === "super-like-5") userUpdate.$inc = { purchasedSuperLikes: 5 };
          else if (purchase.itemId === "undo-swipes-5") userUpdate.$inc = { purchasedUndoSwipes: 5 };
          else if (purchase.itemId === "profile-boost-1") userUpdate.$set = { boostExpiresAt: new Date(now.getTime() + 60 * 60 * 1000) };
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
      const currentUser = await db.collection("users").findOne({ uid }, { projection: { _id: 1, plan: 1, role: 1 } });
      if (!currentUser) return { status: 404, body: { error: "User not found" } };
      const matches = await db.collection("matches").find({ user2Uid: uid, status: "pending" }).toArray();
      if (matches.length === 0) return { status: 200, body: [] };
      const likedUids = [...new Set(matches.map(match => match.user1Uid).filter(value => typeof value === "string" && value.length > 0))];
      if (likedUids.length === 0) return { status: 200, body: [] };
      const users = await db.collection("users").find({ uid: { $in: likedUids } }).toArray();
      const usersByUid = new Map(users.map(user => [user.uid, user]));
      const matchByUid = new Map(matches.map(match => [match.user1Uid, match]));
      const isBlurred = currentUser.plan !== "premium";
      const result = [];
      for (const likedUid of likedUids) {
        const user = usersByUid.get(likedUid);
        if (!user) continue;
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
        const match = matchByUid.get(likedUid);
        const responseProfile = currentUser.role === "superadmin" ? profile : sanitizePublicProfile(profile);
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
      const allowedStatuses = ["pending_review", "under_investigation", "resolved_no_action", "resolved_warning_issued_to_reported_user", "resolved_reporter_notified", "resolved_content_removed", "resolved_user_suspended", "resolved_user_banned"];
      const query = {};
      if (typeof params.status === "string" && params.status) {
        if (!allowedStatuses.includes(params.status)) return { status: 400, body: { message: "Invalid report status." } };
        query.status = params.status;
      }
      const page = Number.isInteger(params.page) && params.page > 0 ? Math.min(params.page, 100000) : 1;
      const limit = Number.isInteger(params.limit) && params.limit > 0 ? Math.min(params.limit, 100) : 10;
      if (typeof params.search === "string" && params.search.trim()) {
        const term = params.search.trim().slice(0, 128);
        const matchingUsers = await db.collection("users").find({
          $or: [{ uid: term }, { email: term }]
        }, { projection: { uid: 1 } }).toArray();
        const matchingUids = matchingUsers.map(user => user.uid).filter(Boolean);
        if (!matchingUids.length) return { status: 200, body: { reports: [], totalPages: 0, currentPage: page } };
        query.reportedUserUid = { $in: matchingUids };
      }
      const reports = await db.collection("reports").find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
      const total = await db.collection("reports").countDocuments(query);
      const uids = [...new Set(reports.flatMap(report => [report.reporterUid, report.reportedUserUid]).filter(Boolean))];
      const users = uids.length ? await db.collection("users").find({ uid: { $in: uids } }, { projection: { uid: 1, name: 1, email: 1, isProfileVisible: 1, role: 1 } }).toArray() : [];
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
      const [reporter, reportedUser] = await Promise.all([
        db.collection("users").findOne({ uid: report.reporterUid }, { projection: { uid: 1, name: 1, email: 1 } }),
        db.collection("users").findOne({ uid: report.reportedUserUid }, { projection: { uid: 1, name: 1, email: 1, isProfileVisible: 1, role: 1, suspendedUntil: 1 } })
      ]);
      return { status: 200, body: { ...report, reporter, reportedUser } };
    } catch {
      return { status: 503, body: { message: "Report administration service is temporarily unavailable." } };
    }
  }

  async moderateReport(uid, reportId, payload = {}) {
    if (typeof reportId !== "string" || !/^[a-fA-F0-9]{24}$/.test(reportId)) return { status: 400, body: { message: "Invalid report ID" } };
    const actions = ["dismiss", "suspend_user", "ban_user"];
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
      const now = new Date();
      let status;
      if (payload.action === "dismiss") {
        status = "resolved_no_action";
      } else if (payload.action === "suspend_user") {
        const until = new Date(now.getTime() + durationDays * 86400000);
        await db.collection("users").updateOne({ _id: target._id }, { $set: { suspendedUntil: until, isProfileVisible: false, updatedAt: now } });
        status = "resolved_user_suspended";
      } else {
        await db.collection("users").updateOne({ _id: target._id }, { $set: { role: "user", isProfileVisible: false, suspendedUntil: new Date("9999-12-31T00:00:00.000Z"), updatedAt: now } });
        status = "resolved_user_banned";
      }
      const update = { status, updatedAt: now };
      if (typeof payload.adminNotes === "string") update.adminNotes = payload.adminNotes.trim();
      await db.collection("reports").updateOne({ _id: report._id }, { $set: update });
      return { status: 200, body: { message: "Action '" + payload.action + "' performed successfully.", report: { ...report, ...update } } };
    } catch {
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
      const ticket = {
        userId: user._id,
        ticketNumber: crypto.randomUUID(),
        subject: payload.subject.trim(),
        status: "Open",
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
      const messages = await db.collection("ticketmessages").find({ ticketId: ticket._id }).sort({ createdAt: 1 }).toArray();
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
      if (ticket.status === "Closed") return { status: 403, body: { message: "This ticket is closed and cannot be updated." } };
      const now = new Date();
      const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 5).filter(item =>
        item && typeof item.key === "string" && item.key.startsWith("support-" + ticketId + "-") &&
        typeof item.url === "string" && typeof item.name === "string" &&
        ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(item.type) &&
        Number.isFinite(Number(item.size)) && Number(item.size) > 0 && Number(item.size) <= 10 * 1024 * 1024
      ).map(item => ({ key: item.key, url: item.url, name: item.name.slice(0, 180), type: item.type, size: Number(item.size) })) : [];
      const message = { ticketId: ticket._id, senderId: user._id, message: payload.message.trim(), ...(attachments.length ? { attachments } : {}), createdAt: now, updatedAt: now };
      const result = await db.collection("ticketmessages").insertOne(message);
      message._id = result.insertedId;
      await db.collection("supporttickets").updateOne({ _id: ticket._id, userId: user._id }, { $set: { status: "In Progress", updatedAt: now } });
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
      const report = {
        reporterUid,
        reportedUserUid,
        reason,
        category,
        status: "pending_review",
        adminNotes: "",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await db.collection("reports").insertOne(report);
      return { status: 201, body: { message: "Report submitted successfully.", reportId: result.insertedId.toString() } };
    } catch {
      return { status: 503, body: { error: "Report service is temporarily unavailable." } };
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
      const current = await users.findOne({ uid }, { projection: { isOnboardingComplete: 1 } });
      if (!current) return { status: 404, body: { error: "User not found" } };
      const onboardingComplete = current.isOnboardingComplete === undefined ? true : current.isOnboardingComplete;
      const allowedFields = onboardingComplete
        ? ["sexualOrientation", "bio", "photos", "interests", "profilePrompts", "personalityType", "socialMediaLinks", "education", "relationshipGoals", "location", "lifestyle", "badges", "lastActiveAt"]
        : ["name", "birthday", "gender", "sexualOrientation", "bio", "photos", "interests", "profilePrompts", "personalityType", "socialMediaLinks", "education", "relationshipGoals", "location", "lifestyle", "badges", "mobileNumber", "lastActiveAt", "isOnboardingComplete"];
      const nestedAllowed = {
        lifestyle: ["drinking", "smoking", "exercise", "diet", "lookingFor"],
        badges: ["verified", "premium", "early_adopter"],
        socialMediaLinks: ["instagram", "spotify", "tiktok"],
        education: ["school", "degree"]
      };
      const sanitizedUpdate = {};
      for (const key of allowedFields) {
        if (update[key] === undefined) continue;
        if (nestedAllowed[key]) {
          if (!update[key] || typeof update[key] !== "object" || Array.isArray(update[key])) return { status: 400, body: { error: "Invalid nested profile field format" } };
          sanitizedUpdate[key] = {};
          for (const prop of nestedAllowed[key]) if (update[key][prop] !== undefined) sanitizedUpdate[key][prop] = update[key][prop];
        } else sanitizedUpdate[key] = update[key];
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
      await users.updateOne({ uid }, { $set: { ...sanitizedUpdate, updatedAt: new Date() } });
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
        users.find(query, { projection: { password: 0, lastLoginIp: 0 } })
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
        { _id: new ObjectId(userId) }, { projection: { password: 0, lastLoginIp: 0 } }
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
    if (!payload || typeof payload.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
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
      return { status: 201, body: { ...user, _id: result.insertedId } };
    } catch {
      return { status: 503, body: { message: "Unable to create user" } };
    }
  }

  async updateAdminUser(uid, userId, payload = {}) {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) return { status: 400, body: { message: "Invalid user ID" } };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { status: 400, body: { message: "A user update object is required" } };
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const targetId = new ObjectId(userId);
      const target = await users.findOne({ _id: targetId }, { projection: { role: 1 } });
      if (!target) return { status: 404, body: { message: "User not found" } };
      if (target.role === "superadmin") return { status: 403, body: { message: "Superadmin accounts cannot be modified" } };
      const allowed = [
        "name", "email", "gender", "bio", "interests", "profilePrompts", "education",
        "relationshipGoals", "isProfileVisible", "plan", "faceVerified", "isVerified",
        "mustSetPassword", "role", "location", "lastActiveAt", "photos"
      ];
      const update = {};
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(payload, key)) update[key] = payload[key];
      if (Object.keys(update).length === 0) return { status: 400, body: { message: "No supported fields to update" } };
      if (update.role !== undefined) {
        if (!["user", "contributor", "admin", "superadmin"].includes(update.role)) return { status: 400, body: { message: "Invalid role" } };
        if (access.role !== "superadmin" && update.role === "superadmin") return { status: 403, body: { message: "Admins cannot assign the superadmin role" } };
      }
      if (update.plan !== undefined && !["basic", "premium", "weekly", "monthly", "yearly"].includes(update.plan)) return { status: 400, body: { message: "Invalid plan" } };
      if (update.email !== undefined) {
        if (typeof update.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email.trim())) return { status: 400, body: { message: "Invalid email address" } };
        update.email = update.email.trim().toLowerCase();
        const duplicate = await users.findOne({ email: update.email, _id: { $ne: targetId } }, { projection: { _id: 1 } });
        if (duplicate) return { status: 409, body: { message: "Email is already in use" } };
      }
      if (update.name !== undefined && (typeof update.name !== "string" || update.name.length > 160)) return { status: 400, body: { message: "Invalid name" } };
      if (update.bio !== undefined && (typeof update.bio !== "string" || update.bio.length > 5000)) return { status: 400, body: { message: "Invalid bio" } };
      if (update.isProfileVisible !== undefined && typeof update.isProfileVisible !== "boolean") return { status: 400, body: { message: "Invalid profile visibility" } };
      if (update.interests !== undefined && (!Array.isArray(update.interests) || update.interests.length > 100 || update.interests.some(x => typeof x !== "string" || x.length > 100))) return { status: 400, body: { message: "Invalid interests" } };
      update.updatedAt = new Date();
      const result = await users.findOneAndUpdate(
        { _id: targetId }, { $set: update }, { returnDocument: "after", projection: { password: 0, lastLoginIp: 0 } }
      );
      if (!result) return { status: 404, body: { message: "User not found" } };
      return { status: 200, body: result };
    } catch {
      return { status: 503, body: { message: "Unable to update user" } };
    }
  }

  async deleteAdminUser(uid, userId) {
    const access = await this.requireAdmin(uid, true);
    if (access.status !== 200) return access;
    if (typeof userId !== "string" || !/^[a-fA-F0-9]{24}$/.test(userId)) return { status: 400, body: { message: "Invalid user ID" } };
    try {
      const { ObjectId } = await import("mongodb");
      const users = this.getDatabase(await this.getClient()).collection("users");
      const targetId = new ObjectId(userId);
      const target = await users.findOne({ _id: targetId }, { projection: { role: 1 } });
      if (!target) return { status: 404, body: { message: "User not found" } };
      if (target.role === "superadmin") return { status: 403, body: { message: "Superadmin accounts cannot be deleted" } };
      const result = await users.deleteOne({ _id: targetId });
      return result.deletedCount ? { status: 200, body: { message: "User deleted successfully" } } : { status: 404, body: { message: "User not found" } };
    } catch {
      return { status: 503, body: { message: "Unable to delete user" } };
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
    if (status !== "all" && !["pending", "completed", "rejected"].includes(status)) return { status: 400, body: { message: "Invalid purchase status" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const match = status === "all" ? {} : { status };
      const purchases = await db.collection("purchases").aggregate([
        { $match: match }, { $sort: { createdAt: -1 } }, { $limit: 500 },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $project: { "user.password": 0, "user.lastLoginIp": 0 } }
      ]).toArray();
      return { status: 200, body: purchases.map(p => ({ ...p, userId: p.user || null })) };
    } catch {
      return { status: 503, body: { message: "Unable to load purchases" } };
    }
  }

  async moderateAdminPurchase(uid, purchaseId, action, reason = "") {
    const access = await this.requireAdmin(uid);
    if (access.status !== 200) return access;
    if (typeof purchaseId !== "string" || !/^[a-fA-F0-9]{24}$/.test(purchaseId)) return { status: 400, body: { message: "Invalid purchase ID" } };
    if (!["approve", "reject"].includes(action)) return { status: 400, body: { message: "Invalid purchase action" } };
    if (action === "reject" && (typeof reason !== "string" || !reason.trim() || reason.length > 1000)) {
      return { status: 400, body: { message: "A rejection reason is required (maximum 1000 characters)" } };
    }
    let outcome = { status: 500, body: { message: "Purchase moderation failed" } };
    let session;
    try {
      const client = await this.getClient();
      const { ObjectId } = await import("mongodb");
      session = client.startSession();
      await session.withTransaction(async () => {
        const db = this.getDatabase(client);
        const purchases = db.collection("purchases");
        const purchase = await purchases.findOne({ _id: new ObjectId(purchaseId) }, { session });
        if (!purchase || purchase.status !== "pending") {
          outcome = { status: 404, body: { message: "Pending purchase not found" } };
          return;
        }
        const user = await db.collection("users").findOne({ _id: purchase.userId }, { session, projection: { _id: 1 } });
        if (!user) {
          outcome = { status: 409, body: { message: "Purchase owner no longer exists" } };
          throw new Error("ABORT_PURCHASE_TRANSACTION");
        }
        const now = new Date();
        const purchaseUpdate = action === "approve"
          ? { $set: { status: "completed", updatedAt: now } }
          : { $set: { status: "rejected", rejectionReason: reason.trim(), updatedAt: now } };
        const changed = await purchases.updateOne({ _id: purchase._id, status: "pending" }, purchaseUpdate, { session });
        if (!changed.modifiedCount) {
          outcome = { status: 409, body: { message: "Purchase was already processed" } };
          throw new Error("ABORT_PURCHASE_TRANSACTION");
        }
        if (action === "approve") {
          const userUpdate = {};
          if (purchase.itemId === "super-like-5") userUpdate.$inc = { purchasedSuperLikes: 5 };
          else if (purchase.itemId === "undo-swipes-5") userUpdate.$inc = { purchasedUndoSwipes: 5 };
          else if (purchase.itemId === "profile-boost-1") userUpdate.$set = { boostExpiresAt: new Date(now.getTime() + 60 * 60 * 1000) };
          if (Object.keys(userUpdate).length) {
            userUpdate.$set = { ...(userUpdate.$set || {}), updatedAt: now };
            await db.collection("users").updateOne({ _id: purchase.userId }, userUpdate, { session });
          }
          outcome = { status: 200, body: { message: "Purchase approved successfully" } };
        } else {
          outcome = { status: 200, body: { message: "Purchase rejected successfully" } };
        }
      });
      return outcome;
    } catch (error) {
      if (outcome.status === 409) return outcome;
      return { status: 503, body: { message: "Purchase moderation unavailable; transaction was not confirmed" } };
    } finally {
      if (session) await session.endSession().catch(() => {});
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
        ...subscriptions.map(s => ({ ...s, type: "Subscription", itemName: String(s.plan || "") + " Plan", price: ({ weekly: "800 LKR", monthly: "3000 LKR", yearly: "10000 LKR" })[s.plan] || "N/A" }))
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 500);
      return { status: 200, body: result };
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
      const [totalUsers, paidUsers, signups, reportedUsers] = await Promise.all([
        db.collection("users").countDocuments({}),
        db.collection("subscriptions").countDocuments({ status: "active" }),
        db.collection("users").aggregate([
          { $match: dateFilter },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]).toArray(),
        db.collection("reports").distinct("reportedUserUid")
      ]);
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
    try {
      const db = this.getDatabase(await this.getClient());
      const ticketsCollection = db.collection("supporttickets");
      const [tickets, total] = await Promise.all([
        ticketsCollection.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        ticketsCollection.countDocuments(query)
      ]);
      const userIds = tickets.map(ticket => ticket.userId).filter(Boolean);
      const { ObjectId } = await import("mongodb");
      const normalizedIds = userIds.map(value => typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value) ? new ObjectId(value) : value);
      const users = normalizedIds.length ? await db.collection("users").find(
        { _id: { $in: normalizedIds } }, { projection: { name: 1, email: 1 } }
      ).toArray() : [];
      const userMap = new Map(users.map(user => [String(user._id), user]));
      return { status: 200, body: {
        tickets: tickets.map(ticket => ({ ...ticket, userId: userMap.get(String(ticket.userId)) || null })),
        totalPages: Math.ceil(total / limit), currentPage: page
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
      const [user, messages] = await Promise.all([
        db.collection("users").findOne({ _id: ticket.userId }, { projection: { name: 1, email: 1 } }),
        db.collection("ticketmessages").find({ ticketId: new ObjectId(ticketId) }).sort({ createdAt: 1 }).toArray()
      ]);
      const senderIds = messages.map(message => message.senderId).filter(Boolean);
      const senders = senderIds.length ? await db.collection("users").find(
        { _id: { $in: senderIds } }, { projection: { name: 1 } }
      ).toArray() : [];
      const senderMap = new Map(senders.map(sender => [String(sender._id), sender]));
      return { status: 200, body: {
        ticket: { ...ticket, userId: user || null },
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
      const message = {
        ticketId: ticketObjectId, senderId: adminUser._id, message: payload.message.trim(),
        ...(attachments.length ? { attachments } : {}),
        isFromAdmin: true, createdAt: now, updatedAt: now
      };
      const inserted = await db.collection("ticketmessages").insertOne(message);
      await db.collection("supporttickets").updateOne(
        { _id: ticketObjectId }, { $set: { status: "Waiting for Customer", updatedAt: now } }
      );
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
    if (!payload || !allowedStatuses.includes(payload.status)) return { status: 400, body: { message: "Invalid ticket status" } };
    try {
      const { ObjectId } = await import("mongodb");
      const db = this.getDatabase(await this.getClient());
      const result = await db.collection("supporttickets").findOneAndUpdate(
        { _id: new ObjectId(ticketId) },
        { $set: { status: payload.status, updatedAt: new Date() } },
        { returnDocument: "after" }
      );
      if (!result) return { status: 404, body: { message: "Ticket not found" } };
      return { status: 200, body: result };
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
      if (typeof search === "string" && search.trim()) {
        const needle = search.trim().slice(0, 100);
        const escaped = needle.split("").map(ch => "\\.^$*+?()[]{}|".includes(ch) ? "\\" + ch : ch).join("");
        const userQuery = { $or: [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }] };
        if (kind === "audit") userQuery.role = { $in: ["admin", "superadmin"] };
        const users = await db.collection("users").find(userQuery, { projection: { _id: 1 } }).limit(500).toArray();
        if (!users.length) return { status: 200, body: [] };
        const userIds = users.map(user => user._id);
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
      return { status: 200, body: entries.map(entry => {
        if (kind === "payment") return { ...entry, userId: entry.user || null };
        if (kind === "audit") return { ...entry, adminId: entry.user || null };
        return { ...entry, userId: entry.user || null };
      }) };
    } catch {
      return { status: 503, body: { message: "Unable to load administrative logs" } };
    }
  }

  parseChatRoom(roomId) {
    if (typeof roomId !== "string" || roomId.length > 260 || roomId.length < 3) return null;
    return roomId;
  }

  async createCall(uid, payload) {
    const { roomId, receiverUid, type, offer } = payload || {};
    if (typeof uid !== "string" || !uid || typeof receiverUid !== "string" || !receiverUid ||
        receiverUid === uid || typeof roomId !== "string" ||
        ![uid + "-" + receiverUid, receiverUid + "-" + uid].includes(roomId) ||
        !["audio", "video"].includes(type) || !offer || offer.type !== "offer" ||
        typeof offer.sdp !== "string" || offer.sdp.length > 200000) {
      return { status: 400, body: { error: "Invalid call request" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const [caller, receiver] = await Promise.all([
        users.findOne({ uid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1 } }),
        users.findOne({ uid: receiverUid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1 } })
      ]);
      if (!caller || !receiver) return { status: 404, body: { error: "Call participant not found" } };
      const now = new Date();
      if ((caller.suspendedUntil && new Date(caller.suspendedUntil) > now) ||
          (receiver.suspendedUntil && new Date(receiver.suspendedUntil) > now) ||
          (Array.isArray(caller.blocked) && caller.blocked.includes(receiverUid)) ||
          (Array.isArray(receiver.blocked) && receiver.blocked.includes(uid))) {
        return { status: 403, body: { error: "Calling is unavailable for this conversation" } };
      }
      const calls = db.collection("callSessions");
      const active = await calls.findOne({
        roomId, status: { $in: ["ringing", "accepted"] },
        $or: [{ callerUid: uid }, { receiverUid: uid }]
      }, { projection: { _id: 1 } });
      if (active) return { status: 409, body: { error: "There is already an active call in this conversation" } };
      const call = {
        roomId, callerUid: uid, receiverUid, type, status: "ringing",
        offer: { type: "offer", sdp: offer.sdp }, answer: null, signals: [],
        createdAt: now, updatedAt: now
      };
      const inserted = await calls.insertOne(call);
      call._id = inserted.insertedId;
      return { status: 201, body: call };
    } catch (error) {
      console.error("Call creation failed", { message: error?.message?.slice(0, 180) });
      return { status: 503, body: { error: "Unable to start call" } };
    }
  }

  async getCallHistory(uid, roomId) {
    if (typeof uid !== "string" || !uid || typeof roomId !== "string" ||
        roomId.length > 260 || roomId.length < 3 ||
        !(roomId.startsWith(uid + "-") || roomId.endsWith("-" + uid))) {
      return { status: 400, body: { error: "Invalid call room" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const callsCollection = db.collection("callSessions");
      const staleBefore = new Date(Date.now() - 45000);
      await callsCollection.updateMany(
        { roomId, status: "ringing", createdAt: { $lt: staleBefore },
          $or: [{ callerUid: uid }, { receiverUid: uid }] },
        { $set: { status: "missed", endedAt: new Date(), updatedAt: new Date() } }
      );
      const calls = await callsCollection.find({
        roomId, $or: [{ callerUid: uid }, { receiverUid: uid }]
      }).sort({ createdAt: -1 }).limit(30).toArray();
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
      if (call?.status === "ringing" && Date.now() - new Date(call.createdAt).getTime() > 45000) {
        await calls.updateOne({ _id: call._id, status: "ringing" }, {
          $set: { status: "missed", endedAt: new Date(), updatedAt: new Date() }
        });
        call = null;
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
    const { callId, candidate } = payload || {};
    if (typeof callId !== "string" || !/^[a-fA-F0-9]{24}$/.test(callId) ||
        !candidate || typeof candidate !== "object" ||
        typeof candidate.candidate !== "string" || candidate.candidate.length > 10000) {
      return { status: 400, body: { error: "Invalid ICE candidate" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const { ObjectId } = await import("mongodb");
      const calls = db.collection("callSessions");
      const call = await calls.findOne({ _id: new ObjectId(callId), status: { $in: ["ringing", "accepted"] } });
      if (!call) return { status: 404, body: { error: "Active call not found" } };
      if (Array.isArray(call.signals) && call.signals.length >= 300) {
        return { status: 429, body: { error: "Call signaling limit reached" } };
      }
      let toUid;
      if (call.callerUid === uid) toUid = call.receiverUid;
      else if (call.receiverUid === uid) toUid = call.callerUid;
      else return { status: 403, body: { error: "Not a participant in this call" } };
      await calls.updateOne(
        { _id: call._id, status: { $in: ["ringing", "accepted"] } },
        { $push: { signals: { signalId: crypto.randomUUID(), fromUid: uid, toUid, candidate, createdAt: new Date() } },
          $set: { updatedAt: new Date() } }
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
      } else {
        set.endedAt = now;
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

  async getChatHistory(uid, roomId, limit = 50, skip = 0) {
    if (!this.parseChatRoom(roomId) || typeof uid !== "string" || !uid) return { status: 400, body: { error: "Invalid room ID" } };
    limit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
    skip = Number.isInteger(skip) ? Math.max(0, Math.min(skip, 100000)) : 0;
    try {
      const db = this.getDatabase(await this.getClient());
      const user = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const access = user.role === "superadmin" ? {} : {
        $or: [{ senderUid: uid }, { receiverUid: uid }]
      };
      const query = { roomId, ...access };
      const messages = await db.collection("chatmessages").find(query)
        .sort({ timestamp: 1 }).skip(skip).limit(limit).toArray();
      if (user.role !== "superadmin" && messages.length === 0) {
        const hasConversation = await db.collection("chatmessages").findOne({ roomId, $or: [{ senderUid: uid }, { receiverUid: uid }] }, { projection: { _id: 1 } });
        if (!hasConversation) return { status: 403, body: { error: "Unauthorized to view this chat history." } };
      }
      return { status: 200, body: { messages } };
    } catch {
      return { status: 503, body: { error: "Chat history unavailable" } };
    }
  }

  async getChatConversations(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const [user, messages] = await Promise.all([
        db.collection("users").findOne({ uid }, { projection: { _id: 1, uid: 1, blocked: 1 } }),
        db.collection("chatmessages").find({ $or: [{ senderUid: uid }, { receiverUid: uid }] })
          .sort({ timestamp: -1 }).limit(500).toArray()
      ]);
      if (!user) return { status: 404, body: { error: "User not found" } };
      const byRoom = new Map();
      for (const message of messages) {
        if (typeof message.roomId !== "string" || byRoom.has(message.roomId)) continue;
        const otherUid = message.senderUid === uid ? message.receiverUid : message.senderUid;
        if (typeof otherUid !== "string" || !otherUid || otherUid === uid) continue;
        const otherUser = await db.collection("users").findOne(
          { uid: otherUid },
          { projection: { password: 0, lastLoginIp: 0, email: 0, mobileNumber: 0, location: 0, lastLoginDevice: 0 } }
        );
        if (!otherUser || (Array.isArray(user.blocked) && user.blocked.includes(otherUid)) ||
            (Array.isArray(otherUser.blocked) && otherUser.blocked.includes(uid))) continue;
        byRoom.set(message.roomId, { roomId: message.roomId, otherUser, lastMessage: message });
      }
      return { status: 200, body: [...byRoom.values()] };
    } catch {
      return { status: 503, body: { error: "Chat conversations unavailable" } };
    }
  }

  async updateTypingStatus(uid, payload) {
    const { roomId, isTyping } = payload || {};
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId) ||
        ![uid + "-" + (roomId.split("-").filter(part => part !== uid).join("-")),
          (roomId.split("-").filter(part => part !== uid).join("-")) + "-" + uid].includes(roomId) ||
        typeof isTyping !== "boolean") {
      return { status: 400, body: { error: "Invalid typing status" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const conversation = await db.collection("chatmessages").findOne(
        { roomId, $or: [{ senderUid: uid }, { receiverUid: uid }] },
        { projection: { _id: 1 } }
      );
      if (!conversation) return { status: 403, body: { error: "Not a participant in this conversation" } };
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
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId) ||
        !(roomId.startsWith(uid + "-") || roomId.endsWith("-" + uid))) {
      return { status: 400, body: { error: "Invalid chat room" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const conversation = await db.collection("chatmessages").findOne(
        { roomId, $or: [{ senderUid: uid }, { receiverUid: uid }] },
        { projection: { _id: 1 } }
      );
      if (!conversation) return { status: 403, body: { error: "Not a participant in this conversation" } };
      const otherUid = roomId.split("-").filter(part => part !== uid).join("-");
      const presence = await db.collection("chatTyping").findOne({ roomId, uid: otherUid });
      const typing = Boolean(presence?.isTyping && Date.now() - new Date(presence.updatedAt).getTime() < 5000);
      return { status: 200, body: { isTyping: typing } };
    } catch {
      return { status: 503, body: { error: "Typing status unavailable" } };
    }
  }

  async markChatDelivered(uid, payload) {
    const { roomId, messageIds } = payload || {};
    if (typeof uid !== "string" || !uid || !this.parseChatRoom(roomId) ||
        !(roomId.startsWith(uid + "-") || roomId.endsWith("-" + uid)) || !Array.isArray(messageIds) || messageIds.length > 100) {
      return { status: 400, body: { error: "Invalid delivery receipt" } };
    }
    try {
      const { ObjectId } = await import("mongodb");
      const ids = messageIds.filter(id => typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id)).map(id => new ObjectId(id));
      if (!ids.length) return { status: 200, body: { deliveredCount: 0 } };
      const db = this.getDatabase(await this.getClient());
      const result = await db.collection("chatmessages").updateMany(
        { _id: { $in: ids }, roomId, receiverUid: uid, status: "sent" },
        { $set: { status: "delivered", deliveredAt: new Date() } }
      );
      return { status: 200, body: { deliveredCount: result.modifiedCount } };
    } catch {
      return { status: 503, body: { error: "Could not mark messages as delivered" } };
    }
  }

  async createChatMessage(uid, payload) {
    const { roomId, receiverUid, messageContent } = payload || {};
    if (typeof uid !== "string" || !uid || typeof receiverUid !== "string" || !receiverUid ||
        receiverUid === uid || typeof roomId !== "string" ||
        ![uid + "-" + receiverUid, receiverUid + "-" + uid].includes(roomId) ||
        typeof messageContent !== "string" || !messageContent.trim() || messageContent.length > 5000) {
      return { status: 400, body: { error: "Invalid roomId, receiverUid, or messageContent" } };
    }
    try {
      const db = this.getDatabase(await this.getClient());
      const users = db.collection("users");
      const [sender, receiver] = await Promise.all([
        users.findOne({ uid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1 } }),
        users.findOne({ uid: receiverUid }, { projection: { _id: 1, blocked: 1, suspendedUntil: 1 } })
      ]);
      if (!sender || !receiver) return { status: 404, body: { error: "Chat participant not found" } };
      const now = new Date();
      if ((sender.suspendedUntil && new Date(sender.suspendedUntil) > now) ||
          (receiver.suspendedUntil && new Date(receiver.suspendedUntil) > now)) {
        return { status: 403, body: { error: "Messaging is unavailable for this account" } };
      }
      if ((Array.isArray(sender.blocked) && sender.blocked.includes(receiverUid)) ||
          (Array.isArray(receiver.blocked) && receiver.blocked.includes(uid))) {
        return { status: 403, body: { error: "Messaging is unavailable for this conversation" } };
      }
      const message = { roomId, senderUid: uid, receiverUid, messageContent: messageContent.trim(), timestamp: now, status: "sent" };
      const inserted = await db.collection("chatmessages").insertOne(message);
      message._id = inserted.insertedId;
      return { status: 201, body: message };
    } catch {
      return { status: 503, body: { error: "Unable to send chat message" } };
    }
  }

  async deleteChatMessage(uid, messageId) {
    if (typeof messageId !== "string" || !/^[a-fA-F0-9]{24}$/.test(messageId)) return { status: 400, body: { error: "Invalid message ID" } };
    try {
      const db = this.getDatabase(await this.getClient());
      const { ObjectId } = await import("mongodb");
      const result = await db.collection("chatmessages").deleteOne({
        _id: new ObjectId(messageId), senderUid: uid, status: "sent"
      });
      return result.deletedCount ? { status: 200, body: { success: true } } : { status: 404, body: { error: "Message not found" } };
    } catch {
      return { status: 503, body: { error: "Unable to roll back chat message" } };
    }
  }


  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    if (url.pathname === "/internal/scheduled-expirations") {
      const body = await request.json().catch(() => ({}));
      const scope = body && body.scope ? body.scope : "all";
      if (!["all", "trials", "subscriptions"].includes(scope)) return json({ error: "Invalid expiration scope" }, 400);
      const result = await this.runScheduledExpirations(new Date(), scope);
      return json(result);
    }

    if (url.pathname === "/internal/create-purchase" || url.pathname === "/internal/create-subscription") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      const result = url.pathname === "/internal/create-purchase"
        ? await this.createPendingPurchase(body.claims.sub, body.itemId)
        : await this.createPendingSubscription(body.claims.sub, body.plan);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/webxpay-settle") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.orderId !== "string" || typeof body.statusCode !== "string") return json({ error: "Invalid request" }, 400);
      const result = await this.settleWebXPay(body.orderId, body.statusCode, body.reference || "");
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/superadmin-provision") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.email !== "string") return json({ error: "Invalid request" }, 400);
      const result = await this.ensureSuperadminUser(body.email);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/calls/start" ||
        url.pathname === "/internal/calls/poll" ||
        url.pathname === "/internal/calls/history" ||
        url.pathname === "/internal/calls/signal" ||
        url.pathname === "/internal/calls/action") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/calls/start") result = await this.createCall(body.claims.sub, body.payload);
      else if (url.pathname === "/internal/calls/poll") result = await this.getCallState(body.claims.sub, body.roomId);
      else if (url.pathname === "/internal/calls/history") result = await this.getCallHistory(body.claims.sub, body.roomId);
      else if (url.pathname === "/internal/calls/signal") result = await this.sendCallSignal(body.claims.sub, body.payload);
      else result = await this.updateCall(body.claims.sub, body.payload);
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/chat/history" ||
        url.pathname === "/internal/chat/conversations" ||
        url.pathname === "/internal/chat/send" ||
        url.pathname === "/internal/chat/rollback" ||
        url.pathname === "/internal/chat/typing-read" ||
        url.pathname === "/internal/chat/typing-write" ||
        url.pathname === "/internal/chat/delivered") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ error: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/chat/history") {
        result = await this.getChatHistory(body.claims.sub, body.roomId, body.limit, body.skip);
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
      } else {
        result = await this.deleteChatMessage(body.claims.sub, body.messageId);
      }
      return json(result.body, result.status);
    }

    if (url.pathname === "/internal/ping") {
      const result = await this.ping();
      return json({ status: result.ok ? "ok" : "unavailable" }, result.ok ? 200 : 503);
    }




    if (url.pathname === "/internal/photo-upload" || url.pathname === "/internal/photo-delete") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ message: "Invalid request" }, 400);
      const result = url.pathname === "/internal/photo-upload"
        ? await this.addUploadedPhoto(body.claims.sub, body.photo)
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
      "/internal/admin/support-ticket-message", "/internal/admin/support-ticket-status"
    ].includes(url.pathname)) {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") return json({ message: "Invalid request" }, 400);
      let result;
      if (url.pathname === "/internal/admin/support-tickets") result = await this.getAdminSupportTickets(body.claims.sub, body.params || {});
      else if (url.pathname === "/internal/admin/support-ticket") result = await this.getAdminSupportTicket(body.claims.sub, body.ticketId);
      else if (url.pathname === "/internal/admin/support-ticket-message") result = await this.addAdminSupportMessage(body.claims.sub, body.ticketId, body.payload || {});
      else result = await this.updateAdminSupportStatus(body.claims.sub, body.ticketId, body.payload || {});
      return json(result.body, result.status);
    }

    if (url.pathname.startsWith("/internal/admin/") && [
      "/internal/admin/users", "/internal/admin/user", "/internal/admin/stats",
      "/internal/admin/transactions", "/internal/admin/analytics", "/internal/admin/user-create",
      "/internal/admin/user-update", "/internal/admin/user-delete", "/internal/admin/user-plan",
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
      else if (url.pathname === "/internal/admin/user-plan") result = await this.updateAdminUserPlan(body.claims.sub, body.userId, body.payload || {});
      else if (url.pathname === "/internal/admin/stats") result = await this.getAdminDashboardStats(body.claims.sub);
      else if (url.pathname === "/internal/admin/transactions") result = await this.getAdminTransactions(body.claims.sub);
      else if (url.pathname === "/internal/admin/payment-logs") result = await this.getAdminLogs(body.claims.sub, "payment", body.search || "");
      else if (url.pathname === "/internal/admin/login-history") result = await this.getAdminLogs(body.claims.sub, "login", body.search || "");
      else if (url.pathname === "/internal/admin/audit-logs") result = await this.getAdminLogs(body.claims.sub, "audit", body.search || "");
      else if (url.pathname === "/internal/admin/purchases") result = await this.getAdminPurchases(body.claims.sub, body.status || "all");
      else if (url.pathname === "/internal/admin/purchase-action") result = await this.moderateAdminPurchase(body.claims.sub, body.purchaseId, body.action, body.reason || "");
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
