import admin from "../../services/firebaseAdmin";

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

    // Respond with user info from the decoded token
    res.status(200).json({ user: decoded });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("DEBUG [me.js] Unexpected error:", error);
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
}
