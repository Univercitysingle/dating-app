import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

const UserCard = ({ user }) => (
    <div className="bg-white shadow-lg rounded-lg p-4 m-2 flex flex-col">
      <h3 className="text-xl font-semibold text-gray-800">{user.name}, {user.age}</h3>
      {user.photos && user.photos.length > 0 && (
        <img src={user.photos[0]?.url || 'https://via.placeholder.com/150'} alt={user.name} className="w-full h-48 object-cover rounded-md my-2"/>
      )}
      <p className="text-gray-600 text-sm flex-grow">{user.bio ? user.bio.substring(0, 100) + '...' : 'No bio yet.'}</p>
    </div>
);

function MatchesPage() {
  const { user: currentUser } = useAuth();
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/api/matches/confirmed');
      setMatches(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch matches.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchMatches();
    }
  }, [currentUser, fetchMatches]);

  const getChatId = (targetUid) => {
    if (!currentUser || !currentUser.uid) return null;
    return [currentUser.uid, targetUid].sort().join('-');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Your Matches</h1>
      {isLoading && <p className="text-center">Loading...</p>}
      {error && <p className="text-center text-red-500">{error}</p>}
      {!isLoading && !error && (
        <div>
          {matches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.map((match) => {
                const chatId = getChatId(match.uid);
                return (
                  <Link to={chatId ? `/chat/${chatId}` : '#'} key={match.uid}>
                    <UserCard user={match} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500">You have no matches yet. Keep swiping!</p>
          )}
        </div>
      )}
    </div>
  );
}

export default MatchesPage;
