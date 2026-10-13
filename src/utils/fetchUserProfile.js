import apiClient from "../api/apiClient";

/**
 * Fetch the current user's profile from the backend API.
 */
export async function fetchUserProfile() {
  try {
    const user = await apiClient.get("/users/me");
    return user;
  } catch (error) {
    console.error("Failed to fetch user profile", error);
    throw error;
  }
}
