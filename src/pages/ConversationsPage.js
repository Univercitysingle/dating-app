import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

import ConversationListItem from '../components/ConversationListItem';

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
        <div className="bg-white shadow-lg rounded-lg">
          {conversations.length > 0 ? (
            <div>
              {conversations.map((convo) => (
                <ConversationListItem key={convo.roomId} conversation={convo} />
              ))}
            </div>
          ) : (
            <p className="p-4 text-gray-500">You have no conversations yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationsPage;
