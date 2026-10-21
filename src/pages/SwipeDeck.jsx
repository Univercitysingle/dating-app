import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import apiClient from '../api/apiClient';
import SwipeCard from '../components/SwipeCard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Filter from '../components/Filter';

const MatchModal = ({ matchInfo, onContinue, onChat }) => (
    <div className="absolute inset-0 bg-neutral-900 bg-opacity-60 backdrop-blur-sm flex flex-col justify-center items-center z-50 transition-opacity duration-300">
        <div className="text-center">
            <h2 className="text-5xl font-bold text-white mb-2 animate-pulse">
                {matchInfo.superLike ? 'It\'s a Super Match!' : 'It\'s a Match!'}
            </h2>
            <p className="text-xl text-accent">
                {matchInfo.superLike ? `${matchInfo.name || 'someone'} super liked you!` : `You and ${matchInfo.name || 'someone'} liked each other.`}
            </p>
        </div>
        <div className="flex items-center my-8">
            {/* Placeholder for user's own image */}
            <div className="w-32 h-32 rounded-full bg-neutral-400 border-4 border-white transform -rotate-12"></div>
            {/* Placeholder for matched user's image */}
            <div className="w-32 h-32 rounded-full bg-neutral-500 border-4 border-white transform rotate-12 -ml-8"></div>
        </div>
        <div className="flex flex-col items-center">
             <button
                onClick={onChat}
                className="mt-4 px-8 py-3 bg-primary text-white rounded-full text-lg font-semibold hover:bg-primary-dark transition-transform transform hover:scale-105"
            >
                Send a Message
            </button>
            <button
                onClick={onContinue}
                className="mt-4 px-8 py-2 text-white text-md"
            >
                Keep Swiping
            </button>
        </div>
    </div>
);

const NoMoreProfiles = () => (
    <div className="flex flex-col justify-center items-center h-full text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-neutral-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-neutral-500 dark:text-neutral-400 text-xl font-semibold">That's everyone for now!</p>
        <p className="text-neutral-400 dark:text-neutral-500 mt-1">Check back later for new profiles.</p>
    </div>
);


