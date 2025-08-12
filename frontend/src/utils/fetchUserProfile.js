import { getAuth } from "firebase/auth";

/**
 * Fetch the current user's profile from the backend API,
 * sending the Firebase ID token in the Authorization header.
 * Includes debug logging for development.
 */
export async function fetchUserProfile() {
  const auth = getAuth();
  const user = auth.currentUser;

  // Debug: Log current user object
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [fetchUserProfile] Firebase currentUser:", user);
  }

  if (!user) {
    throw new Error("No Firebase user is logged in.");
  }

  // Get the user's ID token
  const token = await user.getIdToken();

  // Debug: Log token (DO NOT log in production)
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [fetchUserProfile] ID token:", token);
  }

  const apiUrl = "https://huggingface.co/spaces/enadac/datingapp/api/users/me";

  // Debug: Log API URL
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [fetchUserProfile] API URL:", apiUrl);
  }

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // Debug: Log response status and headers
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [fetchUserProfile] Response status:", response.status);
    console.log("DEBUG [fetchUserProfile] Response headers:", response.headers);
  }

  // Read raw response text for debugging
  const raw = await response.text();
  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG [fetchUserProfile] Raw response:", raw);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Response is not valid JSON: " + raw);
  }

  if (!response.ok) {
    throw new Error(json.error || "Failed to fetch user profile");
  }

  return json;
}
