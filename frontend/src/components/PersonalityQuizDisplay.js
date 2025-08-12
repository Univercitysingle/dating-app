import React from 'react';

const PersonalityQuizDisplay = ({ quizResults }) => {
  if (!quizResults || !quizResults.type) {
    return <p className="text-gray-500 italic text-sm">Personality type not set.</p>;
  }

  return (
    <div className="my-4">
      <h4 className="text-md font-semibold mb-1 text-gray-700">Personality Type</h4>
      <p className="text-gray-800 bg-gray-100 p-3 rounded-md shadow-sm">{quizResults.type}</p>
    </div>
  );
};

export default PersonalityQuizDisplay;
