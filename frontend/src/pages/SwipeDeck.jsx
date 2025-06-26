import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TinderCard from 'react-tinder-card';
import apiClient from '../api/apiClient';
import SwipeCard from '../components/SwipeCard'; // Assuming SwipeCard.jsx is in components

const SwipeDeck = () => {
  const [usersToSwipe, setUsersToSwipe] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // currentIndex is less critical if we modify the array directly
  // const [currentIndex, setCurrentIndex] = useState(0);
  const [lastDirection, setLastDirection] = useState(null); // For feedback
  const [newMatchInfo, setNewMatchInfo] = useState(null); // To store info about a new match

  const fetchUsersToSwipe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNewMatchInfo(null); // Clear any previous match info
    try {
      const data = await apiClient.get('/api/users/discover');
      setUsersToSwipe(data || []); // Assuming data is an array of users
      setCurrentIndex((data || []).length - 1); // react-tinder-card swipes from the end of the array
    } catch (err) {
      console.error("Error fetching users for swipe deck:", err);
      setError(err.data?.message || err.message || "Failed to load users.");
      setUsersToSwipe([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsersToSwipe();
  }, [fetchUsersToSwipe]);

  // memoized version of users to prevent re-render of cards unless usersToSwipe changes
  const [childRefs, setChildRefs] = useState([]);

  // Initialize childRefs when usersForCards changes
  useEffect(() => {
    if (usersToSwipe.length > 0) {
      setChildRefs(Array(usersToSwipe.length).fill(0).map(() => React.createRef()));
    } else {
      setChildRefs([]);
    }
  }, [usersToSwipe]);

  // memoized version of users to prevent re-render of cards unless usersToSwipe changes
  // usersForCards is now the source of truth for current cards on screen.
  // We swipe from the end of this array.
  const usersForCards = useMemo(() => usersToSwipe, [usersToSwipe]);


  // Called when a swipe is completed (gesture finishes)
  const onSwipe = async (direction, swipedUserId) => {
    console.log(`You swiped ${direction} on ${swipedUserId}`);
    setLastDirection(direction);
    setNewMatchInfo(null);

    try {
      const response = await apiClient.post('/api/swipes', {
        targetUserId: swipedUserId,
        direction: direction
      });

      if (response && response.match) {
        console.log("IT'S A MATCH with user:", response.matchedUser || swipedUserId);
        // Assuming response.matchedUser contains { id, name, images? }
        setNewMatchInfo(response.matchedUser || { id: swipedUserId, name: 'Your New Match!' });
        // TODO: Implement a proper "It's a Match!" modal/popup that shows both users.
      }
    } catch (swipeError) {
      console.error("Error recording swipe:", swipeError);
      // Potentially handle swipe error, e.g., show a toast
    }
  };

  // Called AFTER the card has left the screen
  const onCardLeftScreenHandler = (userIdThatLeft) => {
    console.log(userIdThatLeft + ' left the screen.');
    // Remove the user from the usersToSwipe array to prevent them from reappearing
    setUsersToSwipe(prevUsers => prevUsers.filter(user => (user.id || user._id) !== userIdThatLeft));
  };

  const triggerSwipe = async (direction) => {
    // We swipe the card at the end of the usersForCards array, as it's visually on top.
    const currentCardIndex = usersForCards.length - 1;
    if (currentCardIndex >= 0 && childRefs[currentCardIndex] && childRefs[currentCardIndex].current) {
      try {
        await childRefs[currentCardIndex].current.swipe(direction); // Trigger swipe on the card
        // The onSwipe and onCardLeftScreenHandler will be called by TinderCard component
      } catch (err) {
        console.error("Error triggering swipe:", err);
        // This might happen if the card is already swiped or not available.
      }
    } else {
      console.log("No cards to swipe or ref not available for index: ", currentCardIndex);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><p>Loading profiles...</p></div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen"><p className="text-red-500">Error: {error}</p></div>;
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <h1 className="text-2xl font-bold my-4 text-gray-700 dark:text-gray-200">Discover</h1>
      <div className="relative w-[90vw] h-[70vh] max-w-sm"> {/* Card container */}
        {usersForCards.length > 0 ? (
          usersForCards.map((user, index) => (
            <TinderCard
              ref={childRefs[index]} // Assign ref
              className="absolute"
              key={user.id || user._id}
              onSwipe={(dir) => onSwipe(dir, user.id || user._id)}
              onCardLeftScreen={() => onCardLeftScreenHandler(user.id || user._id)}
              preventSwipe={['up', 'down']}
            >
              <SwipeCard user={user} />
            </TinderCard>
          ))
        ) : (
          !isLoading && <div className="flex justify-center items-center h-full"> {/* Show only if not loading */}
            <p className="text-gray-500 dark:text-gray-400 text-xl">No more profiles to swipe right now. Check back later!</p>
          </div>
        )}
      </div>

      {/* Swipe Buttons */}
      {usersForCards.length > 0 && !newMatchInfo && ( // Show buttons only if cards are present and no match overlay
        <div className="flex justify-center items-center mt-6 space-x-6">
          <button
            onClick={() => triggerSwipe('left')}
            className="p-4 bg-white rounded-full shadow-lg hover:bg-red-100 transition-colors"
            aria-label="Pass"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="red" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={() => triggerSwipe('right')}
            className="p-4 bg-white rounded-full shadow-lg hover:bg-green-100 transition-colors"
            aria-label="Like"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="green" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>
      )}

      {/* Basic "It's a Match!" message - replace with modal later */}
      {newMatchInfo && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex flex-col justify-center items-center z-50">
          <p className="text-4xl font-bold text-white mb-4">It's a Match!</p>
          <p className="text-xl text-yellow-300">You matched with {newMatchInfo.name || 'someone'}</p>
          <button
            onClick={() => setNewMatchInfo(null)}
            className="mt-8 px-6 py-2 bg-pink-500 text-white rounded-full text-lg hover:bg-pink-600"
          >
            Keep Swiping
          </button>
        </div>
      )}
      {lastDirection && !newMatchInfo && (
        <h2 className="mt-4 text-xl text-gray-600 dark:text-gray-300">You swiped {lastDirection}</h2>
      )}
    </div>
  );
};

export default SwipeDeck;
