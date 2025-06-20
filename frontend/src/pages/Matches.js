import React, { useState, useEffect, useCallback } from 'react';
import MatchFilters from '../components/MatchFilters'; // Assuming MatchFilters.js is in components
// You'll likely need a component to display individual user cards, e.g., UserCard.js
// For now, we'll just display basic info.

// Placeholder UserCard component
const UserCard = ({ user }) => (
  <div className="bg-white shadow-lg rounded-lg p-4 m-2 w-full md:w-1/2 lg:w-1/3 xl:w-1/4 flex flex-col">
    <h3 className="text-xl font-semibold text-gray-800">{user.name}, {user.age}</h3>
    {user.photos && user.photos.length > 0 && (
      <img src={user.photos[0]} alt={user.name} className="w-full h-48 object-cover rounded-md my-2"/>
    )}
    <p className="text-gray-600 text-sm flex-grow">{user.bio ? user.bio.substring(0, 100) + '...' : 'No bio yet.'}</p>
    <div className="mt-2 text-xs text-gray-500 space-y-0.5">
      <p>Gender: {user.gender || 'N/A'}</p>
      {user.education && <p>Education: {user.education}</p>}
      {user.relationshipGoals && <p>Goals: {user.relationshipGoals}</p>}
      {user.interests && user.interests.length > 0 && (
        <p>Interests: {user.interests.join(', ')}</p>
      )}
      {user.personalityQuizResults && user.personalityQuizResults.type && (
        <p>Personality: {user.personalityQuizResults.type}</p>
      )}
      {user.lastActiveAt && <p>Last Active: {new Date(user.lastActiveAt).toLocaleDateString()}</p>}
       {/* Consider adding location display if available and appropriate */}
    </div>
  </div>
);


function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterParams, setFilterParams] = useState({});
  const [error, setError] = useState(null);

  const fetchMatches = useCallback(async (currentFilters) => {
    setIsLoading(true);
    setError(null);
    const user = JSON.parse(localStorage.getItem("user"));

    if (!user || !user.token) {
      setError("User not authenticated. Please log in.");
      setIsLoading(false);
      setMatches([]);
      return;
    }

    const queryParams = new URLSearchParams(currentFilters).toString();
    const apiUrl = `/api/matches?${queryParams}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch matches. Status: ${response.status}`);
      }

      const data = await response.json();
      setMatches(data);
    } catch (err) {
      console.error("Error fetching matches:", err);
      setError(err.message);
      setMatches([]); // Clear matches on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches(filterParams); // Fetch initial matches (with empty filters)
  }, [fetchMatches, filterParams]); // filterParams in dependency array to refetch when filters change

  const handleApplyFilters = (newFilters) => {
    setFilterParams(newFilters);
    // fetchMatches will be called by the useEffect hook due to filterParams changing
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Discover Matches</h1>

      <MatchFilters onApplyFilters={handleApplyFilters} initialFilters={filterParams} />

      {isLoading && <p className="text-center text-gray-600 py-4">Loading matches...</p>}

      {error && <p className="text-center text-red-500 py-4">Error: {error}</p>}

      {!isLoading && !error && matches.length === 0 && (
        <p className="text-center text-gray-600 py-4">No matches found. Try adjusting your filters or preferences!</p>
      )}

      {!isLoading && !error && matches.length > 0 && (
        <div className="flex flex-wrap -m-2">
          {matches.map(user => (
            <UserCard key={user.uid || user._id} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}

export default MatchesPage;
