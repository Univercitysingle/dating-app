import { doc, getDoc, setDoc, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { UserProfile } from './models';

// Note: These functions are untested as the environment cannot install Firebase.

const usersCollectionRef = collection(db, 'users');

/**
 * Fetches a user's profile from Firestore.
 * @param uid The user's unique ID.
 * @returns The user profile object, or null if not found.
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDocRef = doc(usersCollectionRef, uid);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    // Note: In a real app, you'd want data validation here (e.g., with Zod).
    return userDocSnap.data() as UserProfile;
  } else {
    return null;
  }
};

/**
 * Creates a new user profile document in Firestore.
 * @param uid The user's unique ID.
 * @param data The user profile data (without the uid).
 */
export const createUserProfile = async (uid: string, data: Omit<UserProfile, 'uid'>): Promise<void> => {
  const userDocRef = doc(usersCollectionRef, uid);
  const newUserProfile: UserProfile = {
      uid,
      ...data,
  };
  // Using setDoc to create the document with a specific ID.
  await setDoc(userDocRef, newUserProfile);
};

/**
 * Updates an existing user profile document in Firestore.
 * @param uid The user's unique ID.
 * @param data The partial data to update.
 */
export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
    const userDocRef = doc(usersCollectionRef, uid);
    // Using updateDoc for partial updates.
    await updateDoc(userDocRef, data);
};
