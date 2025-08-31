import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

const InterestsEditor = ({ initialInterests = [], onChange }) => {
  const [interests, setInterests] = useState(initialInterests);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState(''); // For loading/success/error messages

  // Update local state if initialInterests prop changes (e.g., after a save and profile refresh)
  useEffect(() => {
    setInterests(initialInterests);
  }, [initialInterests]);

  const handleAddInterest = () => {
    if (inputValue.trim() && !interests.includes(inputValue.trim())) {
      const newInterests = [...interests, inputValue.trim()];
      setInterests(newInterests);
      onChange(newInterests);
      setInputValue('');
    }
  };

  const handleRemoveInterest = (interestToRemove) => {
    const newInterests = interests.filter((interest) => interest !== interestToRemove);
    setInterests(newInterests);
    onChange(newInterests);
  };

  return (
    <div className="my-4 p-4 border border-gray-300 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-3">Edit Interests</h3>
      <div className="flex mb-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Add an interest"
          className="flex-grow p-2 border border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleAddInterest();
              e.preventDefault();
            }
          }}
        />
        <button
          onClick={handleAddInterest}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-r-md"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {interests.map((interest, index) => (
          <span
            key={index}
            className="bg-gray-200 text-gray-800 text-sm font-medium px-2.5 py-1 rounded flex items-center"
          >
            {interest}
            <button
              onClick={() => handleRemoveInterest(interest)}
              className="ml-2 text-red-500 hover:text-red-700 font-bold"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};

export default InterestsEditor;
