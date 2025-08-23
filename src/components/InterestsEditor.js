import React, { useState, useEffect } from 'react';

const InterestsEditor = ({ initialInterests = [], onSave }) => {
  const [interests, setInterests] = useState(initialInterests);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState(''); // For loading/success/error messages

  // Update local state if initialInterests prop changes (e.g., after a save and profile refresh)
  useEffect(() => {
    setInterests(initialInterests);
  }, [initialInterests]);

  const handleAddInterest = () => {
    if (inputValue.trim() && !interests.includes(inputValue.trim())) {
      setInterests([...interests, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleRemoveInterest = (interestToRemove) => {
    setInterests(interests.filter((interest) => interest !== interestToRemove));
  };

  const handleSave = async () => {
    setStatus('Saving...');
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.token) {
      setStatus('Error: Not authenticated.');
      return;
    }

    try {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ interests }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save interests.');
      }

      setStatus('Interests saved successfully!');
      if (onSave) {
        onSave(interests); // Notify parent about the save
      }
      // Optionally, clear status after a few seconds
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Failed to save interests:', error);
    }
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
      <button
        onClick={handleSave}
        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md"
      >
        Save Interests
      </button>
      {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
    </div>
  );
};

export default InterestsEditor;
