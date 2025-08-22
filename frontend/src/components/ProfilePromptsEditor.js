import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import apiClient from '../api/apiClient';
import logger from '../utils/logger';

const PREDEFINED_PROMPTS = [
  'My ideal first date involves...',
  'Two truths and a lie about me are...',
  "The most spontaneous thing I've ever done is...",
  "A skill I'm currently learning is...",
  'My simple pleasures in life are...',
  "I'm looking for someone who...",
  'My friends would describe me as...',
  "If I could travel anywhere, I'd go to...",
];

const MAX_PROMPTS = 3;

const ProfilePromptsEditor = ({ initialPrompts = [], onSave }) => {
  const [selectedPrompts, setSelectedPrompts] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const validInitialPrompts = initialPrompts.filter(
      (p) => PREDEFINED_PROMPTS.includes(p.prompt) && p.answer
    );
    setSelectedPrompts(validInitialPrompts);
  }, [initialPrompts]);

  const handleAddPrompt = (prompt) => {
    if (
      selectedPrompts.length < MAX_PROMPTS &&
      !selectedPrompts.find((p) => p.prompt === prompt)
    ) {
      setSelectedPrompts([...selectedPrompts, { prompt, answer: '' }]);
    }
  };

  const handleRemovePrompt = (promptToRemove) => {
    setSelectedPrompts(
      selectedPrompts.filter((p) => p.prompt !== promptToRemove)
    );
  };

  const handleAnswerChange = (prompt, answer) => {
    setSelectedPrompts(
      selectedPrompts.map((p) => (p.prompt === prompt ? { ...p, answer } : p))
    );
  };

  const handleSave = async () => {
    setStatus('Saving...');
    const promptsToSave = selectedPrompts.filter(
      (p) => p.answer && p.answer.trim() !== ''
    );

    try {
      const savedData = await apiClient.put('/api/users/me', {
        profilePrompts: promptsToSave,
      });
      setStatus('Prompts saved successfully!');
      if (onSave) {
        onSave(savedData.profilePrompts || promptsToSave);
      }
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      logger.error('Failed to save prompts:', error);
    }
  };

  const availablePrompts = PREDEFINED_PROMPTS.filter(
    (prompt) => !selectedPrompts.find((p) => p.prompt === prompt)
  );

  return (
    <div className="my-6 p-4 border border-gray-300 rounded-lg shadow-sm">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Edit Prompts</h3>

      {selectedPrompts.length < MAX_PROMPTS && availablePrompts.length > 0 && (
        <div className="mb-4">
          <label
            htmlFor="prompt-select"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Choose a prompt to answer (up to {MAX_PROMPTS}):
          </label>
          <select
            id="prompt-select"
            onChange={(e) => handleAddPrompt(e.target.value)}
            value=""
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            <option value="" disabled>
              Select a prompt
            </option>
            {availablePrompts.map((prompt) => (
              <option key={prompt} value={prompt}>
                {prompt}
              </option>
            ))}
          </select>
        </div>
      )}
      {selectedPrompts.length >= MAX_PROMPTS && (
        <p className="text-sm text-gray-600 mb-4">
          You have reached the maximum of {MAX_PROMPTS} prompts.
        </p>
      )}

      <div className="space-y-4">
        {selectedPrompts.map(({ prompt, answer }) => (
          <div key={prompt} className="p-3 bg-gray-50 rounded-md">
            <div className="flex justify-between items-center mb-1">
              <p className="font-medium text-gray-700">{prompt}</p>
              <button
                onClick={() => handleRemovePrompt(prompt)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
            <textarea
              value={answer}
              onChange={(e) => handleAnswerChange(prompt, e.target.value)}
              placeholder="Your answer..."
              rows="3"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        ))}
      </div>

      {selectedPrompts.length > 0 && (
        <button
          onClick={handleSave}
          className="mt-6 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md shadow-sm"
        >
          Save Prompts
        </button>
      )}
      {status && <p className="mt-3 text-sm text-gray-700">{status}</p>}
    </div>
  );
};

ProfilePromptsEditor.propTypes = {
  initialPrompts: PropTypes.array,
  onSave: PropTypes.func.isRequired,
};

export default ProfilePromptsEditor;
