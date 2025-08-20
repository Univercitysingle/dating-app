import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans">
      <main className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Welcome to FWB/Dating
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Find connections that matter. Whether you&apos;re looking for friends or something more.
        </p>
        <div className="flex gap-4">
          <Link href="/signup" className="px-6 py-3 bg-indigo-600 rounded-md font-semibold hover:bg-indigo-700 transition-colors">
            Sign Up
          </Link>
          <Link href="/login" className="px-6 py-3 bg-gray-700 rounded-md font-semibold hover:bg-gray-600 transition-colors">
            Log In
          </Link>
        </div>
      </main>
      <footer className="w-full p-4 text-center text-gray-500">
        <p>&copy; {new Date().getFullYear()} FWB/Dating. All rights reserved.</p>
      </footer>
    </div>
  );
}
