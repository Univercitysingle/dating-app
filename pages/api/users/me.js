import admin from "../../services/firebaseAdmin";
import { getUserFromDB } from "../../services/userService"; // Example DB lookup function

/**
 * Debug-friendly API route to return the current user's decoded Firebase token info.
 * Expects Authorization: Bearer <token> header.
 */
export default async function handler(req, res) {
  // Debug: Log incoming request method and headers
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [me.js] Request method:", req.method);
    console.log("DEBUG [me.js] Request headers:", req.headers);
  }

  try {
    const authHeader = req.headers.authorization;

    // Debug: Log the Authorization header
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG [me.js] Authorization header:", authHeader);
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] Missing or malformed Authorization header");
      }
      return res.status(401).json({ error: "No auth token provided in Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] Token not found after Bearer");
      }
      return res.status(401).json({ error: "Invalid Authorization header format" });
    }

    // Debug: Log the extracted token (do NOT log in production)
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG [me.js] Extracted token:", token);
    }

    // Verify the token with Firebase Admin SDK
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] Decoded token:", decoded);
      }
    } catch (verifyError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("DEBUG [me.js] Firebase token verification failed:", verifyError);
      }
      return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    }

    // Check user provisioning in DB
    let userRecord;
    try {
      userRecord = await getUserFromDB(decoded.uid);
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] User record from DB:", userRecord);
      }

      // Example check: user exists and email verified
      if (!userRecord) {
        if (process.env.NODE_ENV !== "production") {
          console.log("DEBUG [me.js] User not found in DB");
        }
        return res.status(403).json({ error: "User provisioning failed: user not found in DB" });
      }

      if (!userRecord.emailVerified) {
        if (process.env.NODE_ENV !== "production") {
          console.log("DEBUG [me.js] User email not verified");
        }
        return res.status(403).json({ error: "User provisioning failed: email not verified" });
      }
    } catch (dbError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("DEBUG [me.js] DB lookup failed:", dbError);
      }
      return res.status(500).json({ error: "Internal server error during user lookup" });
    }

    // Respond with user info from decoded token and DB record
    res.status(200).json({ user: decoded, dbUser: userRecord });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("DEBUG [me.js] Unexpected error:", error);
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
}
