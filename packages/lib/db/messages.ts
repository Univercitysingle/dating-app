import { collection, query, orderBy, limit, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { Message } from './models';

// Note: These functions are untested as the environment cannot install Firebase.

/**
 * Creates a reference to the messages subcollection for a given match.
 * @param matchId The ID of the match.
 * @returns A reference to the messages subcollection.
 */
const getMessagesCollectionRef = (matchId: string) => {
    return collection(db, 'matches', matchId, 'messages');
};

/**
 * Fetches the most recent messages for a given match.
 * @param matchId The ID of the match.
 * @param messageLimit The maximum number of messages to fetch.
 * @returns An array of message objects, sorted from oldest to newest.
 */
export const getMessages = async (matchId: string, messageLimit: number = 25): Promise<Message[]> => {
    const messagesCollection = getMessagesCollectionRef(matchId);
    const q = query(messagesCollection, orderBy('sentAt', 'desc'), limit(messageLimit));

    const querySnapshot = await getDocs(q);

    // The messages are fetched in reverse chronological order, so we reverse them back.
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)).reverse();
};

/**
 * Sends a new text message in a match.
 * @param matchId The ID of the match.
 * @param messageData The message content and sender ID.
 */
export const sendTextMessage = async (matchId: string, messageData: { text: string; sentBy: string }): Promise<void> => {
    const messagesCollection = getMessagesCollectionRef(matchId);
    await addDoc(messagesCollection, {
        ...messageData,
        sentAt: serverTimestamp(), // Use server-side timestamp
        readBy: [messageData.sentBy], // The sender has implicitly read the message
    });
    // In a real app, you would also update the parent match document's `lastMessageAt` field here.
};
