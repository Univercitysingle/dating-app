import { useState, useCallback } from 'react';
import apiClient from '../api/apiClient';

export const useUsers = () => {
  const [usersToSwipe, setUsersToSwipe] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsersToSwipe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/api/users/discover');
      setUsersToSwipe(data || []);
    } catch (err) {
      console.error('Error fetching users for swipe deck:', err);
      let errorMessage = 'Failed to load users. Please try again later.';
      if (err.response && err.response.status === 401) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (err.response) {
        errorMessage = `An error occurred: ${err.response.data.message || 'Server error'}`;
      }
      setError(errorMessage);
      setUsersToSwipe([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const retry = () => {
    fetchUsersToSwipe();
  };

  return {
    usersToSwipe,
    isLoading,
    error,
    fetchUsersToSwipe,
    setUsersToSwipe,
    retry,
  };
};
