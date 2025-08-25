import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../api/apiClient';

const SwipeDeck = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const rawDataRef = useRef(null); // Ref to store raw data

  const fetchUsersToSwipe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/users/discover');
      rawDataRef.current = data; // Store data in ref
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
      <h1>Swipe Deck (Debug V2)</h1>
      <p>
        Result from API (via useRef): {rawDataRef.current ? `Array of length ${rawDataRef.current.length}` : 'null'}
      </p>
      <p>
        Result from React state (users): {users ? `Array of length ${users.length}` : 'null'}
      </p>
      <hr />
      <h2>Raw data from ref:</h2>
      <pre>{JSON.stringify(rawDataRef.current, null, 2)}</pre>
    </div>
  );
};

export default SwipeDeck;
