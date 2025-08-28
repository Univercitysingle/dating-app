import React, { useState } from 'react';

const LifestyleEditor = ({ initialLifestyle, onSave }) => {
  const [lifestyle, setLifestyle] = useState(initialLifestyle || {});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLifestyle((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSave(lifestyle);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="pets" className="block text-sm font-medium text-gray-700">
          Pets
        </label>
        <select
          id="pets"
          name="pets"
          value={lifestyle.pets || ''}
          onChange={handleChange}
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
        <label htmlFor="zodiac" className="block text-sm font-medium text-gray-700">
          Zodiac
        </label>
        <input
          type="text"
          id="zodiac"
          name="zodiac"
          value={lifestyle.zodiac || ''}
          onChange={handleChange}
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
          value={lifestyle.workout || ''}
          onChange={handleChange}
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
          value={lifestyle.drinking || ''}
          onChange={handleChange}
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
          value={lifestyle.smoking || ''}
          onChange={handleChange}
          className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select...</option>
          <option value="Socially">Socially</option>
          <option value="Sometimes">Sometimes</option>
          <option value="Never">Never</option>
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
            onChange={handleChange}
            className="block w-full px-3 py-2 mt-1 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select...</option>
            <option value="Relationship">Relationship</option>
            <option value="Casual">Casual</option>
            <option value="Friendship">Friendship</option>
            <option value="Don't know yet">Don't know yet</option>
          </select>
        </div>
        <div>
          <label htmlFor="religion" className="block text-sm font-medium text-gray-700">
            Religion
          </label>
          <input
            type="text"
            id="religion"
            name="religion"
            value={lifestyle.religion || ''}
            onChange={handleChange}
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
            onChange={handleChange}
            className="block w-full px-3 py-2 mt-1 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      <button
        onClick={handleSave}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        Save Lifestyle
      </button>
    </div>
  );
};

export default LifestyleEditor;
