import React from 'react';
import SwipeCard from '../components/SwipeCard';

const DebugSwipeCardPage = () => {
  const mockUser = {
    _id: '123',
    uid: 'test-user-id',
    name: 'Jessica',
    age: 28,
    photos: [{ url: 'https://images.pexels.com/photos/1043474/pexels-photo-1043474.jpeg' }],
    bio: 'I love hiking, trying new foods, and exploring the city. Looking for someone to share new adventures with!',
    interests: ['Hiking', 'Foodie', 'Traveling', 'Photography'],
    profilePrompts: [
        { prompt: 'A random fact I love is...', response: 'The Eiffel Tower can be 15 cm taller during the summer.' },
        { prompt: 'I\'m looking for...', response: 'Someone who is kind, funny, and adventurous.' }
    ],
    lifestyle: {
        pets: 'Dog',
        lookingFor: 'Long-term relationship',
        religion: 'Spiritual',
        politicalLeaning: 'Moderate',
    },
    badges: {
        height: '5\'7"',
        verified: true,
    },
    education: 'Bachelors Degree',
    relationshipGoals: 'Long-term relationship',
  };

  return (
    <div className="bg-gray-200 dark:bg-gray-800 min-h-screen flex items-center justify-center p-4">
      <div className="relative w-[90vw] h-[70vh] max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-4 dark:text-white absolute -top-12">Swipe Card Debug</h1>
        <SwipeCard
          user={mockUser}
          onVote={() => {}}
          onSwipe={() => {}}
        />
      </div>
    </div>
  );
};

export default DebugSwipeCardPage;