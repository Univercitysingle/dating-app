import admin from "../../services/firebaseAdmin";

/**
 * API route to return the current user's decoded Firebase token info.
 * Expects Authorization: Bearer <token> header.
 */
export default async function handler(req, res) {
  // Allow only GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional: Set CORS headers if called from browser
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [me.js] Request method:", req.method);
    console.log("DEBUG [me.js] Request headers:", req.headers);
  }

  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("DEBUG [me.js] Missing or malformed Authorization header");
      }
      return res.status(401).json({ error: "No valid Authorization token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("DEBUG [me.js] Token not found after Bearer");
      }
      return res.status(401).json({ error: "Authorization token format invalid" });
    }

    // Verify the token using Firebase Admin
    const decoded = await admin.auth().verifyIdToken(token);

    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG [me.js] Firebase token decoded:", decoded);
    }

    return res.status(200).json({ user: decoded });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("DEBUG [me.js] Firebase verification failed or unexpected error:", error);
    }
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}
