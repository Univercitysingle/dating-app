import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { handleLoginSuccess, setPendingPasswordSetup } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      // 1. Use Firebase Auth to sign in
      console.log("Attempting Firebase signInWithEmailAndPassword:", email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("Firebase sign in success", user);

      // 2. Get Firebase ID token to send to backend (optional, for backend auth)
      const idToken = await user.getIdToken();
      console.log("Got Firebase ID token", idToken);

      // 3. (Optional) Send the ID token to your backend for custom handling
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: idToken }),
      });
      console.log("Backend /api/auth/login response:", res);

      let data = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
        console.log("Backend JSON:", data);
      }

      if (!res.ok) {
        console.error("Backend login failed", data);
        throw new Error((data && data.error) || res.statusText || "Login failed");
      }

      if (data.requiresPasswordSetup) {
        setPendingPasswordSetup(data.user, data.token);
        navigate("/set-initial-password");
      } else {
        await handleLoginSuccess(data.user, data.token, data.token);
        navigate("/");
      }
    } catch (err) {
      setError(
        (err.code ? `${err.code}: ` : "") +
        (err.message || "Login failed")
      );
      console.error("Login page error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-700">Login</h2>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <div>
          <label htmlFor="email" className="text-sm font-medium text-gray-700 sr-only">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
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
            placeholder="Password"
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
        <p className="text-xs text-center text-gray-500">Login securely with Firebase Auth.</p>
      </div>
    </div>
  );
}

export default Login;
