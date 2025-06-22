import admin from "../../services/firebaseAdmin";

/**
 * Debug-friendly API route to return the current user's decoded Firebase token info.
 * Expects Authorization: Bearer <token> header.
 *
 * FRONTEND NOTE:
 * Call this route using your environment variable like:
 * fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/me`)
 */
export default async function handler(req, res) {
  // Debug: Log method, URL, and headers
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [me.js] ===== Incoming Request =====");
    console.log("Method:", req.method);
    console.log("URL:", req.url);
    console.log("Headers:", req.headers);
    console.log("=======================================");
  }

  try {
    const authHeader = req.headers.authorization;

    // Debug: Log the Authorization header
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG [me.js] Authorization Header:", authHeader);
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] Error: Missing or malformed Authorization header");
      }
      return res.status(401).json({ error: "No auth token provided or malformed header" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] Error: Token extraction failed after 'Bearer'");
      }
      return res.status(401).json({ error: "Invalid Authorization header format" });
    }

    // Debug: Log token (only in non-production)
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG [me.js] Extracted Token:", token);
    }

    // Verify the token with Firebase Admin SDK
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
      if (process.env.NODE_ENV !== "production") {
        console.log("DEBUG [me.js] Token successfully decoded:", decoded);
      }
    } catch (verifyError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("DEBUG [me.js] Firebase token verification failed:", verifyError.message);
      }
      return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    }

    // Success: return decoded user info
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG [me.js] Responding with user info...");
    }

    return res.status(200).json({ user: decoded });

  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("DEBUG [me.js] Unexpected server error:", error);
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
