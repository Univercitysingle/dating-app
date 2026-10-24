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
      const data = await apiClient.get('/chat/conversations');
      if (Array.isArray(data)) {
        setConversations(data);
      } else {
        setConversations([]);
      }
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
    <div className="page-container conversations-page mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-6"><p className="page-eyebrow">STAY CONNECTED</p><h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Messages</h1><p className="mt-2 text-sm text-gray-500">Pick up where your conversations left off.</p></div>
      {isLoading && <p className="state-panel text-center">Loading your conversations…</p>}
      {error && <p className="state-panel state-error text-center" role="alert">{error}</p>}
      {!isLoading && !error && (
        <div className="conversation-list overflow-hidden rounded-2xl">
          {conversations.length > 0 ? (
            <div>
              {conversations.map((convo) => (
                <ConversationListItem key={convo.roomId} conversation={convo} />
              ))}
            </div>
          ) : (
            <div className="empty-state p-8 text-center"><p className="text-lg font-semibold text-gray-800">Your next connection starts here</p><p className="mt-2 text-sm text-gray-500">When you start chatting with someone, your conversations will appear here.</p></div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationsPage;
