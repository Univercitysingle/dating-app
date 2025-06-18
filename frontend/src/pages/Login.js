import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // Use Firebase auth email/password or OAuth in real app
  const [error, setError] = useState("");
  const { loginWithCustomToken } = useAuth();

  const handleLogin = async () => {
    try {
      // For demonstration, simulate Firebase signInWithEmailAndPassword or OAuth here

      // Get Firebase custom token from backend
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "FAKE_FIREBASE_ID_TOKEN" }), // Replace with real Firebase token from client Firebase auth
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      await loginWithCustomToken(data.token);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-form">
      <h2>Login (Mock)</h2>
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
      {error && <p className="error">{error}</p>}
      <p>Replace with real Firebase auth flow.</p>
    </div>
  );
}

export default Login;
