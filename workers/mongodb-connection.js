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

  async undoSwipe(uid) {
    if (typeof uid !== "string" || !uid || uid.length > 128) return { status: 400, body: { error: "Invalid user identity" } };
    try {
      const db = (await this.getClient()).db();
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

  async recordSwipe(uid, targetUid, action) {
    if (typeof uid !== "string" || !uid || uid.length > 128 ||
        typeof targetUid !== "string" || !targetUid || targetUid.length > 128 ||
        !["like", "pass", "superlike"].includes(action)) {
      return { status: 400, body: { error: "Invalid swipe request" } };
    }
    if (uid === targetUid) return { status: 400, body: { error: "Cannot swipe on yourself." } };
    try {
      const db = (await this.getClient()).db();
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
        const inserted = await db.collection("matches").insertOne({
          user1Uid: uid,
          user2Uid: targetUid,
          status: action === "pass" ? "unmatched" : "pending",
          likedBy: action === "pass" ? [] : [uid],
          superLike: action === "superlike",
          createdAt: now,
          updatedAt: now
        });
        match = { _id: inserted.insertedId, user1Uid: uid, user2Uid: targetUid, status: action === "pass" ? "unmatched" : "pending", likedBy: action === "pass" ? [] : [uid], superLike: action === "superlike" };
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

  async getPotentialMatches(uid, filters = {}) {
    if (typeof uid !== "string" || !uid || uid.length > 128 || !filters || typeof filters !== "object" || Array.isArray(filters)) {
      return { status: 400, body: { error: "Invalid match request" } };
    }
    try {
      const db = (await this.getClient()).db();
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
      const db = (await this.getClient()).db();
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
      const db = (await this.getClient()).db();
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
      const db = (await this.getClient()).db();
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
          typeof body.targetUid !== "string" || !["like", "pass", "superlike"].includes(body.action)) {
        return json({ error: "Invalid request" }, 400);
      }
      const result = await this.recordSwipe(body.claims.sub, body.targetUid, body.action);
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
