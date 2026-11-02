import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import PhotoUploader from '../components/PhotoUploader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { subYears } from 'date-fns';
import { validateMobileNumber } from '../utils/helpers';

const Onboarding = () => {
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState(null);
  const [gender, setGender] = useState('');
  const [personalityType, setPersonalityType] = useState('');
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [mobileNumber, setMobileNumber] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [education, setEducation] = useState('');
  const [relationshipGoals, setRelationshipGoals] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [sexualOrientation, setSexualOrientation] = useState('');
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name || !birthday || !gender || !photo || !personalityType || !mobileNumber || !heightFeet || !heightInches || !education || !relationshipGoals || !lookingFor) {
      setError('Please fill out all fields, upload a photo, and select a personality type.');
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(mobileNumber.trim())) {
      setError('Enter your mobile number in international format, for example +971501234567.');
      return;
    }

    const heightInCm = Math.round((parseInt(heightFeet, 10) * 30.48) + (parseInt(heightInches, 10) * 2.54));

    try {
      const updatedProfile = await apiClient.put(
        '/users/me',
        {
          name,
          birthday,
          gender,
          photos: [{ url: photo, order: 0 }],
          location,
          personalityType,
          ...(sexualOrientation ? { sexualOrientation } : {}),
          mobileNumber: mobileNumber.trim(),
          education,
          relationshipGoals,
          lifestyle: { lookingFor },
          badges: { height: heightInCm },
          isOnboardingComplete: true,
        }
      );
      if (typeof setUser === 'function') {
        // Explicitly set onboarding as complete on the frontend to prevent redirect loops.
        // This is more reliable than trusting the API response to have the immediate update.
        setUser(prevUser => ({
            ...prevUser,
            ...updatedProfile,
            isOnboardingComplete: true,
        }));
        navigate('/discover');
      } else {
        console.error("setUser is not a function in Onboarding.js. AuthContext value:", { user, setUser });
        // As a fallback, force a reload to get the latest user profile from the server.
        window.location.href = '/discover';
      }
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
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
      <div className="auth-card w-full max-w-xl space-y-6 rounded-3xl p-6 sm:p-9">
        <div className="text-center"><p className="page-eyebrow">MAKE IT YOU</p><h2 className="text-3xl font-bold tracking-tight text-gray-900">Complete your profile</h2><p className="mt-2 text-sm text-gray-500">Help people get to know the real you.</p></div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength="25"
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
          <div>
            <label htmlFor="personalityType">Personality Type</label>
            <select
              id="personalityType"
              name="personalityType"
              required
              value={personalityType}
              onChange={(e) => setPersonalityType(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            >
              <option value="">Select Personality Type</option>
              {[
                'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
                'ISTP', 'ISFP', 'INFP', 'INTP',
                'ESTP', 'ESFP', 'ENFP', 'ENTP',
                'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
              ].map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mobileNumber">Mobile Number</label>
            <input
              id="mobileNumber"
              name="mobileNumber"
              type="tel"
              required
              value={mobileNumber}
              onChange={(e) => {
                const value = validateMobileNumber(e.target.value);
                if (value.length <= 16) {
                  setMobileNumber(value);
                }
              }}
              maxLength="16"
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            />
          </div>
          <div className="flex space-x-4">
            <div>
              <label htmlFor="heightFeet">Height (feet)</label>
              <input
                id="heightFeet"
                name="heightFeet"
                type="number"
                required
                value={heightFeet}
                onChange={(e) => {
                  if (e.target.value.length > 2) {
                    e.target.value = e.target.value.slice(0, 2);
                  }
                  setHeightFeet(e.target.value.replace(/[^0-9]/g, ''));
                }}
                maxLength="2"
                className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="heightInches">Height (inches)</label>
              <input
                id="heightInches"
                name="heightInches"
                type="number"
                required
                value={heightInches}
                onChange={(e) => {
                  if (e.target.value.length > 2) {
                    e.target.value = e.target.value.slice(0, 2);
                  }
                  setHeightInches(e.target.value.replace(/[^0-9]/g, ''));
                }}
                maxLength="2"
                className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="education">Education</label>
            <input
              id="education"
              name="education"
              type="text"
              required
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="relationshipGoals">Relationship Goals</label>
            <select
              id="relationshipGoals"
              name="relationshipGoals"
              required
              value={relationshipGoals}
              onChange={(e) => setRelationshipGoals(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            >
              <option value="">Select Goals</option>
              <option value="Long-term relationship">Long-term relationship</option>
              <option value="Long-term, open to short">Long-term, open to short</option>
              <option value="Short-term, open to long">Short-term, open to long</option>
              <option value="Short-term fun">Short-term fun</option>
              <option value="New friends">New friends</option>
              <option value="Figuring it out">Figuring it out</option>
            </select>
          </div>
          {lookingFor === 'Casual (FWB)' && (
            <div>
              <label htmlFor="sexualOrientation">Sexual Orientation</label>
              <select
                id="sexualOrientation"
                name="sexualOrientation"
                required
                value={sexualOrientation}
                onChange={(e) => setSexualOrientation(e.target.value)}
                className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
              >
                <option value="">Select Sexual Orientation</option>
                <option value="Straight">Straight</option>
                <option value="Gay">Gay</option>
                <option value="Lesbian">Lesbian</option>
                <option value="Bisexual">Bisexual</option>
                <option value="Pansexual">Pansexual</option>
                <option value="Asexual">Asexual</option>
                <option value="Queer">Queer</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="lookingFor">Looking For</label>
            <select
              id="lookingFor"
              name="lookingFor"
              required
              value={lookingFor}
              onChange={(e) => setLookingFor(e.target.value)}
              className="form-control mt-1 block w-full rounded-xl px-3 py-3 sm:text-sm"
            >
              <option value="">Select What You're Looking For</option>
              <option value="Relationship">Relationship</option>
              <option value="Casual (FWB)">Casual (FWB)</option>
              <option value="Friendship">Friendship</option>
              <option value="Don't know yet">Don't know yet</option>
            </select>
          </div>
          <PhotoUploader onUploadComplete={(response) => setPhoto(response.fileUrl)} />
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
              Save and Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Onboarding;
