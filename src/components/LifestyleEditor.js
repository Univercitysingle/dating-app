import React, { useState } from 'react';

const LifestyleEditor = ({ initialLifestyle, initialBadges, initialSexualOrientation, onChange }) => {
  const lifestyle = initialLifestyle || {};
  const badges = initialBadges || {};
  const sexualOrientation = initialSexualOrientation || '';

  const handleLifestyleChange = (e) => {
    const { name, value } = e.target;
    const newLifestyle = { ...lifestyle, [name]: value };
    if (name === 'lookingFor' && value !== 'Casual (FWB)') {
      onChange({ lifestyle: newLifestyle, badges, sexualOrientation: '' });
    } else {
      onChange({ lifestyle: newLifestyle, badges, sexualOrientation });
    }
  };

  const handleBadgesChange = (e) => {
    const { name, value } = e.target;
    const newBadges = { ...badges, [name]: value };
    onChange({ lifestyle, badges: newBadges, sexualOrientation });
  };

  const handleSexualOrientationChange = (e) => {
    const { value } = e.target;
    onChange({ lifestyle, badges, sexualOrientation: value });
  };

  return (
    <div className="space-y-4">
      {/* Lifestyle fields */}
      <div>
        <label htmlFor="pets" className="block text-sm font-medium text-gray-700">
          Pets
        </label>
        <select
          id="pets"
          name="pets"
          value={lifestyle.pets || ''}
          onChange={handleLifestyleChange}
          className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          <option value="Dog person">Dog person</option>
          <option value="Cat person">Cat person</option>
          <option value="No pets">No pets</option>
          <option value="All the pets">All the pets</option>
        </select>
      </div>
      <div>
        <label htmlFor="lookingFor" className="block text-sm font-medium text-gray-700">
          Looking For
        </label>
        <select
          id="lookingFor"
          name="lookingFor"
          value={lifestyle.lookingFor || ''}
          onChange={handleLifestyleChange}
          className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          <option value="Relationship">Relationship</option>
          <option value="Casual (FWB)">Casual (FWB)</option>
          <option value="Friendship">Friendship</option>
          <option value="Don't know yet">Don't know yet</option>
        </select>
      </div>

      {lifestyle.lookingFor === 'Casual (FWB)' && (
        <div>
          <label htmlFor="sexualOrientation" className="block text-sm font-medium text-gray-700">
            Sexual Orientation
          </label>
          <select
            id="sexualOrientation"
            name="sexualOrientation"
            value={sexualOrientation}
            onChange={handleSexualOrientationChange}
            className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
          >
            <option value="">Select...</option>
            <option value="Straight / Heterosexual">Straight / Heterosexual</option>
            <option value="Gay (Homosexual - Male)">Gay (Homosexual - Male)</option>
            <option value="Lesbian (Homosexual - Female)">Lesbian (Homosexual - Female)</option>
            <option value="Bisexual (Bi)">Bisexual (Bi)</option>
            <option value="Pansexual">Pansexual</option>
            <option value="Asexual">Asexual</option>
            <option value="Queer">Queer</option>
            <option value="Prefer Not to Say">Prefer Not to Say</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="religion" className="block text-sm font-medium text-gray-700">
          Religion
        </label>
        <input
          type="text"
          id="religion"
          name="religion"
          value={lifestyle.religion || ''}
          onChange={handleLifestyleChange}
          className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      <div>
        <label htmlFor="politicalLeaning" className="block text-sm font-medium text-gray-700">
          Political Leaning
        </label>
        <input
          type="text"
          id="politicalLeaning"
          name="politicalLeaning"
          value={lifestyle.politicalLeaning || ''}
          onChange={handleLifestyleChange}
          className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>

      {/* Badges fields */}
      <hr className="my-6" />
      <h3 className="text-lg font-medium leading-6 text-gray-900">Badges</h3>

      <div>
        <label htmlFor="height" className="block text-sm font-medium text-gray-700">
          Height (cm)
        </label>
        <input
          type="number"
          id="height"
          name="height"
          value={badges.height || ''}
          onChange={handleBadgesChange}
          className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      <div>
        <label htmlFor="zodiac" className="block text-sm font-medium text-gray-700">
          Zodiac
        </label>
        <input
          type="text"
          id="zodiac"
          name="zodiac"
          value={badges.zodiac || ''}
          onChange={handleBadgesChange}
          className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      <div>
        <label htmlFor="workout" className="block text-sm font-medium text-gray-700">
          Workout
        </label>
        <select
          id="workout"
          name="workout"
          value={badges.workout || ''}
          onChange={handleBadgesChange}
          className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          <option value="Every day">Every day</option>
          <option value="Often">Often</option>
          <option value="Sometimes">Sometimes</option>
          <option value="Never">Never</option>
        </select>
      </div>
      <div>
        <label htmlFor="drinking" className="block text-sm font-medium text-gray-700">
          Drinking
        </label>
        <select
          id="drinking"
          name="drinking"
          value={badges.drinking || ''}
          onChange={handleBadgesChange}
          className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          <option value="Frequently">Frequently</option>
          <option value="Socially">Socially</option>
          <option value="Rarely">Rarely</option>
          <option value="Never">Never</option>
        </select>
      </div>
      <div>
        <label htmlFor="smoking" className="block text-sm font-medium text-gray-700">
          Smoking
        </label>
        <select
          id="smoking"
          name="smoking"
          value={badges.smoking || ''}
          onChange={handleBadgesChange}
          className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          <option value="Socially">Socially</option>
          <option value="Sometimes">Sometimes</option>
          <option value="Never">Never</option>
        </select>
      </div>

    </div>
  );
};

export default LifestyleEditor;
