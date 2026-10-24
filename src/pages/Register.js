import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  const [error, setError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name || !birthday || !gender || !photo) {
      setError('Please fill out all fields and upload a photo.');
      return;
    }

    try {
      // First, create the user in Firebase
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const token = await user.getIdToken();

      // Then, update the user's profile with the additional information
      const updatedProfile = await apiClient.put(
        '/users/me',
        {
          name,
          birthday,
          gender,
          photos: [{ url: photo, order: 0 }],
          location,
          isOnboardingComplete: true,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Send verification email
      await sendEmailVerification(user);

      // Log out the user and show a message
      await signOut(auth);
      setError('Registration successful! Please check your email for a verification link.');
    } catch (err) {
      setError(err.message || 'Failed to register.');
    }
  };

  const handleLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            type: 'Point',
            coordinates: [position.coords.longitude, position.coords.latitude],
          });
        },
        (err) => {
          setError(err.message);
        }
      );
    } else {
      setError('Geolocation is not supported by this browser.');
    }
  };

  return (
    <div className="auth-page flex min-h-screen items-center justify-center px-4 py-10">
      <div className="auth-card w-full max-w-lg space-y-6 rounded-3xl p-6 sm:p-9">
        <div className="text-center"><p className="page-eyebrow">YOUR NEXT CHAPTER</p><h2 className="text-3xl font-bold tracking-tight text-gray-900">Create your account</h2><p className="mt-2 text-sm text-gray-500">A few details to get your profile started.</p></div>
        <form onSubmit={handleRegister} className="space-y-6">
          <div>
            <label htmlFor="email-address">Email address</label>
            <input
              id="email-address"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="birthday">Birthday</label>
            <DatePicker
              selected={birthday}
              onChange={(date) => setBirthday(date)}
              maxDate={subYears(new Date(), 18)}
              minDate={subYears(new Date(), 100)}
              showYearDropdown
              yearDropdownItemNumber={100}
              scrollableYearDropdown
              dateFormat="yyyy/MM/dd"
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="gender">Gender</label>
            <select
              id="gender"
              name="gender"
              required
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <PhotoUploader onUploadComplete={(url) => setPhoto(url)} />
          <button
            type="button"
            onClick={handleLocation}
            className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white"
          >
            Get Location
          </button>
          {location && (
            <p className="text-sm text-gray-500">
              Location captured: {location.coordinates[0]}, {location.coordinates[1]}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <button
              type="submit"
              className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white"
            >
              Register
            </button>
          </div>
        </form>
      </div>
      <div className="absolute bottom-0 w-full">
        <Footer />
      </div>
    </div>
  );
};

export default Register;
