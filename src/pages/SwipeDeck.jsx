import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import apiClient from '../api/apiClient';
import SwipeCard from '../components/SwipeCard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Filter from '../components/Filter';
import { getUserFriendlyError } from '../utils/apiErrors';

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

const NoMoreProfiles = ({ onRefresh }) => (
    <div className="discover-empty-state">
        <div className="discover-empty-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12" />
                <circle cx="12" cy="12" r="5" />
            </svg>
        </div>
        <p className="discover-empty-eyebrow">THAT'S A WRAP FOR NOW</p>
        <h2>You've seen everyone nearby.</h2>
        <p>Try widening your preferences or check back soon. There are always new connections ahead.</p>
        <button type="button" onClick={onRefresh} className="discover-refresh-button">Refresh profiles</button>
    </div>
);


const DiscoverLoadingState = () => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsSlow(true), 8000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="discover-loading" role="status" aria-live="polite" aria-atomic="true">
      <div className="discover-loading__header">
        <span className="discover-skeleton discover-skeleton--filter" aria-hidden="true" />
      </div>
      <div className="discover-loading__stage">
        <div className="discover-loading__card" aria-hidden="true">
          <div className="discover-skeleton discover-skeleton--photo" />
          <div className="discover-loading__caption">
            <span className="discover-skeleton discover-skeleton--badge" />
            <span className="discover-skeleton discover-skeleton--name" />
            <span className="discover-skeleton discover-skeleton--meta" />
            <span className="discover-skeleton discover-skeleton--bio" />
          </div>
          <span className="discover-loading__hint">Preparing profile cards</span>
        </div>
      </div>
      <div className="discover-loading__actions" aria-hidden="true">
        <span className="discover-skeleton discover-skeleton--action" />
        <span className="discover-skeleton discover-skeleton--action discover-skeleton--action-small" />
        <span className="discover-skeleton discover-skeleton--action discover-skeleton--action-large" />
        <span className="discover-skeleton discover-skeleton--action discover-skeleton--action-small" />
      </div>
      <p className="discover-loading__message">
        {isSlow
          ? 'This is taking longer than usual. We are still looking for profiles, please keep this page open.'
          : 'Finding people who match your preferences...'}
      </p>
    </div>
  );
};

