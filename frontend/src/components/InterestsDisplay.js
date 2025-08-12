import React from 'react';

const InterestsDisplay = ({ interests }) => {
  if (!interests || interests.length === 0) {
    return <p className="text-gray-500">No interests added yet.</p>;
  }

  return (
    <div className="my-4">
      <h3 className="text-xl font-semibold mb-2">Interests</h3> {/* Changed text-lg to text-xl */}
      <div className="flex flex-wrap gap-2">
        {interests.map((interest, index) => (
          <span
            key={index}
            className="bg-blue-100 text-blue-800 text-sm font-medium mr-2 mb-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300"
          >
            {interest}
          </span>
        ))}
      </div>
    </div>
  );
};

export default InterestsDisplay;
