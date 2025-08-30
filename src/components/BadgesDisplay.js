import React from 'react';

const Badge = ({ label, value }) => {
  if (!value) return null;

  return (
    <div className="bg-gray-200 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">
      {label}: {value}
    </div>
  );
};

const BadgesDisplay = ({ badges }) => {
  if (!badges) return null;

  return (
    <div className="flex flex-wrap items-center">
      <Badge label="Height" value={badges.height ? `${badges.height} cm` : null} />
      <Badge label="Zodiac" value={badges.zodiac} />
      <Badge label="Workout" value={badges.workout} />
      <Badge label="Drinking" value={badges.drinking} />
      <Badge label="Smoking" value={badges.smoking} />
    </div>
  );
};

export default BadgesDisplay;
