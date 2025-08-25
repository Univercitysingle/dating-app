import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/apiClient';

const SwipeDeck = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsersToSwipe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
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

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {JSON.stringify(error)}</div>;
  }

  return (
    <div>
      <h1>Swipe Deck (Debug)</h1>
      <p>Number of users found: {users.length}</p>
      <pre>{JSON.stringify(users, null, 2)}</pre>
    </div>
  );
};

export default SwipeDeck;
