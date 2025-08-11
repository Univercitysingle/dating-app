import React, { useState, useEffect } from 'react';
import { PREDEFINED_PERSONALITY_TYPES } from '../utils/constants';

const MatchFilters = ({ onApplyFilters, initialFilters = {} }) => {
  const [education, setEducation] = useState('');
  const [relationshipGoals, setRelationshipGoals] = useState('');
  const [interests, setInterests] = useState(''); // Comma-separated string
  const [personalityType, setPersonalityType] = useState('');

  useEffect(() => {
    setEducation(initialFilters.education || '');
    setRelationshipGoals(initialFilters.relationshipGoals || '');
    setInterests(initialFilters.interests || '');
    setPersonalityType(initialFilters.personalityType || '');
  }, [initialFilters]);

  const handleApply = () => {
    const filtersToApply = {};
    if (education.trim()) filtersToApply.education = education.trim();
    if (relationshipGoals.trim())
      filtersToApply.relationshipGoals = relationshipGoals.trim();
    if (interests.trim()) filtersToApply.interests = interests.trim(); // Send as comma-separated string
    if (personalityType) filtersToApply.personalityType = personalityType; // Send selected type
    onApplyFilters(filtersToApply);
  };

  const handleClear = () => {
    setEducation('');
    setRelationshipGoals('');
    setInterests('');
    setPersonalityType('');
    onApplyFilters({}); // Apply empty filters to reset
  };

  return (
    <div className="p-4 my-4 bg-white shadow-md rounded-lg">
      <h3 className="text-lg font-semibold mb-3 text-gray-700">
        Filter Matches
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label
            htmlFor="filter-education"
            className="block text-sm font-medium text-gray-700"
          >
            Education Level
          </label>
          <input
            type="text"
            id="filter-education"
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="e.g., Bachelor's"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="filter-relationship-goals"
            className="block text-sm font-medium text-gray-700"
          >
            Relationship Goals
          </label>
          <input
            type="text"
            id="filter-relationship-goals"
            value={relationshipGoals}
            onChange={(e) => setRelationshipGoals(e.target.value)}
            placeholder="e.g., Serious Relationship"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="filter-interests"
            className="block text-sm font-medium text-gray-700"
          >
            Interests (comma-separated)
          </label>
          <input
            type="text"
            id="filter-interests"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="e.g., hiking, reading"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="filter-personality-type"
            className="block text-sm font-medium text-gray-700"
          >
            Personality Type
          </label>
          <select
            id="filter-personality-type"
            value={personalityType}
            onChange={(e) => setPersonalityType(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="">Any Type</option>
            {PREDEFINED_PERSONALITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex space-x-3 mt-4">
        <button
          onClick={handleApply}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-sm text-sm font-medium"
        >
          Apply Filters
        </button>
        <button
          onClick={handleClear}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md shadow-sm text-sm font-medium"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
};

export default MatchFilters;
