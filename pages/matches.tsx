import { useEffect, useState } from 'react';
import { getDatabase, ref, get, query, orderByChild, equalTo, startAt, endAt } from 'firebase/database';
import useAuth from '../hooks/useAuth';
import Link from 'next/link';

interface MatchProfile {
  matchId: string;
  id: string;
  displayName: string;
  photos: string[];
}

const MatchesPage = () => {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      console.log('Fetching matches for user:', user.uid);
      const db = getDatabase();
      const matchesRef = ref(db, 'matches');

      // Query for matches where the user's ID is present.
      // This is not perfectly efficient as we query all matches and filter client-side,
      // but it's the simplest approach without complex data duplication.
      // A more scalable solution would involve creating a "userMatches" node for each user.
      const snapshot = await get(matchesRef);

      if (snapshot.exists()) {
        const allMatches = snapshot.val();
        const userMatchIds = Object.keys(allMatches).filter(key => key.includes(user.uid));

        const matchPromises = userMatchIds.map(async (matchId) => {
          const matchData = allMatches[matchId];
          const otherUserId = matchData.users.find((id: string) => id !== user.uid);

          if (otherUserId) {
            const userRef = ref(db, `users/${otherUserId}`);
            const userSnapshot = await get(userRef);
            if (userSnapshot.exists()) {
              return {
                matchId,
                id: otherUserId,
                ...userSnapshot.val(),
              };
            }
          }
          return null;
        });

        const resolvedMatches = (await Promise.all(matchPromises)).filter(Boolean) as MatchProfile[];
        setMatches(resolvedMatches);
        console.log(`Found ${resolvedMatches.length} matches.`);
      } else {
        console.log('No matches found.');
      }
      setLoading(false);
    };

    fetchMatches();
  }, [user]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading your matches...</div>;
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-3xl font-bold my-6">Your Matches</h1>
      <div className="w-full max-w-lg space-y-4">
        {matches.length > 0 ? (
          matches.map((match) => (
            <Link key={match.id} href={`/chat/${match.matchId}`} className="block">
              <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                <img
                  src={match.photos?.[0] || 'https://via.placeholder.com/150'}
                  alt={match.displayName}
                  className="w-16 h-16 rounded-full object-cover"
                />
                <h2 className="text-xl font-semibold">{match.displayName}</h2>
              </div>
            </Link>
          ))
        ) : (
          <p>You have no matches yet. Keep swiping!</p>
        )}
      </div>
    </div>
  );
};

export default MatchesPage;
