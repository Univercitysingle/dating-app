import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getDatabase, ref, get } from 'firebase/database';
import { database } from '../../lib/firebase';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import useAuth from '../../hooks/useAuth';
import Link from 'next/link';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface UserProfile {
    displayName: string;
    bio: string;
    email: string;
    photos: string[];
    createdAt: number;
    interests: string[];
}

const UserProfilePage = () => {
  const router = useRouter();
  const { userId } = router.query;
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (typeof userId !== 'string') {
        return;
      }
      try {
        setLoading(true);
        const userRef = ref(database, 'users/' + userId);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          setProfile(snapshot.val());
        } else {
          setError('User not found.');
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
        setError('Failed to fetch user profile.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation
        pagination={{ clickable: true }}
        className="h-full"
      >
        {profile?.photos?.map((photo: string) => (
          <SwiperSlide key={photo}>
            <img
              src={photo}
              alt="Profile"
              className="object-cover w-full h-full"
            />
          </SwiperSlide>
        ))}
      </Swiper>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/70 to-transparent text-white">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold">{profile?.displayName || 'Unnamed User'}</h1>
            <p className="mt-2 text-lg">{profile?.bio}</p>
            {profile?.interests && profile.interests.length > 0 && (
              <div className="mt-4">
                <h2 className="text-lg font-semibold">Interests</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.interests.map((interest) => (
                    <span
                      key={interest}
                      className="px-3 py-1 bg-white/20 rounded-full text-sm"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {currentUser && currentUser.uid === userId && (
            <Link href="/profile/edit" className="px-4 py-2 bg-white/20 backdrop-blur-md rounded-lg font-semibold">
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      <div className="absolute bottom-20 right-4 flex flex-col gap-4">
        <button className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-2xl">❤️</button>
        <button className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-2xl">⭐</button>
      </div>
    </div>
  );
};

export default UserProfilePage;
