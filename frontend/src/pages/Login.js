import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification, // Import sendEmailVerification
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
  const [successMessage, setSuccessMessage] = useState(""); // For success messages like OTP sent, etc.
  const [isLoading, setIsLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState(""); // For email verification success message

  // Phone auth states
  const [showPhone, setShowPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('email_verified') === 'true') {
      // Set message only if it's not already set, to avoid loops if component re-renders
      if (!verificationMessage) {
        setVerificationMessage("Your email has been successfully verified. Please log in.");
      }
      // Clean up the URL query parameter immediately after detecting it
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location, verificationMessage]); // Depend on location to check query param, and verificationMessage to avoid re-setting

  useEffect(() => {
    // Clear error messages when the form mode changes (e.g., switching from login to signup).
    // The `verificationMessage` (for "email verified") is sticky once set by the URL param for the current page view,
    // but will clear if the user navigates away and back without the param.
    // Other messages like "OTP Sent" are typically part of the `error` state variable which is already styled for success/error.
    setError("");
    setSuccessMessage(""); // Clear success messages too
  }, [isSignUp, showPhone, showReset]); // Trigger only when these state variables change


  // Handle email/password authentication (signup or login)
  const handleEmailAuth = async () => {
    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // After successful user creation, send verification email
        if (userCredential && userCredential.user) {
          await sendEmailVerification(userCredential.user);
          await auth.signOut(); // Sign out the user client-side
          setSuccessMessage("Registration successful! A verification email has been sent. Please verify your email and then log in.");
          // Do not navigate immediately, user needs to verify first.
          setIsSignUp(false); // Switch back to login mode
          setEmail(""); // Clear email
          setPassword(""); // Clear password
        }
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        // On successful login: redirect to homepage
        navigate("/");
      }
    } catch (err) {
      setError((err.code ? `${err.code}: ` : "") + (err.message || (isSignUp ? "Sign up failed" : "Login failed")));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google SSO login
  const handleGoogleSSO = async () => {
    setIsLoading(true);
    setError("");
    setSuccessMessage("");
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
    setSuccessMessage("");
    try {
      if (!email) {
        setError("Please enter your email for password reset.");
        setIsLoading(false);
        return;
      }
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage("Password reset email sent! Please check your inbox.");
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
    setSuccessMessage("");
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
      setSuccessMessage("OTP sent! Please check your phone.");
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
    setSuccessMessage("");
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
      {/* Consider adding a background image or gradient to the parent div for better transparent effect */}
      <div className="w-full max-w-md p-8 space-y-6 bg-black bg-opacity-25 rounded-lg shadow-xl backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-center text-white">
          {showPhone
            ? "Phone Login"
            : showReset
            ? "Reset Password"
            : isSignUp
            ? "Sign Up"
            : "Login"}
        </h2>
        {verificationMessage && (
          <p className="text-sm text-center text-green-300 py-2">{verificationMessage}</p>
        )}
        {successMessage && (
          <p className="text-sm text-center text-green-300 py-2">{successMessage}</p>
        )}
        {error && (
          <p className="text-sm text-center text-red-400 py-2">{error}</p>
        )}

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
                aria-label="Email Address"
                className="w-full px-3 py-2 mt-1 text-white bg-transparent border border-gray-400 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                aria-label="Password"
                className="w-full px-3 py-2 mt-1 text-white bg-transparent border border-gray-400 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleEmailAuth}
              disabled={isLoading}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-500 bg-opacity-75 rounded-md hover:bg-indigo-600 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-gray-500 disabled:bg-opacity-50"
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
              className="w-full px-4 py-2 text-sm font-medium text-white bg-red-500 bg-opacity-75 rounded-md hover:bg-red-600 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-400 disabled:bg-gray-500 disabled:bg-opacity-50 mt-2"
            >
              {isLoading ? "Signing in with Google..." : "Sign in with Google"}
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
                    aria-label="Phone Number"
                    className="w-full px-3 py-2 mt-1 text-white bg-transparent border border-gray-400 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                {showPhone && <div id="recaptcha-container" />}
                <button
                  onClick={handleSendOTP}
                  disabled={isLoading}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-green-500 bg-opacity-75 rounded-md hover:bg-green-600 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 disabled:bg-gray-500 disabled:bg-opacity-50 mt-2"
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
                    aria-label="One-Time Password"
                    className="w-full px-3 py-2 mt-1 text-white bg-transparent border border-gray-400 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleVerifyOTP}
                  disabled={isLoading}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-green-500 bg-opacity-75 rounded-md hover:bg-green-600 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 disabled:bg-gray-500 disabled:bg-opacity-50 mt-2"
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
                aria-label="Email for password reset"
                className="w-full px-3 py-2 mt-1 text-white bg-transparent border border-gray-400 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleResetPassword}
              disabled={isLoading}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-yellow-500 bg-opacity-75 rounded-md hover:bg-yellow-600 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-yellow-400 disabled:bg-gray-500 disabled:bg-opacity-50 mt-2"
            >
              {isLoading ? "Sending..." : "Send Reset Email"}
            </button>
          </>
        )}

        {/* Switch links */}
        <div className="text-xs text-center text-gray-300 mt-2 space-y-1"> {/* Changed text-gray-500 to text-gray-300 */}
          {!showPhone && !showReset && !isSignUp && (
            <>
              <button
                className="text-green-400 hover:text-green-300 hover:underline mr-2" // Adjusted green
                onClick={() => setShowPhone(true)}
                disabled={isLoading}
              >
                Sign in with Phone
              </button>
              <button
                className="text-yellow-400 hover:text-yellow-300 hover:underline" // Adjusted yellow
                onClick={() => setShowReset(true)}
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </>
          )}
          {(showPhone || showReset) && (
            <button
              className="text-indigo-400 hover:text-indigo-300 hover:underline" // Adjusted indigo
              onClick={() => {
                setShowPhone(false);
                setShowReset(false);
                setOtpSent(false);
                setOtp("");
                setError("");
                setSuccessMessage("");
              }}
              disabled={isLoading}
            >
              Back to {isSignUp ? "Sign Up" : "Login"}
            </button>
          )}
          {!showPhone && !showReset && (
            <div>
              {isSignUp ? "Already have an account?" : "New user?"}{" "} {/* This text will inherit text-gray-300 from parent */}
              <button
                className="text-indigo-400 hover:text-indigo-300 hover:underline" // Adjusted indigo
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
