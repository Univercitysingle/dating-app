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

  getDatabase(client) {
    // Honor the explicit environment database when set; otherwise preserve the URI default.
    return client.db(this.env.MONGODB_DATABASE || undefined);
  }

  async ping() {
    try {
      const client = await this.getClient();
      await this.getDatabase(client).command({ ping: 1 });
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
        !photo || typeof photo.url !== "string" || !/^photos-[A-Za-z0-9_-]{1,128}-[a-f0-9-]+\\.(?:jpg|jpeg|png|gif)$/.test(photo.url) ||
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
      }, {
        $push: { photos: { url: photo.url, order: photo.order, size: photo.size } },
        $inc: { totalPhotoSize: photo.size },
        $set: { updatedAt: new Date() }
      }, { returnDocument: "after", projection: { password: 0, lastLoginIp: 0 } });
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
        !/^photos-[A-Za-z0-9_-]{1,128}-[a-f0-9-]+\\.(?:jpg|jpeg|png|gif)$/.test(key)) {
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
      }
      if (profile._id !== undefined) profile.id = String(profile._id);
      if (Array.isArray(profile.photos)) {
        profile.photos = profile.photos.map(photo => {
          if (!photo || typeof photo.url !== "string" || !photo.url || photo.url.startsWith("http")) return photo;
          let path = photo.url;
          while (path.startsWith("/")) path = path.slice(1);
          return { ...photo, url: "https://" + (this.env.CDN_HOSTNAME || "dateme.enadoctemp.workers.dev") + "/" + path };
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
        if (currentUser.role !== "superadmin") {
          delete profile.email;
          delete profile.mobileNumber;
        }
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
            if (!photo || typeof photo.url !== "string" || !photo.url || photo.url.startsWith("http")) return photo;
            let path = photo.url;
            while (path.startsWith("/")) path = path.slice(1);
            return { ...photo, url: "https://" + (this.env.CDN_HOSTNAME || "dateme.enadoctemp.workers.dev") + "/" + path };
          });
        }
        return { ...item, user: profile };
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
          if (currentUser.role !== "superadmin") {
            delete profile.email;
            delete profile.mobileNumber;
          }
          if (profile._id !== undefined) profile.id = String(profile._id);
          if (Array.isArray(profile.photos)) {
            profile.photos = profile.photos.map(photo => {
              if (!photo || typeof photo.url !== "string" || !photo.url || photo.url.startsWith("http")) return photo;
              let path = photo.url;
              while (path.startsWith("/")) path = path.slice(1);
              return { ...photo, url: "https://" + (this.env.CDN_HOSTNAME || "dateme.enadoctemp.workers.dev") + "/" + path };
            });
          }
          return [profile];
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
    try {
      const db = this.getDatabase(await this.getClient());
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

      const pipeline = [];
      const hasLocation = maxDistance !== null && currentUser.location &&
        Array.isArray(currentUser.location.coordinates) && currentUser.location.coordinates.length === 2 &&
        currentUser.location.coordinates.every(Number.isFinite);
      if (hasLocation) {
        pipeline.push({
          $geoNear: {
            near: { type: "Point", coordinates: currentUser.location.coordinates },
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
                    { $and: [{ $eq: ["$user1Uid", "$candidateUid"] }, { $eq: ["$user2Uid", uid] }] },
                    { $and: [{ $eq: ["$user1Uid", uid] }, { $eq: ["$user2Uid", "$candidateUid"] }] }
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
                vars: { boostedIds: "$boostedUsers.uid" },
                in: {
                  $concatArrays: [
                    "$boostedUsers",
                    {
                      $slice: [
                        {
                          $filter: {
                            input: "$regularUsers",
                            as: "regularUser",
                            cond: { $not: { $in: ["$regularUser.uid", "$boostedIds"] } }
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

      const uidDocs = await db.collection("users").aggregate(pipeline).toArray();
      const orderedUids = uidDocs.map(doc => doc.uid).filter(value => typeof value === "string");
      if (orderedUids.length === 0) return { status: 200, body: [] };

      const [candidateUsers, superLikeMatches] = await Promise.all([
        db.collection("users").find({ uid: { $in: orderedUids } }).toArray(),
        db.collection("matches").find({ user2Uid: uid, superLike: true }).project({ user1Uid: 1 }).toArray()
      ]);
      const usersByUid = new Map(candidateUsers.map(user => [user.uid, user]));
      const superLikedBy = new Set(superLikeMatches.map(match => match.user1Uid));
      const result = [];
      for (const candidateUid of orderedUids) {
        const user = usersByUid.get(candidateUid);
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
        profile.superLikedByCurrentUser = superLikedBy.has(candidateUid);
        result.push(profile);
      }
      return { status: 200, body: result };
    } catch {
      return { status: 503, body: { error: "Discovery service unavailable" } };
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
      const subscriptions = await db.collection("subscriptions")
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
      const message = { ticketId: ticket._id, senderId: user._id, message: payload.message.trim(), createdAt: now, updatedAt: now };
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
      return { status: 200, body: { users: items, totalPages: Math.ceil(totalUsers / limit), currentPage: page, totalUsers } };
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
      const message = {
        ticketId: ticketObjectId, senderId: adminUser._id, message: payload.message.trim(),
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