const SwipeDeck = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [swipeError, setSwipeError] = useState(null);
  const [newMatchInfo, setNewMatchInfo] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchUsersToSwipe = useCallback(async (filters = {}) => {
    setIsLoading(true);
    setError(null);
    setNewMatchInfo(null);
    try {
      const data = await apiClient.get('/users/discover', { params: filters });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching users for swipe deck:", err);
      setError(err.data?.message || err.message || "Failed to load users.");
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsersToSwipe();
  }, [fetchUsersToSwipe]);

  useEffect(() => {
    if (swipeError) {
      const timer = setTimeout(() => {
        setSwipeError(null);
      }, 5000); // Clear after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [swipeError]);

  const handleVote = async (userId, direction) => {
    // Optimistic UI update
    setUsers((prevUsers) => prevUsers.filter(u => u.uid !== userId));

    try {
      if (direction === 'right') {
        const response = await apiClient.post('/swipe/like', { userId });
        if (response && response.status === 'matched') {
          const matchedUser = users.find(u => u.uid === userId);
          setNewMatchInfo(matchedUser);
        }
      } else if (direction === 'superlike') {
        const response = await apiClient.post('/swipe/superlike', { userId });
        if (response && response.status === 'matched') {
          const matchedUser = users.find(u => u.uid === userId);
          setNewMatchInfo(matchedUser);
        }
      } else {
        await apiClient.post('/swipe/pass', { userId });
      }
    } catch (err) {
      console.error("Error recording swipe:", err);
      setSwipeError(err.data?.message || `Failed to record ${direction} action.`);
      // Note: In a real-world app, you might want to add the user back to the deck on failure.
    }
  };

  const handleSwipe = () => {
    // This function is called when the card animation is complete
    // We don't need to do anything here anymore, as the card is already removed from the DOM by AnimatePresence
  };

  const handleUndo = async () => {
    try {
      const response = await apiClient.post('/swipe/undo');
      if (response && response.undoneUser) {
        setUsers((prevUsers) => [response.undoneUser, ...prevUsers]);
      }
    } catch (err) {
      console.error("Error undoing swipe:", err);
      setSwipeError(err.data?.message || "Failed to undo swipe.");
    }
  };

  const handleApplyFilters = (filters) => {
    fetchUsersToSwipe(filters);
    setShowFilters(false);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><p>Loading profiles...</p></div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen"><p className="text-red-500">Error: {error}</p></div>;
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-900">
        {swipeError && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
            {swipeError}
          </div>
        )}
        <header className="flex-shrink-0 flex justify-between items-center p-4">
            <h1 className="text-2xl font-bold text-center text-neutral-700 dark:text-neutral-200">Discover</h1>
            <button onClick={() => setShowFilters(true)} className="p-2 bg-white rounded-full shadow-md" aria-label="Open filter menu">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 4a2 2 0 100 4m0-4a2 2 0 110 4m-6 8v-2m0 4v.01M6 14a2 2 0 100-4m0 4a2 2 0 110-4m12 4v-2m0 4v.01M18 14a2 2 0 100-4m0 4a2 2 0 110-4M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center pt-4">
            <div className="relative w-[90vw] h-[70vh] max-w-sm">
                <AnimatePresence>
                    {users.length > 0 ? (
                        users.slice(0, 3).reverse().map((user, index) => {
                            const isTop = index === users.slice(0, 3).length - 1;
                            return (
                                <SwipeCard
                                    key={user._id}
                                    user={user}
                                    onVote={isTop ? handleVote : () => {}}
                                    onSwipe={isTop ? handleSwipe : () => {}}
                                    superLike={user.superLikedByCurrentUser}
                                    // Apply stacking styles
                                    style={{
                                        zIndex: users.length - index,
                                        transform: `scale(${1 - (users.slice(0, 3).length - 1 - index) * 0.05}) translateY(-${(users.slice(0, 3).length - 1 - index) * 10}px)`,
                                    }}
                                />
                            );
                        })
                    ) : (
                        <NoMoreProfiles />
                    )}
                </AnimatePresence>
            </div>
        </main>

        <footer className="flex-shrink-0 p-4">
            {users.length > 0 && !newMatchInfo && (
                <div className="flex justify-center items-center my-4 space-x-4">
                    <button
                        onClick={() => handleVote(users[0]?.uid, 'left')}
                        className="p-4 bg-white rounded-full shadow-lg hover:bg-red-100 transition-all transform hover:scale-110"
                        aria-label="Pass"
                        disabled={!users[0]}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleVote(users[0]?.uid, 'superlike')}
                        className="p-4 bg-white rounded-full shadow-lg hover:bg-blue-100 transition-all transform hover:scale-110"
                        aria-label="Super Like"
                        disabled={!users[0]}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleVote(users[0]?.uid, 'right')}
                        className="p-5 bg-white rounded-full shadow-lg hover:bg-green-100 transition-all transform hover:scale-110"
                        aria-label="Like"
                        disabled={!users[0]}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button
                        onClick={handleUndo}
                        className="p-4 bg-white rounded-full shadow-lg hover:bg-yellow-100 transition-all transform hover:scale-110"
                        aria-label="Undo"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 002.828 0L18 12.828M3 12l6.414-6.414a2 2 0 012.828 0L18 12.828" />
                        </svg>
                    </button>
                </div>
            )}
        </footer>

        {newMatchInfo && (
            <MatchModal
                matchInfo={newMatchInfo}
                onContinue={() => setNewMatchInfo(null)}
                onChat={() => navigate(`/chat/${[user?.uid, newMatchInfo.uid].sort().join('-')}`)}
            />
        )}

        {showFilters && (
            <div className="absolute inset-0 bg-neutral-900 bg-opacity-60 backdrop-blur-sm flex flex-col justify-center items-center z-50 transition-opacity duration-300">
                <Filter onApply={handleApplyFilters} />
            </div>
        )}
    </div>
  );
};

export default SwipeDeck;
