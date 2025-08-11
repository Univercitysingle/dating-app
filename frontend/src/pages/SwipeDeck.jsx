import React, { useState, useEffect, useMemo } from 'react';
import TinderCard from 'react-tinder-card';
import SwipeCard from '../components/SwipeCard';
import { useUsers } from '../hooks/useUsers';
import { useSwipe } from '../hooks/useSwipe';
import MatchModal from '../components/MatchModal';

const SwipeDeck = () => {
  const {
    usersToSwipe,
    isLoading,
    error,
    fetchUsersToSwipe,
    setUsersToSwipe,
    retry,
  } = useUsers();
  const { lastDirection, newMatchInfo, onSwipe, setNewMatchInfo } = useSwipe();
  const [childRefs, setChildRefs] = useState([]);

  useEffect(() => {
    fetchUsersToSwipe();
  }, [fetchUsersToSwipe]);

  useEffect(() => {
    if (usersToSwipe.length > 0) {
      setChildRefs(
        Array(usersToSwipe.length)
          .fill(0)
          .map(() => React.createRef())
      );
    } else {
      setChildRefs([]);
    }
  }, [usersToSwipe]);

  const usersForCards = useMemo(() => usersToSwipe, [usersToSwipe]);

  const onCardLeftScreenHandler = (userIdThatLeft) => {
    console.log(userIdThatLeft + ' left the screen.');
    setUsersToSwipe((prevUsers) =>
      prevUsers.filter((user) => (user.id || user._id) !== userIdThatLeft)
    );
  };

  const triggerSwipe = async (direction) => {
    // We swipe the card at the end of the usersForCards array, as it's visually on top.
    const currentCardIndex = usersForCards.length - 1;
    if (
      currentCardIndex >= 0 &&
      childRefs[currentCardIndex] &&
      childRefs[currentCardIndex].current
    ) {
      try {
        await childRefs[currentCardIndex].current.swipe(direction); // Trigger swipe on the card
        // The onSwipe and onCardLeftScreenHandler will be called by TinderCard component
      } catch (err) {
        console.error('Error triggering swipe:', err);
        // This might happen if the card is already swiped or not available.
      }
    } else {
      console.log(
        'No cards to swipe or ref not available for index: ',
        currentCardIndex
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>Loading profiles...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-red-500 text-center mb-4">{error}</p>
        <button
          onClick={retry}
          className="px-6 py-2 bg-pink-500 text-white rounded-full text-lg hover:bg-pink-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <h1 className="text-2xl font-bold my-4 text-gray-700 dark:text-gray-200">
        Discover
      </h1>
      <div className="relative w-[90vw] h-[70vh] max-w-sm">
        {' '}
        {/* Card container */}
        {usersForCards.length > 0
          ? usersForCards.map((user, index) => (
              <TinderCard
                ref={childRefs[index]} // Assign ref
                className="absolute"
                key={user.id || user._id}
                onSwipe={(dir) => onSwipe(dir, user.id || user._id)}
                onCardLeftScreen={() =>
                  onCardLeftScreenHandler(user.id || user._id)
                }
                preventSwipe={['up', 'down']}
              >
                <SwipeCard user={user} />
              </TinderCard>
            ))
          : !isLoading && (
              <div className="flex justify-center items-center h-full">
                {' '}
                {/* Show only if not loading */}
                <p className="text-gray-500 dark:text-gray-400 text-xl">
                  No more profiles to swipe right now. Check back later!
                </p>
              </div>
            )}
      </div>

      {/* Swipe Buttons */}
      {usersForCards.length > 0 &&
        !newMatchInfo && ( // Show buttons only if cards are present and no match overlay
          <div className="flex justify-center items-center mt-6 space-x-6">
            <button
              onClick={() => triggerSwipe('left')}
              className="p-4 bg-white rounded-full shadow-lg hover:bg-red-100 transition-colors"
              aria-label="Pass"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="red"
                className="w-8 h-8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <button
              onClick={() => triggerSwipe('right')}
              className="p-4 bg-white rounded-full shadow-lg hover:bg-green-100 transition-colors"
              aria-label="Like"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="green"
                className="w-8 h-8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </button>
          </div>
        )}

      <MatchModal
        matchInfo={newMatchInfo}
        onClose={() => setNewMatchInfo(null)}
      />
      {lastDirection && !newMatchInfo && (
        <h2 className="mt-4 text-xl text-gray-600 dark:text-gray-300">
          You swiped {lastDirection}
        </h2>
      )}
    </div>
  );
};

export default SwipeDeck;
