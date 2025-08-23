import React from 'react';
import PropTypes from 'prop-types';

const ProfilePromptsDisplay = ({ profilePrompts }) => {
  if (!profilePrompts || profilePrompts.length === 0) {
    return <p className="text-gray-500 italic">No prompts answered yet.</p>;
  }

  return (
    <div className="my-6">
      <h3 className="text-xl font-semibold mb-3 text-gray-800">My Prompts</h3>
      <div className="space-y-4">
        {profilePrompts.map((item, index) => (
          <div key={index} className="bg-white p-4 rounded-lg shadow">
            <p className="font-medium text-gray-600">{item.prompt}</p>
            <p className="text-gray-800 mt-1">{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

ProfilePromptsDisplay.propTypes = {
  profilePrompts: PropTypes.arrayOf(
    PropTypes.shape({
      prompt: PropTypes.string.isRequired,
      answer: PropTypes.string.isRequired,
    })
  ).isRequired,
};

export default ProfilePromptsDisplay;
