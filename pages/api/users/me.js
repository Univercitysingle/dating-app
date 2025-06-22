// pages/api/users/me.js

import admin from "../../services/firebaseAdmin"; // Adjust this import to your Firebase Admin export

export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No auth token" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Invalid auth header" });

    // Verify the token with Firebase Admin SDK
    const decoded = await admin.auth().verifyIdToken(token);

    // Respond with user info from the decoded token
    res.status(200).json({ user: decoded });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Auth error:", error);
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
}
