import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { Match } from './models';

// Note: These functions are untested as the environment cannot install Firebase.

const matchesCollectionRef = collection(db, 'matches');

/**
 * Fetches all matches for a given user, ordered by the most recent message.
 * @param uid The user's unique ID.
 * @returns An array of match objects.
 */
export const getUserMatches = async (uid: string): Promise<Match[]> => {
    // This query uses the composite index we defined in firestore.indexes.json
    const q = query(
        matchesCollectionRef,
        where('users', 'array-contains', uid),
        orderBy('lastMessageAt', 'desc')
    );

    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
};

/**
 * Fetches a single match by its ID.
 * @param matchId The ID of the match.
 * @returns The match object, or null if not found.
 */
export const getMatchById = async (matchId: string): Promise<Match | null> => {
    const matchDocRef = doc(matchesCollectionRef, matchId);
    const matchDocSnap = await getDoc(matchDocRef);

    if (matchDocSnap.exists()) {
        return { id: matchDocSnap.id, ...matchDocSnap.data() } as Match;
    } else {
        return null;
    }
};
