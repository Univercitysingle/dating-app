import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import ConversationListItem from '../components/ConversationListItem';

function ConversationsPage() {
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/chat/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to fetch conversations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) fetchConversations();
  }, [currentUser, fetchConversations]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const name = conversation.otherUser?.name || '';
      const message = conversation.lastMessage?.messageContent || '';
      return `${name} ${message}`.toLocaleLowerCase().includes(query);
    });
  }, [conversations, search]);

  return (
    <section className="inbox-page mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-7">
      <div className="inbox-heading flex items-center justify-between gap-4">
        <div>
          <p className="page-eyebrow">YOUR CONNECTIONS</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Messages</h1>
          <p className="mt-1 text-sm text-gray-500">Every good connection starts with a conversation.</p>
        </div>
        <button type="button" onClick={fetchConversations} disabled={isLoading} className="inbox-refresh" aria-label="Refresh conversations" title="Refresh conversations">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 9a6.5 6.5 0 0 1 10.8-2L20 12M4 12l3.1 5a6.5 6.5 0 0 0 10.8-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <div className="inbox-workspace mt-5 sm:mt-7">
        <aside className="inbox-sidebar">
          <div className="inbox-sidebar-header">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">Chats</h2>
              <span className="inbox-count">{conversations.length}</span>
            </div>
            <label className="inbox-search mt-4">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button>}
            </label>
          </div>

          {isLoading && <div className="inbox-state"><span className="inbox-spinner" />Loading conversations…</div>}
          {error && <div className="state-panel state-error mx-4 my-4 text-sm" role="alert">{error}<button type="button" onClick={fetchConversations} className="ml-2 font-semibold underline">Retry</button></div>}
          {!isLoading && !error && filteredConversations.length > 0 && (
            <div className="inbox-conversation-list">
              {filteredConversations.map((conversation) => <ConversationListItem key={conversation.roomId} conversation={conversation} />)}
            </div>
          )}
          {!isLoading && !error && filteredConversations.length === 0 && (
            <div className="inbox-empty">
              <span className="inbox-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.6-4.1A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
              </span>
              <h3>{search ? 'No matching chats' : 'Your story starts here'}</h3>
              <p>{search ? 'Try another name or search term.' : 'When you connect with someone, your conversations will show up here.'}</p>
              {search ? <button type="button" onClick={() => setSearch('')} className="inbox-text-action">Clear search</button> : <Link to="/discover" className="inbox-text-action">Discover people</Link>}
            </div>
          )}
        </aside>

        <main className="inbox-welcome hidden md:flex">
          <div className="inbox-welcome-art" aria-hidden="true">
            <div className="inbox-art-orbit inbox-art-orbit-one" />
            <div className="inbox-art-orbit inbox-art-orbit-two" />
            <div className="inbox-art-heart">♡</div>
            <div className="inbox-art-spark inbox-art-spark-one">✦</div>
            <div className="inbox-art-spark inbox-art-spark-two">✧</div>
          </div>
          <h2>Make room for a little connection.</h2>
          <p>Select a conversation to pick up where you left off, or meet someone new.</p>
          <Link to="/discover" className="app-primary-button inbox-discover-button">Discover people</Link>
          <span className="inbox-privacy-note"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> A little kindness goes a long way</span>
        </main>
      </div>
    </section>
  );
}

export default ConversationsPage;
