import { useEffect, useState } from 'react';
import { getDatabase, ref, get } from 'firebase/database';
import { database } from '../lib/firebase';
import useAuth from '../hooks/useAuth';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

interface UserProfile {
  id: string;
  displayName: string;
  bio: string;
  photos: string[];
}

const BrowsePage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user) return;

      console.log('Fetching users to browse...');
      const db = getDatabase();
      const usersRef = ref(db, 'users');

      const snapshot = await get(usersRef);
      if (snapshot.exists()) {
        const allUsersData = snapshot.val();
        const usersArray: UserProfile[] = Object.keys(allUsersData)
          .map(key => ({ id: key, ...allUsersData[key] }))
          .filter(u => u.id !== user.uid); // Filter out the current user

        setUsers(usersArray);
        console.log(`Found ${usersArray.length} other users.`);
      } else {
        console.log('No other users found in the database.');
      }
      setLoading(false);
    };

    if (user) {
      fetchUsers();
    }
  }, [user]);

  const handleSwipe = async (direction: 'like' | 'dislike', swipedUserId: string) => {
    if (!user) return;
    console.log(`User ${user.uid} swiped ${direction} on user ${swipedUserId}`);

    try {
      const db = getDatabase();
      // Record the swipe
      const swipeData = {
        swiperId: user.uid,
        swipedId: swipedUserId,
        direction,
        timestamp: serverTimestamp(),
      };
      // For simplicity, we're not using push here, but overwriting a path.
      // A real app might use push() for a list of swipes.
      // Example: users/{swiperId}/swipes/{swipedId}
      const swipeRef = ref(db, `swipes/${user.uid}/${swipedUserId}`);
      await set(swipeRef, swipeData);
      console.log('Swipe recorded successfully.');
    } catch (error) {
      console.error('Failed to record swipe:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading profiles...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-3xl font-bold mb-6">Browse Profiles</h1>
      <div className="w-full max-w-sm h-[600px]">
        {users.length > 0 ? (
          <Swiper
            modules={[Navigation]}
            navigation
            className="h-full w-full"
            loop
          >
            {users.map((profile) => (
              <SwiperSlide key={profile.id} className="relative rounded-lg overflow-hidden shadow-lg bg-gray-800">
                {profile.photos && profile.photos.length > 0 ? (
                  <img src={profile.photos[0]} alt={profile.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                    <p>No photo</p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <h2 className="text-2xl font-bold">{profile.displayName}</h2>
                  <p className="text-gray-300">{profile.bio}</p>
                </div>
                <div className="absolute bottom-4 right-4 flex gap-4">
                  <button onClick={() => handleSwipe('dislike', profile.id)} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-3xl">❌</button>
                  <button onClick={() => handleSwipe('like', profile.id)} className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-3xl">❤️</button>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          <p>No other users to show right now.</p>
        )}
      </div>
    </div>
  );
};

export default BrowsePage;
