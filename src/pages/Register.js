import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import PhotoUploader from '../components/PhotoUploader';
import Footer from '../components/Footer';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { subYears } from 'date-fns';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState(null);
  const [gender, setGender] = useState('');
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);

    if (!name.trim() || !birthday || !gender || !photo) {
      setError('Complete your name, birthday, gender and profile photo to continue.');
      return;
    }
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      const token = await user.getIdToken();

      await apiClient.put(
        '/users/me',
        {
          name: name.trim(),
          birthday,
          gender,
          photos: [{ url: photo, order: 0 }],
          location,
          isOnboardingComplete: true,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await sendEmailVerification(user);
      await signOut(auth);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'We could not create your account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Location sharing is not available in this browser. You can continue without it.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          type: 'Point',
          coordinates: [position.coords.longitude, position.coords.latitude],
        });
        setLocationMessage('Location added. You can change location permissions in your browser settings.');
      },
      () => {
        setLocationMessage('Location was not shared. You can still create your account and add it later.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  if (success) {
    return (
      <div className="auth-page register-page flex min-h-screen items-center justify-center px-4 py-12">
        <section className="auth-card register-card register-success-card w-full max-w-lg" role="status">
          <div className="register-success-mark" aria-hidden="true">✓</div>
          <p className="page-eyebrow">ONE LAST STEP</p>
          <h1 className="register-title">Check your inbox</h1>
          <p className="register-intro">
            Your Hart2Hart account has been created. We sent a verification link to <strong>{email}</strong>.
            Verify your email before signing in.
          </p>
          <Link to="/login" className="app-primary-button register-submit block w-full rounded-full px-5 py-4 text-center font-semibold text-white">
            Continue to sign in
          </Link>
          <p className="register-legal">Didn’t receive the email? Check your spam folder before trying again.</p>
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
          <p className="register-intro">Start with the essentials. You can add more to your profile whenever you’re ready.</p>
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

          <div className="register-section-heading register-section-heading-spaced">
            <span>02</span>
            <div><h2>Make it yours</h2><p>Help people recognise you and get to know the basics.</p></div>
          </div>

          <div className="register-field">
            <label htmlFor="name">First name or display name</label>
            <input id="name" name="name" type="text" autoComplete="given-name" required maxLength={50}
              value={name} onChange={(event) => setName(event.target.value)}
              placeholder="What should people call you?" className="form-control" />
          </div>

          <div className="register-field">
            <label htmlFor="birthday">Date of birth</label>
            <DatePicker id="birthday" name="birthday" selected={birthday}
              onChange={(date) => setBirthday(date)} maxDate={subYears(new Date(), 18)}
              minDate={subYears(new Date(), 100)} showYearDropdown yearDropdownItemNumber={100}
              scrollableYearDropdown dateFormat="dd MMM yyyy" placeholderText="Select your date of birth"
              autoComplete="bday" required className="form-control" />
            <p className="register-field-hint">Hart2Hart is for adults aged 18 and over. Your full birth date is not shown on your profile.</p>
          </div>

          <div className="register-field">
            <label htmlFor="gender">Gender</label>
            <select id="gender" name="gender" required value={gender}
              onChange={(event) => setGender(event.target.value)} className="form-control">
              <option value="">Choose an option</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="register-field register-photo-field">
            <div><label>Profile photo</label><p className="register-field-hint">Choose a clear photo that shows you. You can add more photos later.</p></div>
            <PhotoUploader onUploadComplete={(url) => setPhoto(url)} />
            <span className={photo ? 'register-photo-status is-ready' : 'register-photo-status'}>
              {photo ? 'Profile photo added' : 'A profile photo is required to continue'}
            </span>
          </div>

          <div className="register-location-card">
            <div className="register-location-copy">
              <span className="register-location-icon" aria-hidden="true">⌖</span>
              <div><strong>Discover people nearby</strong><p>Share your approximate location to improve local discovery. This is optional.</p></div>
            </div>
            <button type="button" onClick={handleLocation} className="register-location-button">
              {location ? 'Update location' : 'Add location'}
            </button>
            {locationMessage && <p className="register-location-message" role="status">{locationMessage}</p>}
          </div>

          {error && <p className="register-alert register-alert-error" role="alert">{error}</p>}

          <button type="submit" disabled={isSubmitting}
            className="app-primary-button register-submit w-full rounded-full px-5 py-4 font-semibold text-white">
            {isSubmitting ? 'Creating your account…' : 'Create my account'}
          </button>
          <p className="register-legal">
            By creating an account, you confirm that you are 18 or older and agree to our
            {' '}<Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
          <p className="register-signin">Already a member? <Link to="/login">Sign in</Link></p>
        </form>
      </section>
      <div className="register-footer"><Footer /></div>
    </div>
  );
};

export default Register;
