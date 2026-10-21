const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export class MongoDBConnection {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clientPromise = null;
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

  async ping() {
    try {
      const client = await this.getClient();
      await client.db().command({ ping: 1 });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async findOrCreateUserFromClaims(claims) {
    if (!claims || typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }

    try {
      const users = (await this.getClient()).db().collection("users");
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
      const users = (await this.getClient()).db().collection("users");
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
      const db = (await this.getClient()).db();
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

  async getLikes(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = (await this.getClient()).db();
      const currentUser = await db.collection("users").findOne({ uid }, { projection: { _id: 1, plan: 1 } });
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
        delete profile.email;
        delete profile.mobileNumber;
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
            if (!photo || typeof photo.url !== "string" || !photo.url || photo.url.startsWith("http://") || photo.url.startsWith("https://")) return photo;
            return { ...photo, url: "https://" + (this.env.CDN_HOSTNAME || "dateme.enadoctemp.workers.dev") + "/" + photo.url.replace(/^\/+/, "") };
          });
        }
        const match = matchByUid.get(likedUid);
        result.push({
          ...profile,
          likeType: match && match.superLike ? "superlike" : "like",
          isBlurred
        });
      }
      return { status: 200, body: result };
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async getUserProfile(targetUid, viewerUid) {
    if (typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
        typeof viewerUid !== "string" || !viewerUid || viewerUid.length > 128) {
      return { status: 400, body: { error: "Invalid user identity" } };
    }
    try {
      const db = (await this.getClient()).db();
      const user = await db.collection("users").findOne({ uid: targetUid });
      if (!user) return { status: 404, body: { error: "User not found" } };
      const viewer = targetUid === viewerUid ? user : await db.collection("users").findOne(
        { uid: viewerUid }, { projection: { role: 1 } }
      );
      const isOwner = targetUid === viewerUid;
      const isSuperAdmin = viewer?.role === "superadmin";
      const profile = { ...user };
      // Never expose credentials or operational IP metadata in profile responses.
      delete profile.password;
      delete profile.lastLoginIp;
      if (!isOwner && !isSuperAdmin) {
        delete profile.email;
        delete profile.mobileNumber;
      }
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
          if (!photo || typeof photo.url !== "string" || !photo.url || /^https?:\/\//i.test(photo.url)) return photo;
          return { ...photo, url: "https://" + (this.env.CDN_HOSTNAME || "dateme.enadoctemp.workers.dev") + "/" + photo.url.replace(/^\/+/, "") };
        });
      }
      return { status: 200, body: profile };
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async updateCurrentUserProfile(uid, update) {
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    if (!update || typeof update !== "object" || Array.isArray(update)) return { status: 400, body: { error: "A JSON profile object is required" } };
    try {
      const users = (await this.getClient()).db().collection("users");
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
      const db = client.db();
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
          if (photo && typeof photo.url === "string" && photo.url && !/^https?:\/\//i.test(photo.url)) {
            photo.url = `https://${this.env.CDN_HOSTNAME || "dateme.enadoctemp.workers.dev"}/${photo.url.replace(/^\/+/, "")}`;
          }
        }
      }

      return { status: 200, body: user };
    } catch {
      return { status: 503, body: { error: "Profile service unavailable" } };
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    if (url.pathname === "/internal/ping") {
      const result = await this.ping();
      return json({ status: result.ok ? "ok" : "unavailable" }, result.ok ? 200 : 503);
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

    if (url.pathname === "/internal/likes") {
      const body = await request.json().catch(() => null);
      if (!body || !body.claims || typeof body.claims.sub !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.getLikes(body.claims.sub);
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
