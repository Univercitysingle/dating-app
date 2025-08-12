import React, { useState, useEffect, useCallback } from 'react';
import MatchFilters from '../components/MatchFilters';
import InterstitialAd from '../components/InterstitialAd'; // Import the ad component
import { useAuth } from '../context/AuthContext'; // Import useAuth

// Placeholder UserCard component - expanded slightly for interaction
const UserCard = ({ user, onSwipe }) => {
  const [swipeFeedback, setSwipeFeedback] = useState(''); // '', 'liked', 'disliked'

  const handleButtonClick = (swipeType) => {
    setSwipeFeedback(swipeType);
    setTimeout(() => {
      onSwipe(swipeType, user.uid);
      // swipeFeedback will reset on next card render because this instance is replaced
    }, 300); // 300ms for visual feedback
  };

  return (
  <div className={`bg-white shadow-lg rounded-lg p-4 m-2 w-full md:w-1/2 lg:w-1/3 xl:w-1/4 flex flex-col transition-all duration-150 ease-in-out
                  ${swipeFeedback === 'liked' ? 'border-4 border-green-500 transform scale-105' : ''}
                  ${swipeFeedback === 'disliked' ? 'border-4 border-red-500 transform scale-105' : ''}
                  `}>
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
    </div>
    {/* Placeholder swipe buttons */}
    <div className="mt-auto pt-3 flex justify-around">
      <button
        onClick={() => handleButtonClick('dislike')}
        disabled={swipeFeedback !== ''} // Disable buttons after click until card advances
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
      >
        Dislike
      </button>
      <button
        onClick={() => handleButtonClick('like')}
        disabled={swipeFeedback !== ''} // Disable buttons after click until card advances
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
      >
        Like
      </button>
    </div>
  </div>
  );
};


function MatchesPage() {
  const { user: currentUser } = useAuth(); // Get current user from AuthContext
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0); // To show one match at a time
  const [isLoading, setIsLoading] = useState(false);
  const [filterParams, setFilterParams] = useState({});
  const [error, setError] = useState(null);

  // Ad-related state
  const [swipeCountSinceLastAd, setSwipeCountSinceLastAd] = useState(0);
  const [isAdVisible, setIsAdVisible] = useState(false);
  const SWIPES_PER_AD = 10; // Show ad every 10 swipes for free users

  const fetchMatches = useCallback(async (currentFilters) => {
    setIsLoading(true);
    setError(null);
    // currentUser is from useAuth(), which should have the token if user is logged in
    if (!currentUser || !currentUser.token) {
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
          Authorization: `Bearer ${currentUser.token}`, // Use token from currentUser
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch matches. Status: ${response.status}`);
      }

      const data = await response.json(); // Expecting { matches: [], ... }
      setMatches(data.matches || []); // Assuming backend returns { matches: [...] }
      setCurrentIndex(0); // Reset to the first card on new fetch/filter
    } catch (err) {
      console.error("Error fetching matches:", err);
      setError(err.message);
      setMatches([]); // Clear matches on error
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]); // Add currentUser to dependencies

  useEffect(() => {
    // Fetch matches when currentUser is available or filterParams change
    if (currentUser) {
      fetchMatches(filterParams);
    }
  }, [fetchMatches, filterParams, currentUser]);

  const handleApplyFilters = (newFilters) => {
    setFilterParams(newFilters);
    // fetchMatches is called by useEffect due to filterParams change
  };

  const handleSwipeAction = (swipeType, swipedUserId) => {
    console.log(`Swiped ${swipeType} on user ${swipedUserId}`);

    // Ad logic for non-premium users
    if (currentUser && !currentUser.isPremium) {
      const newSwipeCount = swipeCountSinceLastAd + 1;
      if (newSwipeCount >= SWIPES_PER_AD) {
        setIsAdVisible(true);
        setSwipeCountSinceLastAd(0);
      } else {
        setSwipeCountSinceLastAd(newSwipeCount);
      }
    }

    // Advance to the next card
    setCurrentIndex(prevIndex => prevIndex + 1);
  };

  const handleAdClose = () => {
    setIsAdVisible(false);
  };

  const currentMatch = matches && matches.length > currentIndex ? matches[currentIndex] : null;

  return (
    <div className="container mx-auto p-4 flex flex-col items-center">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Discover Matches</h1>

      <MatchFilters onApplyFilters={handleApplyFilters} initialFilters={filterParams} />

      {isAdVisible && (
        <InterstitialAd
          isVisible={isAdVisible}
          onClose={handleAdClose}
        />
      )}

      {isLoading && <p className="text-center text-gray-600 py-4">Loading matches...</p>}

      {error && <p className="text-center text-red-500 py-4">Error: {error}</p>}

      {!isLoading && !error && !currentMatch && matches.length > 0 && currentIndex >= matches.length && (
         <p className="text-center text-gray-600 py-4">No more profiles in this batch. Try different filters or check back later!</p>
      )}

      {!isLoading && !error && !currentMatch && matches.length === 0 && (
        <p className="text-center text-gray-600 py-4">No matches found. Try adjusting your filters or preferences!</p>
      )}

      {!isLoading && !error && currentMatch && (
        <div className="mt-6 w-full flex justify-center">
           {/* User object from rankedMatches is actually { user: UserProfile, matchScore: Number } */}
          <UserCard user={currentMatch.user} onSwipe={handleSwipeAction} />
        </div>
      )}
    </div>
  );
}

export default MatchesPage;
