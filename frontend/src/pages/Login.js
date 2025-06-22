import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";

/**
 * Login page supporting:
 * - New user self sign-up with email/password
 * - Existing user login with email/password
 * - SSO login with Google (add more providers as needed)
 */
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Handle email/password authentication (signup or login)
  const handleEmailAuth = async () => {
    setIsLoading(true);
    setError("");
    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
      // On success: redirect to homepage (or wherever you want)
      navigate("/");
    } catch (err) {
      setError((err.code ? `${err.code}: ` : "") + (err.message || "Login failed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google SSO login
  const handleGoogleSSO = async () => {
    setIsLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate("/");
    } catch (err) {
      setError((err.code ? `${err.code}: ` : "") + (err.message || "SSO login failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-700">
          {isSignUp ? "Sign Up" : "Login"}
        </h2>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <div>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <input
            id="password_login"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          onClick={handleEmailAuth}
          disabled={isLoading}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
        >
          {isLoading
            ? isSignUp
              ? "Signing up..."
              : "Logging in..."
            : isSignUp
            ? "Sign Up"
            : "Login"}
        </button>
        <button
          onClick={handleGoogleSSO}
          disabled={isLoading}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-400 disabled:bg-gray-400 mt-2"
        >
          {isLoading ? "Please wait..." : "Sign in with Google"}
        </button>
        <p className="text-xs text-center text-gray-500 mt-2">
          {isSignUp ? "Already have an account?" : "New user?"}{" "}
          <button
            className="text-indigo-600 hover:underline"
            onClick={() => setIsSignUp(s => !s)}
            disabled={isLoading}
          >
            {isSignUp ? "Login" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Login;
