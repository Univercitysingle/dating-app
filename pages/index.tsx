import Link from 'next/link';
import useAuth from '../hooks/useAuth';
import { getAuth, signOut } from 'firebase/auth';
import { useRouter } from 'next/router';
import ProfilePhotoUpload from '../components/ProfilePhotoUpload';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const auth = getAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans">
      <main className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Welcome to FWB/Dating
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Find connections that matter. Whether you&apos;re looking for friends or something more.
        </p>
        <div className="flex flex-col items-center gap-4">
          {user ? (
            <div className="w-full max-w-md">
              <div className="flex items-center justify-center gap-4 mb-8">
                <p className="text-lg">Welcome, {user.email}</p>
                <button
                  onClick={handleLogout}
                  className="px-6 py-3 bg-red-600 rounded-md font-semibold hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
              <ProfilePhotoUpload />
            </div>
          ) : (
            <div className="flex gap-4">
              <Link href="/signup" className="px-6 py-3 bg-indigo-600 rounded-md font-semibold hover:bg-indigo-700 transition-colors">
                Sign Up
              </Link>
              <Link href="/login" className="px-6 py-3 bg-gray-700 rounded-md font-semibold hover:bg-gray-600 transition-colors">
                Log In
              </Link>
            </div>
          )}
        </div>
      </main>
      <footer className="w-full p-4 text-center text-gray-500">
        <p>&copy; {new Date().getFullYear()} FWB/Dating. All rights reserved.</p>
      </footer>
    </div>
  );
}
