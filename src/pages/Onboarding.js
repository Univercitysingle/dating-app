import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import PhotoUploader from '../components/PhotoUploader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { subYears } from 'date-fns';

const Onboarding = () => {
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState(null);
  const [gender, setGender] = useState('');
  const [personalityType, setPersonalityType] = useState('');
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name || !birthday || !gender || !photo || !personalityType) {
      setError('Please fill out all fields, upload a photo, and select a personality type.');
      return;
    }

    try {
      const updatedProfile = await apiClient.put(
        '/api/users/me',
        {
          name,
          birthday,
          gender,
          photos: [{ url: photo, order: 0 }],
          location,
          personalityType,
          isOnboardingComplete: true,
        }
      );
      if (typeof setUser === 'function') {
        setUser(updatedProfile);
        navigate('/discover');
      } else {
        console.error("setUser is not a function in Onboarding.js. AuthContext value:", { user, setUser });
        // Force a reload to try and get the latest context
        window.location.reload();
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
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center">Complete Your Profile</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
              className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
          <PhotoUploader onUploadComplete={(url) => setPhoto(url)} />
          <button
            type="button"
            onClick={handleLocation}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
