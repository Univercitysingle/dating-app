import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import MatchFilters from '../components/MatchFilters';
import InterstitialAd from '../components/InterstitialAd';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import NotificationItem from '../components/NotificationItem';
import { io } from 'socket.io-client';
import { API_URL } from '../utils/constants';

const UserCard = ({ user, onSwipe }) => {
    // ... (This component can be simplified or removed if not used)
    return (
        <div className="bg-white shadow-lg rounded-lg p-4 m-2 w-full md:w-1/2 lg:w-1/3 xl:w-1/4 flex flex-col">
          <h3 className="text-xl font-semibold text-gray-800">{user.name}, {user.age}</h3>
          {user.photos && user.photos.length > 0 && (
            <img src={user.photos[0]} alt={user.name} className="w-full h-48 object-cover rounded-md my-2"/>
          )}
          <p className="text-gray-600 text-sm flex-grow">{user.bio ? user.bio.substring(0, 100) + '...' : 'No bio yet.'}</p>
        </div>
        );
  };


function MatchesPage() {
  const { user: currentUser } = useAuth();
  const [matches, setMatches] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterParams, setFilterParams] = useState({});
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/matches');
      setMatches(data.matches || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch matches.');
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiClient.get('/api/notifications');
      setNotifications(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch notifications.');
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      setIsLoading(true);
      Promise.all([fetchMatches(), fetchNotifications()]).finally(() => setIsLoading(false));
    }
  }, [currentUser, fetchMatches, fetchNotifications]);

  useEffect(() => {
    if (!currentUser) return;

    const token = localStorage.getItem("authToken");
    if (!token) return;

    socketRef.current = io(API_URL, {
      auth: { token },
    });

    socketRef.current.on('new_notification', (notification) => {
      setNotifications((prev) => [notification, ...prev]);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [currentUser]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Matches & Likes</h1>

      {isLoading && <p className="text-center text-gray-600 py-4">Loading...</p>}
      {error && <p className="text-center text-red-500 py-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">New Likes</h2>
            {notifications.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {notifications.map((notification) => (
                  <NotificationItem key={notification._id} notification={notification} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500">You have no new likes.</p>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Your Matches</h2>
            {matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches.map((match) => (
                  <Link to={`/chat/${match._id}`} key={match._id}>
                    <UserCard user={match.user} onSwipe={() => {}} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">You have no matches yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default MatchesPage;
