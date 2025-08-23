import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import apiClient from '../api/apiClient';
import SwipeCard from '../components/SwipeCard';
import { Link } from 'react-router-dom';

// A simple placeholder for the navigation bar
const BottomNav = () => (
  <nav className="w-full bg-neutral-50 dark:bg-neutral-900 shadow-t-md">
    <div className="flex justify-around max-w-md mx-auto px-4 py-2">
      <Link to="/discover" className="text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
      </Link>
      <Link to="/matches" className="text-neutral-400 hover:text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V7a2 2 0 012-2h6l2-2h2l-2 2z" />
        </svg>
      </Link>
      <Link to="/profile" className="text-neutral-400 hover:text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </Link>
    </div>
  </nav>
);

const MatchModal = ({ matchInfo, onContinue, onChat }) => (
    <div className="absolute inset-0 bg-neutral-900 bg-opacity-60 backdrop-blur-sm flex flex-col justify-center items-center z-50 transition-opacity duration-300">
        <div className="text-center">
            <h2 className="text-5xl font-bold text-white mb-2 animate-pulse">It's a Match!</h2>
            <p className="text-xl text-accent">You and {matchInfo.name || 'someone'} liked each other.</p>
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
  const [newMatchInfo, setNewMatchInfo] = useState(null);

  const fetchUsersToSwipe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNewMatchInfo(null);
    try {
      const { data } = await apiClient.get('/api/users/discover');
      setUsers(data || []);
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

  const handleVote = async (userId, direction) => {
    try {
      const { data } = await apiClient.post('/api/swipes', {
        targetUserId: userId,
        direction: direction,
      });

      if (data && data.match) {
        setNewMatchInfo(data.matchedUser || { _id: userId, name: 'Your New Match!' });
      }
    } catch (swipeError) {
      console.error("Error recording swipe:", swipeError);
    }
    setUsers((prevUsers) => prevUsers.slice(1));
  };

  const handleSwipe = () => {
    // This function is called when the card animation is complete
    // We don't need to do anything here anymore, as the card is already removed from the DOM by AnimatePresence
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><p>Loading profiles...</p></div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen"><p className="text-red-500">Error: {error}</p></div>;
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-900">
        <header className="flex-shrink-0">
            <h1 className="text-2xl font-bold my-4 text-center text-neutral-700 dark:text-neutral-200">Discover</h1>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center">
            <div className="relative w-[90vw] h-[65vh] max-w-sm">
                <AnimatePresence>
                    {users.length > 0 ? (
                        <SwipeCard
                            key={users[0]._id}
                            user={users[0]}
                            onVote={handleVote}
                            onSwipe={handleSwipe}
                        />
                    ) : (
                        <NoMoreProfiles />
                    )}
                </AnimatePresence>
            </div>
        </main>

        <footer className="flex-shrink-0">
            {users.length > 0 && !newMatchInfo && (
                <div className="flex justify-center items-center my-4 space-x-8">
                <button
                    onClick={() => handleVote(users[0]._id, 'left')}
                    className="p-4 bg-neutral-50 rounded-full shadow-lg hover:bg-red-100 transition-all transform hover:scale-110"
                    aria-label="Pass"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="red" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <button
                    onClick={() => handleVote(users[0]._id, 'right')}
                    className="p-5 bg-neutral-50 rounded-full shadow-lg hover:bg-green-100 transition-all transform hover:scale-110"
                    aria-label="Like"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="green" viewBox="0 0 24 24" strokeWidth={1.5} stroke="white" className="w-10 h-10">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                </button>
                </div>
            )}
            <BottomNav />
        </footer>

        {newMatchInfo && (
            <MatchModal
                matchInfo={newMatchInfo}
                onContinue={() => setNewMatchInfo(null)}
                onChat={() => { /* Implement navigation to chat */ alert(`Navigating to chat with ${newMatchInfo.name}`); setNewMatchInfo(null);}}
            />
        )}
    </div>
  );
};

export default SwipeDeck;
