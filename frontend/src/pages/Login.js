import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom"; // Import useNavigate

function Login() {
  const [email, setEmail] = useState(""); // Still useful for demo, or if Firebase email/pass is used
  const [password, setPassword] = useState(""); // Still useful for demo
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { handleLoginSuccess, setPendingPasswordSetup } = useAuth();
  const navigate = useNavigate(); // Initialize useNavigate

  const handleLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      // In a real app, here you would get the Firebase ID token after Firebase client-side login
      // For example: const firebaseIdToken = await auth.currentUser.getIdToken();
      const firebaseIdToken = "FAKE_FIREBASE_ID_TOKEN"; // Replace with actual Firebase ID token retrieval

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: firebaseIdToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      if (data.requiresPasswordSetup) {
        // Pass the backend user object and the token needed for API calls
        setPendingPasswordSetup(data.user, data.token);
        navigate("/set-initial-password"); // Redirect to set password page
      } else {
        // The backend `data.token` is the one for our API.
        // `data.user` is the full user profile from our DB.
        // If Firebase client sign-in is needed with a custom token, backend should provide it.
        // Assuming `data.token` from backend /api/auth/login IS the Firebase ID token (or a custom token for Firebase)
        // AND our backend API uses this same token for its own auth.
        await handleLoginSuccess(data.user, data.token, data.token);
        navigate("/"); // Redirect to home or dashboard
      }
    } catch (err) {
      setError(err.message);
      console.error("Login page error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-700">Login (Mock)</h2>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <div>
          <label htmlFor="email" className="text-sm font-medium text-gray-700 sr-only">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email (demo only)"
            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="password_login" className="text-sm font-medium text-gray-700 sr-only">Password</label>
          <input
            id="password_login"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password (demo only)"
            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
        >
          {isLoading ? "Logging in..." : "Login"}
        </button>
        <p className="text-xs text-center text-gray-500">This is a mock login. Replace with real Firebase client-side auth flow.</p>
      </div>
    </div>
  );
}

export default Login;
