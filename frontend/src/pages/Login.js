import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const auth = getAuth();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('email_verified') === 'true') {
      if (!verificationMessage) {
        setVerificationMessage(
          'Your email has been successfully verified. Please log in.'
        );
      }
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location, verificationMessage]);

  useEffect(() => {
    setError('');
    setSuccessMessage('');
  }, [isSignUp, showPhone, showReset]);

  const handleEmailAuth = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        if (userCredential && userCredential.user) {
          await sendEmailVerification(userCredential.user);
          await auth.signOut();
          setSuccessMessage(
            'Registration successful! A verification email has been sent. Please verify your email and then log in.'
          );
          setIsSignUp(false);
          setEmail('');
          setPassword('');
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        const token = await userCredential.user.getIdToken();
        await login(token);
        navigate('/');
      }
    } catch (err) {
      logger.error('Email auth error:', err);
      setError(
        (err.code ? `${err.code}: ` : '') +
          (err.message || (isSignUp ? 'Sign up failed' : 'Login failed'))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const token = await userCredential.user.getIdToken();
      await login(token);
      navigate('/');
    } catch (err) {
      logger.error('Google SSO error:', err);
      setError(
        (err.code ? `${err.code}: ` : '') + (err.message || 'SSO login failed')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      if (!email) {
        setError('Please enter your email for password reset.');
        setIsLoading(false);
        return;
      }
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage('Password reset email sent! Please check your inbox.');
      setShowReset(false);
    } catch (err) {
      logger.error('Password reset error:', err);
      setError(
        (err.code ? `${err.code}: ` : '') + (err.message || 'Reset failed')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        'recaptcha-container',
        {
          size: 'invisible',
          callback: () => {},
        },
        auth
      );
    }
    return window.recaptchaVerifier;
  };

  const handleSendOTP = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      if (!phone) {
        setError('Please enter your phone number.');
        setIsLoading(false);
        return;
      }
      const verifier = setupRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmationResult(confirmation);
      setOtpSent(true);
      setSuccessMessage('OTP sent! Please check your phone.');
    } catch (err) {
      logger.error('Send OTP error:', err);
      setError(
        (err.code ? `${err.code}: ` : '') +
          (err.message || 'Failed to send OTP')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      if (!otp) {
        setError('Enter the OTP sent to your phone.');
        setIsLoading(false);
        return;
      }
      const userCredential = await confirmationResult.confirm(otp);
      const token = await userCredential.user.getIdToken();
      await login(token);
      navigate('/');
    } catch (err) {
      logger.error('Verify OTP error:', err);
      setError(
        (err.code ? `${err.code}: ` : '') +
          (err.message || 'OTP verification failed')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-r from-purple-900 via-green-500 to-blue-500 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-black bg-opacity-25 rounded-lg shadow-xl backdrop-blur-sm">
        <h2 className="text-2xl font-bold text-center text-white">
          {showPhone
            ? 'Phone Login'
            : showReset
            ? 'Reset Password'
            : isSignUp
            ? 'Sign Up'
            : 'Login'}
        </h2>
        {verificationMessage && (
          <p className="text-sm text-center text-green-300 py-2">
            {verificationMessage}
          </p>
        )}
        {successMessage && (
          <p className="text-sm text-center text-green-300 py-2">
            {successMessage}
          </p>
        )}
        {error && <p className="text-sm text-center text-red-400 py-2">{error}</p>}

        {!showPhone && !showReset && (
          <>
            <div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
                  ? 'Signing up...'
                  : 'Logging in...'
                : isSignUp
                ? 'Sign Up'
                : 'Login'}
            </button>
            <button
              onClick={handleGoogleSSO}
              disabled={isLoading}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-red-500 bg-opacity-75 rounded-md hover:bg-red-600 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-400 disabled:bg-gray-500 disabled:bg-opacity-50 mt-2"
            >
              {isLoading ? 'Signing in with Google...' : 'Sign in with Google'}
            </button>
          </>
        )}

        {showPhone && (
          <>
            {!otpSent ? (
              <>
                <div>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                  {isLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
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
                  {isLoading ? 'Verifying...' : 'Verify OTP'}
                </button>
              </>
            )}
          </>
        )}

        {showReset && (
          <>
            <div>
              <input
                id="reset_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {isLoading ? 'Sending...' : 'Send Reset Email'}
            </button>
          </>
        )}

        <div className="text-xs text-center text-gray-300 mt-2 space-y-1">
          {!showPhone && !showReset && !isSignUp && (
            <>
              <button
                className="text-green-400 hover:text-green-300 hover:underline mr-2"
                onClick={() => setShowPhone(true)}
                disabled={isLoading}
              >
                Sign in with Phone
              </button>
              <button
                className="text-yellow-400 hover:text-yellow-300 hover:underline"
                onClick={() => setShowReset(true)}
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </>
          )}
          {(showPhone || showReset) && (
            <button
              className="text-indigo-400 hover:text-indigo-300 hover:underline"
              onClick={() => {
                setShowPhone(false);
                setShowReset(false);
                setOtpSent(false);
                setOtp('');
                setError('');
                setSuccessMessage('');
              }}
              disabled={isLoading}
            >
              Back to {isSignUp ? 'Sign Up' : 'Login'}
            </button>
          )}
          {!showPhone && !showReset && (
            <div>
              {isSignUp ? 'Already have an account?' : 'New user?'}{' '}
              <button
                className="text-indigo-400 hover:text-indigo-300 hover:underline"
                onClick={() => setIsSignUp((s) => !s)}
                disabled={isLoading}
              >
                {isSignUp ? 'Login' : 'Sign Up'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
