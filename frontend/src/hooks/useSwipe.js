import { useState } from 'react';
import apiClient from '../api/apiClient';

export const useSwipe = () => {
  const [lastDirection, setLastDirection] = useState(null);
  const [newMatchInfo, setNewMatchInfo] = useState(null);

  const onSwipe = async (direction, swipedUserId) => {
    setLastDirection(direction);
    setNewMatchInfo(null);

    try {
      const response = await apiClient.post('/api/swipes', {
        targetUserId: swipedUserId,
        direction: direction,
      });

      if (response && response.match) {
        setNewMatchInfo(
          response.matchedUser || { id: swipedUserId, name: 'Your New Match!' }
        );
      }
    } catch (swipeError) {
      console.error('Error recording swipe:', swipeError);
    }
  };

  return { lastDirection, newMatchInfo, onSwipe, setNewMatchInfo };
};
