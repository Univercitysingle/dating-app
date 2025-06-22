import admin from "../../services/firebaseAdmin";

/**
 * API route to return the current user's decoded Firebase token info.
 * Expects Authorization: Bearer <token> header.
 * Includes debug logging for troubleshooting.
 */
export default async function handler(req, res) {
  try {
    // Debug: Log incoming headers
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG /api/users/me headers:", req.headers);
    }

    const authHeader = req.headers.authorization;

    // Debug: Log the Authorization header
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG Authorization header:", authHeader);
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG No (or malformed) auth header received");
      }
      return res.status(401).json({ error: "No auth token provided in Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG Token not found after Bearer");
      }
      return res.status(401).json({ error: "Invalid Authorization header format" });
    }

    // Debug: Log the extracted token (do not log in production)
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG Extracted token:", token);
    }

    // Verify the token with Firebase Admin SDK
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG Decoded token:", decoded);
      }
    } catch (verifyError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("DEBUG Firebase token verification failed:", verifyError);
      }
      return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    }

    // Respond with user info from the decoded token
    res.status(200).json({ user: decoded });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("DEBUG Auth API error:", error);
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
}