const SwipeDeck = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [swipeError, setSwipeError] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [newMatchInfo, setNewMatchInfo] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});
  const { user, setUser } = useAuth();
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
      setError(getUserFriendlyError(err, 'We could not load profiles. Please try again.'));
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
    if (!userId || isVoting) return;
    const selectedUser = users.find((candidate) => candidate.uid === userId);
    if (!selectedUser) return;

    setIsVoting(true);
    setSwipeError(null);
    // Remove the active card immediately, then restore it if the API rejects the action.
    setUsers((prevUsers) => prevUsers.filter((candidate) => candidate.uid !== userId));

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
      setSwipeError(getUserFriendlyError(err, `Your ${direction} could not be saved. Please try again.`));
      setUsers((prevUsers) => (
        prevUsers.some((candidate) => candidate.uid === userId)
          ? prevUsers
          : [selectedUser, ...prevUsers]
      ));
    } finally {
      setIsVoting(false);
    }
  };

  useEffect(() => {
    const handleSwipeKeys = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      if (isVoting || newMatchInfo || showFilters || !users[0]) return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : 'superlike';
      handleVote(users[0].uid, direction);
    };
    window.addEventListener('keydown', handleSwipeKeys);
    return () => window.removeEventListener('keydown', handleSwipeKeys);
  }, [users, isVoting, newMatchInfo, showFilters, handleVote]);

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
      setSwipeError(getUserFriendlyError(err, 'Your last action could not be undone. Please try again.'));
    }
  };

  const handleApplyFilters = async (filters) => {
    const { preference = user?.preference || 'everyone', ...discoveryFilters } = filters;
    try {
      if (preference !== (user?.preference || 'everyone')) {
        const updatedProfile = await apiClient.put('/users/me', { preference });
        if (typeof setUser === 'function') {
          setUser(previous => ({ ...previous, ...updatedProfile, preference }));
        }
      }
      setActiveFilters({ ...discoveryFilters, preference });
      fetchUsersToSwipe(discoveryFilters);
      setShowFilters(false);
    } catch (err) {
      setSwipeError(getUserFriendlyError(err, 'We could not save your discovery preference. Please try again.'));
    }
  };

  const activeFilterCount = Object.entries(activeFilters).filter(([key, value]) => {
    if (key === 'minAge') return Number(value) !== 18;
    if (key === 'maxAge') return Number(value) !== 100;
    if (key === 'maxDistance') return Number(value) !== 100;
    return Boolean(value);
  }).length;

  if (isLoading) {
    return <DiscoverLoadingState />;
  }

  if (error) {
    return (
      <div className="discover-load-error" role="alert">
        <div className="discover-empty-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.3 3.9 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <p className="discover-empty-eyebrow">CONNECTION INTERRUPTED</p>
        <h2>We couldn't load profiles.</h2>
        <p>Please check your connection and try again. Your preferences are still here.</p>
        <button type="button" className="discover-refresh-button" onClick={() => fetchUsersToSwipe(activeFilters)}>
          Try again
        </button>
        <span className="discover-load-error__detail">{error}</span>
      </div>
    );
  }

  return (
    <div className="discover-page flex flex-col bg-neutral-50 dark:bg-neutral-900">
        {swipeError && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
            {swipeError}
          </div>
        )}
        <header className="discover-header discover-header-compact flex-shrink-0 flex justify-end items-center" aria-label="Discover controls">
            <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="filter-button discover-filter-icon-button"
                aria-label={activeFilterCount > 0 ? `Open filters, ${activeFilterCount} active` : 'Open filters'}
                title="Filters"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 6h16M7 12h10m-7 6h4" />
                    <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
                    <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
                </svg>
                {activeFilterCount > 0 && <span className="filter-count" aria-label={`${activeFilterCount} active filters`}>{activeFilterCount}</span>}
            </button>
        </header>

        <main className="discover-stage flex flex-grow flex-col items-center justify-center px-3 pt-2">
            <div className="discover-card-stack relative h-[min(66dvh,680px)] w-[min(90vw,410px)] max-w-full">
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
                        <NoMoreProfiles onRefresh={() => fetchUsersToSwipe(activeFilters)} />
                    )}
                </AnimatePresence>
            </div>
        </main>

        <footer className="discover-actions flex-shrink-0 px-4 pb-5 pt-2">
            {users.length > 0 && !newMatchInfo && (
                <div className="discover-action-row flex justify-center items-center my-4 space-x-4" aria-label="Profile actions">
                    <button
                        type="button"
                        title="Pass"
                        onClick={() => handleVote(users[0]?.uid, 'left')}
                        className="discover-action-button discover-action-pass p-4 bg-white rounded-full shadow-lg hover:bg-red-100 transition-all transform hover:scale-110"
                        aria-label="Pass"
                        disabled={!users[0] || isVoting}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        title="Super Like"
                        onClick={() => handleVote(users[0]?.uid, 'superlike')}
                        className="discover-action-button discover-action-superlike p-4 bg-white rounded-full shadow-lg hover:bg-blue-100 transition-all transform hover:scale-110"
                        aria-label="Super Like"
                        disabled={!users[0] || isVoting}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        title="Like"
                        onClick={() => handleVote(users[0]?.uid, 'right')}
                        className="discover-action-button discover-action-like p-5 bg-white rounded-full shadow-lg hover:bg-green-100 transition-all transform hover:scale-110"
                        aria-label="Like"
                        disabled={!users[0] || isVoting}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        title="Undo last swipe"
                        onClick={handleUndo}
                        disabled={isVoting}
                        className="discover-action-button discover-action-undo p-4 bg-white rounded-full shadow-lg hover:bg-yellow-100 transition-all transform hover:scale-110"
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
            <div
                className="discover-filter-overlay"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setShowFilters(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowFilters(false);
                }}
              >
                <Filter initialFilters={{ preference: user?.preference || 'everyone' }} onApply={handleApplyFilters} onClose={() => setShowFilters(false)} />
            </div>
        )}
    </div>
  );
};

export default SwipeDeck;
