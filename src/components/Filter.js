import React, { useState } from 'react';

const Filter = ({ onApply }) => {
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(100);
  const [maxDistance, setMaxDistance] = useState(100);
  const [lifestyle, setLifestyle] = useState({
    pets: '',
    workout: '',
    drinking: '',
    smoking: '',
  });
  const [relationshipType, setRelationshipType] = useState('');
  const [sexualOrientation, setSexualOrientation] = useState('');
  const [familyStatus, setFamilyStatus] = useState('');

  const handleLifestyleChange = (e) => {
    const { name, value } = e.target;
    setLifestyle((prev) => ({ ...prev, [name]: value }));
  };

  const handleApply = () => {
    const filters = {
      minAge,
      maxAge,
      maxDistance: parseInt(maxDistance, 10),
      relationshipType,
      familyStatus,
    };
    // Only add sexualOrientation to filters if it's visible and has a value
    if (relationshipType === 'Casual (FWB)' && sexualOrientation) {
      filters.sexualOrientation = sexualOrientation;
    }
    for (const key in lifestyle) {
      if (lifestyle[key]) {
        filters[key] = lifestyle[key];
      }
    }
    onApply(filters);
  };

  const handleMinAgeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (value > maxAge) {
      setMinAge(maxAge);
    } else {
      setMinAge(value);
    }
  };

  const handleMaxAgeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (value < minAge) {
      setMaxAge(minAge);
    } else {
      setMaxAge(value);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Filters</h3>
      <div className="space-y-4">
        <div>
          <label htmlFor="age-range" className="block text-sm font-medium text-gray-700">
            Age Range: {minAge} - {maxAge}
          </label>
          <div className="flex space-x-4">
            <input
              type="range"
              min="18"
              max="100"
              value={minAge}
              onChange={handleMinAgeChange}
              className="w-full"
            />
            <input
              type="range"
              min="18"
              max="100"
              value={maxAge}
              onChange={handleMaxAgeChange}
              className="w-full"
            />
          </div>
        </div>
        <div>
          <label htmlFor="distance" className="block text-sm font-medium text-gray-700">
            Max Distance: {maxDistance} km
          </label>
          <input
            type="range"
            min="1"
            max="100"
            value={maxDistance}
            onChange={(e) => setMaxDistance(e.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="relationshipType" className="block text-sm font-medium text-gray-700">
            Looking for
          </label>
          <select
            id="relationshipType"
            name="relationshipType"
            value={relationshipType}
            onChange={(e) => setRelationshipType(e.target.value)}
            className="w-full"
          >
            <option value="">All</option>
            <option value="Relationship">Relationship</option>
            <option value="Casual (FWB)">Casual (FWB)</option>
            <option value="Friendship">Friendship</option>
            <option value="Don't know yet">Don't know yet</option>
          </select>
        </div>
        {relationshipType === 'Casual (FWB)' && (
          <div>
            <label htmlFor="sexualOrientation" className="block text-sm font-medium text-gray-700">
              Sexual Orientation
            </label>
            <select
              id="sexualOrientation"
              name="sexualOrientation"
              value={sexualOrientation}
              onChange={(e) => setSexualOrientation(e.target.value)}
              className="w-full"
            >
              <option value="">All</option>
              <option value="Straight / Heterosexual">Straight / Heterosexual</option>
              <option value="Gay (Homosexual - Male)">Gay (Homosexual - Male)</option>
              <option value="Lesbian (Homosexual - Female)">Lesbian (Homosexual - Female)</option>
              <option value="Bisexual (Bi)">Bisexual (Bi)</option>
              <option value="Pansexual">Pansexual</option>
              <option value="Asexual">Asexual</option>
              <option value="Queer">Queer</option>
              <option value="Prefer Not to Say">Prefer Not to Say</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="familyStatus" className="block text-sm font-medium text-gray-700">
            Family Status
          </label>
          <select
            id="familyStatus"
            name="familyStatus"
            value={familyStatus}
            onChange={(e) => setFamilyStatus(e.target.value)}
            className="w-full"
          >
            <option value="">All</option>
            <option value="Lower Class Family">Lower Class Family</option>
            <option value="Lower-Middle Class Family">Lower-Middle Class Family</option>
            <option value="Middle Class Family">Middle Class Family</option>
            <option value="Upper-Middle Class Family">Upper-Middle Class Family</option>
            <option value="Upper Class / Elite Family">Upper Class / Elite Family</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Lifestyle</label>
          <div className="space-y-2">
            <select name="pets" value={lifestyle.pets} onChange={handleLifestyleChange} className="w-full">
              <option value="">Pets</option>
              <option value="Dog person">Dog person</option>
              <option value="Cat person">Cat person</option>
              <option value="No pets">No pets</option>
              <option value="All the pets">All the pets</option>
            </select>
            <select name="workout" value={lifestyle.workout} onChange={handleLifestyleChange} className="w-full">
              <option value="">Workout</option>
              <option value="Every day">Every day</option>
              <option value="Often">Often</option>
              <option value="Sometimes">Sometimes</option>
              <option value="Never">Never</option>
            </select>
            <select name="drinking" value={lifestyle.drinking} onChange={handleLifestyleChange} className="w-full">
              <option value="">Drinking</option>
              <option value="Frequently">Frequently</option>
              <option value="Socially">Socially</option>
              <option value="Rarely">Rarely</option>
              <option value="Never">Never</option>
            </select>
            <select name="smoking" value={lifestyle.smoking} onChange={handleLifestyleChange} className="w-full">
              <option value="">Smoking</option>
              <option value="Socially">Socially</option>
              <option value="Sometimes">Sometimes</option>
              <option value="Never">Never</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleApply}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
};

export default Filter;
