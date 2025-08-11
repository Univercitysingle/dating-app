import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { PREDEFINED_PERSONALITY_TYPES } from '../utils/constants';

const PersonalityQuizEditor = ({
  currentQuizResults,
  onSave,
  statusMessage,
  setStatusMessage,
}) => {
  const [selectedType, setSelectedType] = useState('');

  useEffect(() => {
    if (currentQuizResults && currentQuizResults.type) {
      setSelectedType(currentQuizResults.type);
    } else {
      setSelectedType('');
    }
  }, [currentQuizResults]);

  const handleSave = () => {
    if (!selectedType) {
      if (setStatusMessage) {
        setStatusMessage('Please select a personality type.');
      }
    }
    if (onSave) {
      onSave({ type: selectedType });
    }
  };

  return (
    <div className="my-4 p-4 border border-gray-300 rounded-lg shadow-sm">
      <h4 className="text-md font-semibold mb-2 text-gray-700">
        Select Your Personality Type
      </h4>
      <select
        value={selectedType}
        onChange={(e) => {
          setSelectedType(e.target.value);
          if (setStatusMessage) {
            setStatusMessage('');
          }
        }}
        className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm mb-3"
      >
        <option value="">-- Select a Type --</option>
        {PREDEFINED_PERSONALITY_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
        disabled={
          !selectedType && !(currentQuizResults && currentQuizResults.type)
        }
      >
        Save Personality Type
      </button>
      {statusMessage && (
        <p className="mt-2 text-sm text-gray-600">{statusMessage}</p>
      )}
    </div>
  );
};

PersonalityQuizEditor.propTypes = {
  currentQuizResults: PropTypes.shape({
    type: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  statusMessage: PropTypes.string,
  setStatusMessage: PropTypes.func,
};

export default PersonalityQuizEditor;
