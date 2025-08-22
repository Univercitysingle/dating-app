import { useState, useEffect } from 'react';
import useAuth from '../../hooks/useAuth';
import { useRouter } from 'next/router';
import { getDatabase, ref, get, update } from 'firebase/database';
import { database } from '../../lib/firebase';
import ProfilePhotoUpload from '../../components/ProfilePhotoUpload';

interface UserProfile {
    displayName: string;
    bio: string;
    photos: string[];
}

const EditProfilePage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        const userRef = ref(database, 'users/' + user.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const userData: UserProfile = snapshot.val();
          setDisplayName(userData.displayName || '');
          setBio(userData.bio || '');
          setPhotos(userData.photos || []);
        }
      }
    };
    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setStatus('saving');
    try {
      const userRef = ref(database, 'users/' + user.uid);
      await update(userRef, {
        displayName,
        bio,
      });
      setStatus('success');
    } catch (error) {
      console.error('Error updating profile:', error);
      setStatus('error');
    }
  };

  const handlePhotoUploadSuccess = async (url: string) => {
    if (!user) return;
    try {
      const userRef = ref(database, 'users/' + user.uid);
      // Realtime Database doesn't have arrayUnion, so we read, update, and write.
      const newPhotos = [...photos, url];
      await update(userRef, {
        photos: newPhotos,
      });
      setPhotos(newPhotos);
    } catch (error) {
      console.error('Error adding photo to profile:', error);
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!user) {
    // Redirect to login if not authenticated
    router.push('/login');
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans p-4">
      <div className="w-full max-w-2xl p-8 space-y-6 bg-gray-800 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center">Edit Profile</h1>
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label
              htmlFor="displayName"
              className="block mb-2 text-sm font-medium"
            >
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="bio" className="block mb-2 text-sm font-medium">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="px-6 py-2 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {status === 'saving' ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
          {status === 'success' && (
            <p className="text-green-500">Profile saved successfully!</p>
          )}
          {status === 'error' && (
            <p className="text-red-500">
              Failed to save profile. Please try again.
            </p>
          )}
        </form>

        <div className="pt-6 border-t border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Your Photos</h2>
          <div className="grid grid-cols-3 gap-4">
            {photos.map((photoUrl) => (
              <div key={photoUrl} className="relative aspect-square">
                <img
                  src={photoUrl}
                  alt="Profile photo"
                  className="object-cover w-full h-full rounded-md"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-gray-700">
          <ProfilePhotoUpload onUploadSuccess={handlePhotoUploadSuccess} />
        </div>
      </div>
    </div>
  );
};

export default EditProfilePage;
