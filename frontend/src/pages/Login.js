import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";

/**
 * Login page supporting:
 * - New user self sign-up with email/password
 * - Existing user login with email/password
 * - SSO login with Google
 * - Phone/OTP login
 * - Password reset
 */
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Phone auth states
  const [showPhone, setShowPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);

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

  // Handle password reset
  const handleResetPassword = async () => {
    setIsLoading(true);
    setError("");
    try {
      if (!email) {
        setError("Please enter your email for password reset.");
        setIsLoading(false);
        return;
      }
      await sendPasswordResetEmail(auth, email);
      setError("Password reset email sent! Please check your inbox.");
      setShowReset(false);
    } catch (err) {
      setError((err.code ? `${err.code}: ` : "") + (err.message || "Reset failed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Setup Recaptcha for phone auth
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        "recaptcha-container",
        {
          size: "invisible",
          callback: () => {},
        },
        auth
      );
    }
    return window.recaptchaVerifier;
  };

  // Handle sending OTP
  const handleSendOTP = async () => {
    setIsLoading(true);
    setError("");
    try {
      if (!phone) {
        setError("Please enter your phone number.");
        setIsLoading(false);
        return;
      }
      const verifier = setupRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmationResult(confirmation);
      setOtpSent(true);
      setError("OTP sent! Please check your phone.");
    } catch (err) {
      setError((err.code ? `${err.code}: ` : "") + (err.message || "Failed to send OTP"));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle verifying OTP
  const handleVerifyOTP = async () => {
    setIsLoading(true);
    setError("");
    try {
      if (!otp) {
        setError("Enter the OTP sent to your phone.");
        setIsLoading(false);
        return;
      }
      await confirmationResult.confirm(otp);
      navigate("/");
    } catch (err) {
      setError((err.code ? `${err.code}: ` : "") + (err.message || "OTP verification failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-700">
          {showPhone
            ? "Phone Login"
            : showReset
            ? "Reset Password"
            : isSignUp
            ? "Sign Up"
            : "Login"}
        </h2>
        {error && <p className={`text-sm text-center ${error.includes("sent") ? "text-green-600" : "text-red-500"}`}>{error}</p>}

        {/* Email/Password Login or Signup */}
        {!showPhone && !showReset && (
          <>
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
          </>
        )}

        {/* Phone Login (OTP) */}
        {showPhone && (
          <>
            {!otpSent ? (
              <>
                <div>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1234567890"
                    autoComplete="tel"
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div id="recaptcha-container" />
                <button
                  onClick={handleSendOTP}
                  disabled={isLoading}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 mt-2"
                >
                  {isLoading ? "Sending OTP..." : "Send OTP"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    placeholder="Enter OTP"
                    autoComplete="one-time-code"
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleVerifyOTP}
                  disabled={isLoading}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 mt-2"
                >
                  {isLoading ? "Verifying..." : "Verify OTP"}
                </button>
              </>
            )}
          </>
        )}

        {/* Forgot Password */}
        {showReset && (
          <>
            <div>
              <input
                id="reset_email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleResetPassword}
              disabled={isLoading}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 disabled:bg-gray-400 mt-2"
            >
              {isLoading ? "Sending..." : "Send Reset Email"}
            </button>
          </>
        )}

        {/* Switch links */}
        <div className="text-xs text-center text-gray-500 mt-2 space-y-1">
          {!showPhone && !showReset && (
            <>
              <button
                className="text-green-600 hover:underline mr-2"
                onClick={() => setShowPhone(true)}
                disabled={isLoading}
              >
                Sign in with Phone
              </button>
              <button
                className="text-yellow-600 hover:underline"
                onClick={() => setShowReset(true)}
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </>
          )}
          {(showPhone || showReset) && (
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => {
                setShowPhone(false);
                setShowReset(false);
                setOtpSent(false);
                setOtp("");
                setError("");
              }}
              disabled={isLoading}
            >
              Back to {isSignUp ? "Sign Up" : "Login"}
            </button>
          )}
          {!showPhone && !showReset && (
            <div>
              {isSignUp ? "Already have an account?" : "New user?"}{" "}
              <button
                className="text-indigo-600 hover:underline"
                onClick={() => setIsSignUp(s => !s)}
                disabled={isLoading}
              >
                {isSignUp ? "Login" : "Sign Up"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
