import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
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
import Footer from '../components/Footer';

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

  const handleFirebaseEmailAuth = async () => {
    // This function now only handles the Firebase logic
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
      if (!userCredential.user.emailVerified) {
        setError('Please verify your email before logging in.');
        return;
      }
      const token = await userCredential.user.getIdToken();
      await login(token); // This uses the AuthContext login
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    // Superadmin check
    if (email === 'sadmin' && !isSignUp) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        logger.info("Superadmin login API response:", { data });
        if (!response.ok) {
          throw new Error(data.error || 'Superadmin login failed');
        }
        // The Worker returns a Firebase custom token, not an ID token.
        // Exchange it through Firebase Auth so subsequent API calls carry a
        // verifiable Firebase ID token and the superadmin custom claims.
        const credential = await signInWithCustomToken(auth, data.token);
        const idToken = await credential.user.getIdToken();
        await login(idToken, data.user);
        navigate('/admin');
      } catch (err) {
        logger.error('Superadmin login error:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Fallback to Firebase for all other users
      try {
        await handleFirebaseEmailAuth();
      } catch (err) {
        logger.error('Firebase auth error:', err);
        if (err.code === 'auth/invalid-credential') {
          setError('Invalid email or password. Please try again.');
        } else {
          setError(
            (err.code ? `${err.code}: ` : '') +
              (err.message || (isSignUp ? 'Sign up failed' : 'Login failed'))
          );
        }
      } finally {
        setIsLoading(false);
      }
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
    <div
      className="auth-page login-page relative flex flex-col items-center justify-center min-h-screen p-4 pb-8 bg-cover bg-center"
    >
      <div className="auth-card login-card relative z-10 w-full max-w-md space-y-6 rounded-3xl p-6 sm:p-9">
        <img src="/logo.jpg" alt="Hart2Hart Logo" className="mx-auto h-20 w-20 rounded-2xl object-cover shadow-lg" />
        <h2 className="text-center text-3xl font-bold tracking-tight text-white">
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
        {error && (
          <p className="text-sm text-center text-red-400 py-2">{error}</p>
        )}

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
                className="form-control login-control mt-1 w-full rounded-xl px-4 py-3 text-white"
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
                className="form-control login-control mt-1 w-full rounded-xl px-4 py-3 text-white"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
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
                    className="form-control login-control mt-1 w-full rounded-xl px-4 py-3 text-white"
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
                    className="form-control login-control mt-1 w-full rounded-xl px-4 py-3 text-white"
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
                className="form-control login-control mt-1 w-full rounded-xl px-4 py-3 text-white"
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

        <div className="mt-3 space-y-2 text-center text-sm text-gray-300">
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
      <section className="login-seo-content relative z-10 w-full max-w-5xl mt-10 mb-8 px-2 text-white" aria-labelledby="dating-intro-title">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-200">Hart2Hart</p>
          <h1 id="dating-intro-title" className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Meet people. Build genuine connections.</h1>
          <p className="mt-3 text-sm sm:text-base leading-7 text-white/85">
            Hart2Hart is a dating app designed to help adults discover profiles, express interest, connect through conversations and get to know each other at their own pace.
            Create a profile, explore people on Discover and start a conversation when the interest is mutual.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-md">
            <h2 className="font-semibold text-white">Discover profiles</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">Explore member profiles and learn about people before deciding whether to connect.</p>
          </article>
          <article className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-md">
            <h2 className="font-semibold text-white">Connect by mutual interest</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">Like profiles, see who likes you and build connections when interest is shared.</p>
          </article>
          <article className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-md">
            <h2 className="font-semibold text-white">Chat and meet</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">Continue getting to know your matches through private conversations and video calls.</p>
          </article>
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <h2 className="text-xl font-bold text-center">Frequently asked questions</h2>
          <div className="mt-4 space-y-3 text-sm leading-6">
            <details className="rounded-xl border border-white/15 bg-black/25 p-4">
              <summary className="cursor-pointer font-semibold">What is Hart2Hart?</summary>
              <p className="mt-2 text-white/80">Hart2Hart is an online dating app where adults can discover profiles, show interest, match and communicate.</p>
            </details>
            <details className="rounded-xl border border-white/15 bg-black/25 p-4">
              <summary className="cursor-pointer font-semibold">How do I start using Hart2Hart?</summary>
              <p className="mt-2 text-white/80">Create an account, complete your profile and browse the Discover experience to find people you may want to connect with.</p>
            </details>
            <details className="rounded-xl border border-white/15 bg-black/25 p-4">
              <summary className="cursor-pointer font-semibold">Can I chat with people I connect with?</summary>
              <p className="mt-2 text-white/80">Yes. The app includes conversations for connecting with other members. Video calling is available where supported.</p>
            </details>
            <details className="rounded-xl border border-white/15 bg-black/25 p-4">
              <summary className="cursor-pointer font-semibold">Is Hart2Hart for adults?</summary>
              <p className="mt-2 text-white/80">Hart2Hart is intended for adults aged 18 and over.</p>
            </details>
          </div>
        </div>
      </section>
      <div className="relative z-10 w-full mt-6">
        <Footer />
      </div>
    </div>
  );
}

export default Login;
