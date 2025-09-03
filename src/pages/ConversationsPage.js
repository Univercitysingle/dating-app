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

function ConversationsPage() {
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/api/chat/conversations');
      setConversations(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch conversations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchConversations();
    }
  }, [currentUser, fetchConversations]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Your Conversations</h1>
      {isLoading && <p className="text-center">Loading...</p>}
      {error && <p className="text-center text-red-500">{error}</p>}
      {!isLoading && !error && (
        <div>
          {conversations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {conversations.map((convo) => (
                <Link to={`/chat/${convo.roomId}`} key={convo.roomId}>
                  <UserCard user={convo.otherUser} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">You have no conversations yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationsPage;
