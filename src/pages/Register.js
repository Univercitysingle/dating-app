import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  reload,
  signOut,
} from 'firebase/auth';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [canResend, setCanResend] = useState(false);

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);
    setCanResend(false);

    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setSuccess(true);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setCanResend(true);
        setError('An account already exists with this email. Sign in, or resend its verification email below.');
      } else {
        setCanResend(Boolean(auth.currentUser));
        setError(err.message || 'We could not create your account. Please try again.');
      }
      try {
        if (auth.currentUser) await signOut(auth);
      } catch {
        // Keep the original registration error visible.
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await reload(credential.user);
      if (credential.user.emailVerified) {
        setCanResend(false);
        setSuccess(true);
        setError('This email is already verified. You can sign in and complete your profile.');
      } else {
        await sendEmailVerification(credential.user);
        setSuccess(true);
        setCanResend(false);
      }
    } catch (err) {
      setError(err.message || 'We could not resend the verification email. Check your details and try again.');
    } finally {
      try {
        if (auth.currentUser) await signOut(auth);
      } catch {
        // The verification result remains visible even if local sign-out fails.
      }
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page register-page flex min-h-screen items-center justify-center px-4 py-12">
        <section className="auth-card register-card register-success-card w-full max-w-lg" role="status">
          <div className="register-success-mark" aria-hidden="true">✓</div>
          <p className="page-eyebrow">ONE LAST STEP</p>
          <h1 className="register-title">Verify your email</h1>
          <p className="register-intro">
            We sent a verification link to <strong>{email}</strong>. Open that email and verify your address before signing in.
            You will then complete your profile, including your birthday, gender and profile photo.
          </p>
          <Link to="/login" className="app-primary-button register-submit block w-full rounded-full px-5 py-4 text-center font-semibold text-white">
            Continue to sign in
          </Link>
          <p className="register-legal">If the email is missing, check your spam folder. You can return here to request another verification email.</p>
        </section>
        <div className="register-footer"><Footer /></div>
      </div>
    );
  }

  return (
    <div className="auth-page register-page flex min-h-screen items-center justify-center px-4 py-12">
      <section className="auth-card register-card w-full max-w-xl">
        <header className="register-heading">
          <Link to="/" className="register-brand" aria-label="Hart2Hart home">
            <img src="/logo.jpg" alt="" width="42" height="42" />
            <span>Hart2Hart</span>
          </Link>
          <p className="page-eyebrow">YOUR NEXT CHAPTER</p>
          <h1 className="register-title">Create your account</h1>
          <p className="register-intro">Start with a secure account. After verifying your email, you can build your profile in a guided setup.</p>
          <div className="register-progress" aria-label="Registration progress">
            <span /><span /><span />
            <small>Account setup</small>
          </div>
        </header>

        <form onSubmit={handleRegister} className="register-form">
          <div className="register-section-heading">
            <span>01</span>
            <div><h2>Your sign-in details</h2><p>Use an email address you can access.</p></div>
          </div>

          <div className="register-field">
            <label htmlFor="email-address">Email address</label>
            <input id="email-address" name="email" type="email" autoComplete="email" required
              value={email} onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com" className="form-control" />
          </div>

          <div className="register-field">
            <label htmlFor="password">Password</label>
            <div className="register-password-wrap">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete="new-password" required minLength={6} value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters" className="form-control" />
              <button type="button" className="register-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="register-field-hint">Use at least 6 characters. Avoid reusing a password from another site.</p>
          </div>

          {error && <p className="register-alert register-alert-error" role="alert">{error}</p>}

          <button type="submit" disabled={isSubmitting}
            className="app-primary-button register-submit w-full rounded-full px-5 py-4 font-semibold text-white">
            {isSubmitting ? 'Creating your account…' : 'Create my account'}
          </button>
          {canResend && (
            <button type="button" onClick={handleResendVerification} disabled={isSubmitting}
              className="register-location-button w-full">
              {isSubmitting ? 'Please wait…' : 'Resend verification email'}
            </button>
          )}
          <p className="register-legal">
            By creating an account, you confirm that you are 18 or older and agree to our
            {' '}<Link to="/terms">Terms</Link> and <Link to="/privacy-settings">Privacy settings</Link>.
          </p>
          <p className="register-signin">Already a member? <Link to="/login">Sign in</Link></p>
        </form>
      </section>
      <div className="register-footer"><Footer /></div>
    </div>
  );
};

export default Register;
